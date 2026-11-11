import "server-only";
import { z } from "zod";
import { categories, difficulties, languages, lifecycleStatuses } from "@/lib/author/drafts";
import { buildFinalPreview } from "@/lib/author/preview";
import type { AuthorPublication, AuthorRevision } from "@/lib/author/publication";
import type { CodeDiff } from "@/lib/code-diff";
import type { Json } from "@/lib/supabase/database.types";
import { createAccountingStore } from "@/server/llm/accounting";
import { createLlmBoundary } from "@/server/llm/boundary";
import { ceilings } from "@/server/llm/config";
import { errorCode, fail } from "@/server/llm/errors";
import { createAdminClient } from "@/server/supabase/admin";
import { authorCaller, type AuthorCaller } from "./access";
import { loadDraft, ownChallenge, type AuthorFailure } from "./drafts";
import { writeRequest } from "./proposals";
import { challengeIdSchema } from "./validation";

/** A recorded publication failure carries its INTEGRATION-SPEC §3 code, or NOT_PUBLISHABLE (AUT-05.1). */
export type PublicationOutcome =
  | { status: "ok"; publication: AuthorPublication }
  | { status: "failed"; code: string }
  | AuthorFailure;
export type RevisionOutcome = { status: "ok"; revision: AuthorRevision } | AuthorFailure;

const notPublishable = "NOT_PUBLISHABLE";
const version = z.number().int().positive().max(2_147_483_647);
const publishBody = z.strictObject({ expectedRowVersion: version, expectedDraftVersion: version });
const persistedSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("started") }),
  z.strictObject({ status: z.literal("pending") }),
  z.strictObject({ status: z.literal("failed"), code: z.string() }),
  z.strictObject({ status: z.literal("completed"), revisionId: z.uuid() }),
]);
const challengeRow = z.object({
  id: z.uuid(), author_id: z.uuid(), status: z.enum(lifecycleStatuses), row_version: z.number().int(),
});
const revisionRow = z.object({
  id: z.uuid(), challenge_id: z.uuid(), revision_number: z.number().int(), title: z.string(), description: z.string(),
  language: z.enum(languages), difficulty: z.enum(difficulties), published_at: z.string(),
});
const flawRow = z.object({
  id: z.uuid(), revision_id: z.uuid(), proposal_id: z.uuid(), category: z.enum(categories),
  original_snippet: z.string(), replacement_snippet: z.string(), source_start_line: z.number().int(),
  source_end_line: z.number().int(), start_line: z.number().int(), end_line: z.number().int(),
  explanation: z.string(), fix: z.string(),
});
const hintRow = z.object({ id: z.uuid(), flaw_id: z.uuid(), text: z.string() });

function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error("Author publication read failed");
  return result.data;
}

/** Reads one own revision with its challenge row through user-scoped RLS; null when none is visible. */
async function loadPublication(caller: AuthorCaller, challengeId: string, revisionId: string) {
  const challengeData = checked(await caller.client.from("challenges")
    .select("id,author_id,status,row_version").eq("id", challengeId).maybeSingle());
  if (!challengeData) return null;
  const challenge = challengeRow.parse(challengeData);
  if (challenge.author_id !== caller.account.id) return null;
  const revisionData = checked(await caller.client.from("challenge_revisions")
    .select("id,challenge_id,revision_number,title,description,language,difficulty,published_at")
    .eq("id", revisionId).eq("challenge_id", challengeId).maybeSingle());
  if (!revisionData) return null;
  const revision = revisionRow.parse(revisionData);
  const publication: AuthorPublication = {
    id: challenge.id, status: challenge.status, rowVersion: challenge.row_version,
    revisionId: revision.id, revisionNumber: revision.revision_number, publishedAt: revision.published_at,
  };
  return { publication, revision };
}

/** After a committed publication, a failed reread cannot be reported as a definite failure. */
async function confirmedPublication(caller: AuthorCaller, challengeId: string, revisionId: string): Promise<PublicationOutcome> {
  try {
    const loaded = await loadPublication(caller, challengeId, revisionId);
    return loaded ? { status: "ok", publication: loaded.publication } : { status: "uncertain" };
  } catch {
    return { status: "uncertain" };
  }
}

/**
 * AUT-05: generates hints for the complete retained candidate and commits one
 * immutable revision. Authorization, ownership, state, versions and eligibility
 * are checked before any reservation; the revision is persisted only through
 * the SYS-10.3 admin function, which assembles the candidate itself.
 */
export async function publishAuthorChallenge(id: string, request: Request): Promise<PublicationOutcome> {
  const key = challengeIdSchema.safeParse(request.headers.get("Idempotency-Key"));
  const parsed = await writeRequest(id, request, publishBody);
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
      const result = await admin.rpc("persist_author_publication", { p_input: { ...args, ...input } as Json });
      if (result.error) {
        if (result.error.message === notPublishable) throw Object.assign(new Error(notPublishable), { publication: notPublishable });
        fail(errorCode({ code: result.error.message }));
      }
      return persistedSchema.parse(result.data);
    }
    async function settled(result: z.infer<typeof persistedSchema>): Promise<PublicationOutcome> {
      if (result.status === "completed") return confirmedPublication(caller, challengeId, result.revisionId);
      if (result.status === "failed") return { status: "failed", code: result.code };
      return { status: "in_progress" };
    }
    async function failure(code: string): Promise<PublicationOutcome> {
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
      // AUT-05.1: a current set, every decision saved, one approval and a valid assembled candidate.
      const preview = draft.generationId ? buildFinalPreview(draft) : null;
      if (!preview) return failure(notPublishable);

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
        operation: "generate_hints", resourceId: challengeId, idempotencyKey: key.data, expectedVersion: draft.draftVersion,
      });
      if (!generated.data || generated.data.operation !== "generate_hints") {
        const code = "error" in generated ? generated.error.code : "INVALID_STATE";
        // The boundary reports an ineligible or changed candidate as INVALID_STATE; a reread tells them apart.
        return failure(code === "INVALID_STATE" ? await staleOrIneligible(caller, challengeId, body) : code);
      }
      if (clock() >= generated.meta.deadline) return failure("AI_TIMEOUT");

      // Recheck the stored role before the privileged write; never replay on account changes.
      const current = await authorCaller();
      if (current.status !== "ok" || current.account.id !== caller.account.id) {
        await failure("FORBIDDEN");
        return current.status !== "ok" ? current : { status: "account_unavailable" };
      }

      const saved = await persist({
        action: "complete", operationId, expectedRowVersion: body.expectedRowVersion, expectedDraftVersion: body.expectedDraftVersion,
        diff: preview.code, hints: generated.data.payload.hints,
      });
      return settled(saved);
    } catch (error) {
      if ((error as { publication?: string })?.publication === notPublishable) return failure(notPublishable);
      return failure(errorCode(error));
    }
  } catch (error) {
    const code = errorCode(error);
    return code === "SERVICE_UNAVAILABLE" ? { status: "uncertain" } : { status: "failed", code };
  }
}

/** Classifies a boundary INVALID_STATE: archived stays INVALID_STATE, a changed draft is a conflict. */
async function staleOrIneligible(
  caller: AuthorCaller, challengeId: string, body: z.infer<typeof publishBody>,
): Promise<string> {
  try {
    const draft = await loadDraft(caller.client, caller.account.id, challengeId);
    if (!draft || draft.status === "archived") return "INVALID_STATE";
    if (draft.rowVersion !== body.expectedRowVersion || draft.draftVersion !== body.expectedDraftVersion) return "VERSION_CONFLICT";
    return notPublishable;
  } catch {
    return "INVALID_STATE";
  }
}

/** AUT-05.3: the owning Author's published real diff, retained answers and hints for one revision. */
export async function readAuthorRevision(
  id: string, revisionId: string, search = new URLSearchParams(),
): Promise<RevisionOutcome> {
  const caller = await authorCaller();
  if (caller.status !== "ok") return caller;
  const challengeId = challengeIdSchema.safeParse(id);
  const revision = challengeIdSchema.safeParse(revisionId);
  if (!challengeId.success || !revision.success || search.size) return { status: "invalid" };
  try {
    const denied = await ownChallenge(caller, challengeId.data);
    if (denied) return denied;
    const loaded = await loadPublication(caller, challengeId.data, revision.data);
    if (!loaded) return { status: "not_found" };
    const client = caller.client;
    const answers = checked(await client.from("revision_answers").select("real_diff").eq("revision_id", revision.data).maybeSingle());
    if (!answers) return { status: "unavailable" };
    const flaws = z.array(flawRow).parse(checked(await client.from("revision_flaws")
      .select("id,revision_id,proposal_id,category,original_snippet,replacement_snippet,source_start_line,source_end_line,start_line,end_line,explanation,fix")
      .eq("revision_id", revision.data).order("start_line")));
    const hints = z.array(hintRow).parse(checked(await client.from("flaw_hints")
      .select("id,flaw_id,text").eq("revision_id", revision.data)));
    const order = new Map(flaws.map((flaw, index) => [flaw.id, index]));
    const { publication, revision: row } = loaded;
    return {
      status: "ok",
      revision: {
        publication,
        challenge: {
          id: publication.id, revisionId: row.id, title: row.title, description: row.description,
          language: row.language, difficulty: row.difficulty,
          // Sorted unique approved categories, in vocabulary order.
          categories: categories.filter(category => flaws.some(flaw => flaw.category === category)),
          publishedAt: row.published_at, code: answers.real_diff as unknown as CodeDiff,
        },
        answerKey: flaws.map(flaw => ({
          id: flaw.id, revisionId: flaw.revision_id, proposalId: flaw.proposal_id, category: flaw.category,
          originalSnippet: flaw.original_snippet, replacementSnippet: flaw.replacement_snippet,
          sourceStartLine: flaw.source_start_line, sourceEndLine: flaw.source_end_line,
          startLine: flaw.start_line, endLine: flaw.end_line, explanation: flaw.explanation, fix: flaw.fix,
        })),
        hints: hints.map(hint => ({ id: hint.id, flawId: hint.flaw_id, text: hint.text }))
          .sort((a, b) => (order.get(a.flawId) ?? 0) - (order.get(b.flawId) ?? 0)),
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}
