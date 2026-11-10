import "server-only";
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { getAccount } from "@/server/auth/account";
import { createClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { createAccountingStore } from "@/server/llm/accounting";
import { createLlmBoundary } from "@/server/llm/boundary";
import { captureSummary } from "@/server/llm/summary-snapshot";
import { ceilings } from "@/server/llm/config";
import { errorCode, fail } from "@/server/llm/errors";
import { validateOutput } from "@/server/llm/contracts";
import { matchesRequestOrigin, matchesWorkspaceAccount, readRequestBody } from "@/server/learner/submissions";
import { summaryRecordSchema, type SummaryGenerationResult, type SummaryReadResult } from "@/lib/ta/summaries";
async function caller() {
  try {
    const client = await createClient(), account = await getAccount(undefined, client);
    if (account.status === "unauthenticated") return { status: "unauthenticated" } as const;
    if (account.status === "forbidden") return { status: "account_unavailable" } as const;
    if (account.status !== "ok") return { status: "account_service_unavailable" } as const;
    if (account.account.role !== "ta") return { status: "role_denied" } as const;
    return { status: "ok", client, account: account.account } as const;
  } catch { return { status: "account_service_unavailable" } as const; }
}
async function identity(client: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data, error } = await client.rpc("read_ta_learner", { p_learner_id: id });
  if (error) fail("SERVICE_UNAVAILABLE");
  const value = z.union([z.object({ status: z.literal("ok"), learner: z.object({ id: z.uuid(), displayName: z.string() }) }), z.object({ status: z.enum(["forbidden", "not_found"]) })]).parse(data);
  return value.status === "ok" ? { status: "ok" } as const : { status: value.status === "forbidden" ? "role_denied" : "not_found" } as const;
}
export async function readLearnerSummary(id: string, search = new URLSearchParams()): Promise<SummaryReadResult> {
  const access = await caller(); if (access.status !== "ok") return access;
  if (!z.uuid().safeParse(id).success || search.size) return { status: "invalid" };
  try {
    const learner = await identity(access.client, id); if (learner.status !== "ok") return learner;
    const result = await access.client.from("performance_summaries").select("id,learner_id,created_at,input_fingerprint,output").eq("learner_id", id).order("created_at", { ascending: false }).order("id").limit(1);
    if (result.error) throw result.error;
    const row = result.data?.[0]; if (!row) return { status: "ok", summary: null, stale: false };
    const summary = summaryRecordSchema.parse({ id: row.id, learnerId: row.learner_id, createdAt: row.created_at, inputFingerprint: row.input_fingerprint, output: row.output });
    const current = await captureSummary(access.client, id, true);
    return { status: "ok", summary, stale: summary.inputFingerprint !== current.fingerprint };
  } catch { return { status: "unavailable" }; }
}
const persistedSchema = z.discriminatedUnion("status", [z.strictObject({ status: z.literal("started") }), z.strictObject({ status: z.literal("pending") }), z.strictObject({ status: z.literal("failed"), code: z.string() }), z.strictObject({ status: z.literal("completed"), summary: summaryRecordSchema })]);
export async function requestLearnerSummary(id: string, request: Request): Promise<SummaryGenerationResult> {
  const access = await caller(); if (access.status !== "ok") return access;
  const url = new URL(request.url);
  if (!request.headers.get("Origin") || !matchesRequestOrigin(request, url)) return { status: "role_denied" };
  if (!matchesWorkspaceAccount(request, access.account.id)) return { status: "account_unavailable" };
  const key = z.uuid().safeParse(request.headers.get("Idempotency-Key"));
  if (!key.success || !z.uuid().safeParse(id).success || url.searchParams.size) return { status: "invalid" };
  const body = await readRequestBody(request, 131072);
  if (body.status === "too_large") return { status: "failed", code: "PAYLOAD_TOO_LARGE" };
  if (body.status !== "ok" || !z.strictObject({}).safeParse(body.value).success) return { status: "invalid" };
  try {
    const learner = await identity(access.client, id); if (learner.status !== "ok") return learner;
    const captured = await captureSummary(access.client, id);
    const admin = createAdminClient();
    const args = { accountId: access.account.id, learnerId: id, idempotencyKey: key.data };
    async function persist(input: Record<string, unknown>) {
      const result = await admin.rpc("persist_ta_summary", { p_input: { ...args, ...input } as Json });
      if (result.error) fail(errorCode({ code: result.error.message }));
      return persistedSchema.parse(result.data);
    }
    const started = await persist({ action: "claim" });
    if (started.status === "completed") return { status: "ok", summary: started.summary };
    if (started.status === "failed") return started;
    if (started.status === "pending") return { status: "failed", code: "INVALID_STATE" };
    async function failure(code: string): Promise<SummaryGenerationResult> {
      const recorded = await persist({ action: "fail", code });
      if (recorded.status === "completed") return { status: "ok", summary: recorded.summary };
      return { status: "failed", code: recorded.status === "failed" ? recorded.code : "SERVICE_UNAVAILABLE" };
    }
    try {
      const clock = Date.now, env = process.env;
      const store = createAccountingStore({ clock, limits: ceilings, environmentId: env.APP_ENV ?? "unconfigured" });
      let operationId: string | undefined;
      const accounting = { ...store,
        reserve: async (input: Parameters<typeof store.reserve>[0]) => { const admission = await store.reserve(input); operationId = admission.operationId; return admission; },
        settle: async (input: Parameters<typeof store.settle>[0]) => { try { await store.settle(input); } catch (error) { if (errorCode(error) === "INVALID_STATE") fail("AI_TIMEOUT"); throw error; } },
      };
      const generated = await createLlmBoundary({ client: access.client, accounting, clock, limits: ceilings, env }).execute({ operation: "summarize_learner", resourceId: id, idempotencyKey: key.data });
      if (!generated.data || generated.data.operation !== "summarize_learner") return failure("error" in generated ? generated.error.code : "INVALID_STATE");
      // Validate against the caller's original capture as well as the boundary's
      // capture. Only this validated result reaches the atomic admin transaction.
      validateOutput(captured.snapshot, generated.data, { retainedFlaws: [] });
      if (clock() >= generated.meta.deadline) return failure("AI_TIMEOUT");
      const account = await getAccount(undefined, access.client);
      if (account.status === "unauthenticated") return { status: "unauthenticated" };
      if (account.status === "unavailable") return { status: "account_service_unavailable" };
      if (account.status !== "ok" || account.account.id !== access.account.id || account.account.role !== "ta") return { status: "account_unavailable" };
      const saved = await persist({ action: "complete", operationId, inputFingerprint: captured.fingerprint, snapshot: captured.snapshot, output: generated.data.payload });
      return saved.status === "completed" ? { status: "ok", summary: saved.summary } : { status: "failed", code: saved.status === "failed" ? saved.code : "SERVICE_UNAVAILABLE" };
    } catch (error) { return await failure(errorCode(error)); }
  } catch (error) { return { status: "failed", code: errorCode(error) }; }
}
