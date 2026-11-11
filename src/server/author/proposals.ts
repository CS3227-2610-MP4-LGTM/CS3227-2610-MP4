import "server-only";
import { z } from "zod";
import { authorBodyLimit, type AuthorDraft } from "@/lib/author/drafts";
import { buildFinalPreview, type FinalPreview } from "@/lib/author/preview";
import type { Json } from "@/lib/supabase/database.types";
import { readJsonBody } from "@/server/http/request";
import { createAccountingStore } from "@/server/llm/accounting";
import { createLlmBoundary } from "@/server/llm/boundary";
import { ceilings } from "@/server/llm/config";
import { assembleCandidate, type Proposal } from "@/server/llm/contracts";
import { errorCode, fail } from "@/server/llm/errors";
import { createAdminClient } from "@/server/supabase/admin";
import { authorCaller, type AuthorClient } from "./access";
import {
  confirmedDraft, loadDraft, ownChallenge, rpcFailure, writeGuard, type AuthorFailure, type DraftResult,
} from "./drafts";
import { challengeIdSchema } from "./validation";

/** A recorded generation failure carries its INTEGRATION-SPEC §3 error code. */
export type GenerationOutcome = DraftResult | { status: "failed"; code: string };
export type PreviewOutcome =
  | { status: "ok"; preview: { draftVersion: number } & FinalPreview }
  | { status: "incomplete" }
  | AuthorFailure;

const version = z.number().int().positive().max(2_147_483_647);
const generationBody = z.strictObject({ expectedRowVersion: version, expectedDraftVersion: version });
const decisionBody = z.strictObject({
  expectedRowVersion: version, expectedDraftVersion: version, decision: z.enum(["approved", "rejected"]),
});
const persistedSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("started") }),
  z.strictObject({ status: z.literal("pending") }),
  z.strictObject({ status: z.literal("failed"), code: z.string() }),
  z.strictObject({ status: z.literal("completed"), challengeId: z.uuid() }),
]);
const decisionResultSchema = z.union([
  z.strictObject({ status: z.literal("ok"), challengeId: z.uuid() }),
  z.strictObject({ status: z.enum(["invalid", "forbidden", "not_found", "version_conflict", "invalid_state"]) }),
]);

/** Shared preconditions for the two T-21 writes; the result is null when the request may proceed. */
export async function writeRequest<T>(id: string, request: Request, schema: z.ZodType<T>) {
  const caller = await authorCaller();
  if (caller.status !== "ok") return { failure: caller } as const;
  const guard = writeGuard(request, caller);
  if (guard) return { failure: guard } as const;
  const challengeId = challengeIdSchema.safeParse(id);
  if (!challengeId.success || new URL(request.url).searchParams.size) return { failure: { status: "invalid" } } as const;
  const raw = await readJsonBody(request, authorBodyLimit);
  if (raw.status !== "ok") return { failure: raw } as const;
  const body = schema.safeParse(raw.value);
  if (!body.success) return { failure: { status: "invalid" } } as const;
  return { caller, challengeId: challengeId.data, body: body.data } as const;
}

/**
 * AUT-03: generates one validated proposal set for the caller's own editable
 * draft. Authorization, ownership, state and versions are checked before any
 * reservation; the result is persisted only through the SYS-10.3 admin function.
 */
export async function generateAuthorProposals(id: string, request: Request): Promise<GenerationOutcome> {
  const key = challengeIdSchema.safeParse(request.headers.get("Idempotency-Key"));
  const parsed = await writeRequest(id, request, generationBody);
  if ("failure" in parsed) return parsed.failure as AuthorFailure;
  if (!key.success) return { status: "invalid" };
  const { caller, challengeId, body } = parsed;

  try {
    const denied = await ownChallenge(caller, challengeId);
    if (denied) return denied;
  } catch {
    return { status: "unavailable" };
  }

  try {
    const admin = createAdminClient();
    const args = {
      accountId: caller.account.id, challengeId, idempotencyKey: key.data,
      requestFingerprint: JSON.stringify([body.expectedRowVersion, body.expectedDraftVersion]),
    };
    async function persist(input: Record<string, unknown>) {
      const result = await admin.rpc("persist_author_proposals", { p_input: { ...args, ...input } as Json });
      if (result.error) fail(errorCode({ code: result.error.message }));
      return persistedSchema.parse(result.data);
    }
    async function settled(result: z.infer<typeof persistedSchema>): Promise<GenerationOutcome> {
      if (result.status === "completed") return confirmedDraft(caller, challengeId);
      if (result.status === "failed") return { status: "failed", code: result.code };
      return { status: "in_progress" };
    }
    async function failure(code: string): Promise<GenerationOutcome> {
      try {
        return await settled(await persist({ action: "fail", code }));
      } catch {
        return { status: "uncertain" };
      }
    }

    const claimed = await persist({ action: "claim" });
    if (claimed.status !== "started") return settled(claimed);

    try {
      const draft = await loadDraft(caller.client, caller.account.id, challengeId);
      if (!draft) return failure("NOT_FOUND");
      if (draft.status === "archived") return failure("INVALID_STATE");
      if (draft.rowVersion !== body.expectedRowVersion || draft.draftVersion !== body.expectedDraftVersion) {
        return failure("VERSION_CONFLICT");
      }

      const clock = Date.now;
      const env = process.env;
      const store = createAccountingStore({ clock, limits: ceilings, environmentId: env.APP_ENV ?? "unconfigured" });
      let operationId: string | undefined;
      const accounting = {
        ...store,
        reserve: async (input: Parameters<typeof store.reserve>[0]) => {
          const admission = await store.reserve(input);
          operationId = admission.operationId;
          return admission;
        },
        settle: async (input: Parameters<typeof store.settle>[0]) => {
          try {
            await store.settle(input);
          } catch (error) {
            // A rejected settlement after operation expiry is a late result.
            if (errorCode(error) === "INVALID_STATE") fail("AI_TIMEOUT");
            throw error;
          }
        },
      };
      const generated = await createLlmBoundary({ client: caller.client, accounting, clock, limits: ceilings, env }).execute({
        operation: "inject_flaws", resourceId: challengeId, idempotencyKey: key.data, expectedVersion: draft.draftVersion,
      });
      if (!generated.data || generated.data.operation !== "inject_flaws") {
        return failure("error" in generated ? generated.error.code : "INVALID_STATE");
      }
      if (clock() >= generated.meta.deadline) return failure("AI_TIMEOUT");

      // Recheck the stored role before the privileged write; never replay on account changes.
      // A refused recheck is recorded as a confirmed failure so replays never wait for expiry (SEC-05.3).
      const current = await authorCaller();
      if (current.status !== "ok" || current.account.id !== caller.account.id) {
        await failure("FORBIDDEN");
        return current.status !== "ok" ? current : { status: "account_unavailable" };
      }

      const saved = await persist({
        action: "complete", operationId, expectedRowVersion: draft.rowVersion, expectedDraftVersion: draft.draftVersion,
        snapshot: injectionSnapshot(draft), proposals: generated.data.payload.proposals,
      });
      return settled(saved);
    } catch (error) {
      return failure(errorCode(error));
    }
  } catch (error) {
    const code = errorCode(error);
    return code === "SERVICE_UNAVAILABLE" ? { status: "uncertain" } : { status: "failed", code };
  }
}

/** The exact inject_flaws input captured from the saved draft (INTEGRATION-SPEC §4). */
function injectionSnapshot(draft: AuthorDraft) {
  return {
    schemaVersion: 1, operation: "inject_flaws",
    payload: {
      language: draft.language, difficulty: draft.difficulty, workingCode: draft.workingCode,
      flawCount: draft.flawCount, categories: draft.categories,
    },
  };
}

/** AUT-04.2: saves one decision on the active set through the user-scoped function. */
export async function decideAuthorProposal(id: string, proposalId: string, request: Request): Promise<DraftResult> {
  const proposal = challengeIdSchema.safeParse(proposalId);
  const parsed = await writeRequest(id, request, decisionBody);
  if ("failure" in parsed) return parsed.failure as AuthorFailure;
  if (!proposal.success) return { status: "invalid" };
  const { caller, challengeId, body } = parsed;

  try {
    const denied = await ownChallenge(caller, challengeId);
    if (denied) return denied;
  } catch {
    return { status: "unavailable" };
  }
  try {
    const { data, error } = await caller.client.rpc("decide_author_proposal", {
      p_challenge_id: challengeId, p_proposal_id: proposal.data, p_payload: body as Json,
    });
    if (error) return rpcFailure(error);
    const result = decisionResultSchema.parse(data);
    if (result.status !== "ok") return { status: result.status };
    return confirmedDraft(caller, challengeId);
  } catch {
    return { status: "uncertain" };
  }
}

/** AUT-04.4: the server-assembled final candidate for the latest saved decisions. */
export async function readAuthorPreview(id: string, search = new URLSearchParams()): Promise<PreviewOutcome> {
  const caller = await authorCaller();
  if (caller.status !== "ok") return caller;
  const challengeId = challengeIdSchema.safeParse(id);
  if (!challengeId.success || search.size) return { status: "invalid" };
  try {
    const denied = await ownChallenge(caller, challengeId.data);
    if (denied) return denied;
    // The draft, proposals and decisions are separate reads; a decision saved between them
    // increments draftVersion, so a matching reread proves the snapshot is consistent.
    for (let attempt = 0; attempt < previewReadAttempts; attempt++) {
      const draft = await loadDraft(caller.client, caller.account.id, challengeId.data);
      if (!draft) return { status: "not_found" };
      const outcome = assemblePreview(draft);
      if (outcome.status !== "ok") return outcome;
      if (await currentDraftVersion(caller.client, challengeId.data) === draft.draftVersion) return outcome;
    }
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

const previewReadAttempts = 3;

async function currentDraftVersion(client: AuthorClient, id: string) {
  const { data, error } = await client.from("challenge_drafts").select("draft_version").eq("challenge_id", id).maybeSingle();
  if (error) throw error;
  return data?.draft_version ?? null;
}

function assemblePreview(draft: AuthorDraft): PreviewOutcome {
  const preview = buildFinalPreview(draft);
  if (!preview) return { status: "incomplete" };
  // The shared LLM-contract assembly must agree, including the code cap.
  const approved = draft.proposals.filter(p => p.decision === "approved");
  const assembled = assembleCandidate(draft.workingCode, approved.map((p, index): Proposal => ({
    key: `p${index}`, category: p.category, sourceStartLine: p.sourceStartLine, sourceEndLine: p.sourceEndLine,
    originalSnippet: p.originalSnippet, replacementSnippet: p.replacementSnippet, explanation: p.explanation, fix: p.fix,
  })));
  if (assembled.code !== preview.code.after) return { status: "unavailable" };
  return { status: "ok", preview: { draftVersion: draft.draftVersion, ...preview } };
}
