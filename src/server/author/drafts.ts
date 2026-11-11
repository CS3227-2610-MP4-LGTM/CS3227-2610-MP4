import "server-only";
import { z } from "zod";
import {
  authorBodyLimit, categories, difficulties, languages, lifecycleStatuses,
  type AuthorChallengePage, type AuthorDraft, type FieldErrors,
} from "@/lib/author/drafts";
import type { WorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import type { Json } from "@/lib/supabase/database.types";
import { workspaceAccountHeader } from "@/lib/learner/submissions";
import { matchesRequestOrigin, readJsonBody } from "@/server/http/request";
import { authorCaller, type AuthorCaller, type AuthorClient } from "./access";
import { challengeIdSchema, encodeListCursor, parseCreateBody, parseListQuery, parsePatchBody } from "./validation";

export type AuthorFailure =
  | { status: "invalid"; fieldErrors?: FieldErrors }
  | { status: "forbidden" | "not_found" | "version_conflict" | "invalid_state" | "in_progress"
      | "idempotency_conflict" | "too_large" | "unavailable" | "uncertain" }
  | WorkspaceAccessFailure;
export type DraftResult = { status: "ok"; draft: AuthorDraft } | AuthorFailure;
export type PageResult = { status: "ok"; page: AuthorChallengePage } | AuthorFailure;

const draftRowSchema = z.object({
  title: z.string(),
  description: z.string(),
  language: z.enum(languages),
  difficulty: z.enum(difficulties),
  working_code: z.string(),
  flaw_count: z.number().int(),
  categories: z.array(z.enum(categories)),
  generation_id: z.uuid().nullable(),
  draft_version: z.number().int(),
});
const challengeRowSchema = z.object({
  id: z.uuid(),
  author_id: z.uuid(),
  status: z.enum(lifecycleStatuses),
  row_version: z.number().int(),
  published_revision_id: z.uuid().nullable(),
});
const proposalRowSchema = z.object({
  id: z.uuid(),
  category: z.enum(categories),
  source_start_line: z.number().int(),
  source_end_line: z.number().int(),
  original_snippet: z.string(),
  replacement_snippet: z.string(),
  explanation: z.string(),
  fix: z.string(),
});
const decisionRowSchema = z.object({ proposal_id: z.uuid(), decision: z.enum(["pending", "approved", "rejected"]) });
const writeResultSchema = z.union([
  z.strictObject({ status: z.literal("ok"), challengeId: z.uuid() }),
  z.strictObject({ status: z.enum([
    "invalid", "forbidden", "not_found", "version_conflict", "invalid_state", "in_progress", "idempotency_conflict",
  ]) }),
]);
const accessSchema = z.enum(["OK", "FORBIDDEN", "NOT_FOUND", "UNAUTHENTICATED"]);

function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error("Author draft read failed");
  return result.data;
}

/** Reads one own draft through user-scoped RLS. Returns null when no own row is visible. */
async function loadDraft(client: AuthorClient, authorId: string, id: string): Promise<AuthorDraft | null> {
  const challengeRow = checked(await client.from("challenges")
    .select("id,author_id,status,row_version,published_revision_id").eq("id", id).maybeSingle());
  if (!challengeRow) return null;
  const challenge = challengeRowSchema.parse(challengeRow);
  if (challenge.author_id !== authorId) return null;
  const draftRow = checked(await client.from("challenge_drafts")
    .select("title,description,language,difficulty,working_code,flaw_count,categories,generation_id,draft_version")
    .eq("challenge_id", id).maybeSingle());
  if (!draftRow) return null;
  const draft = draftRowSchema.parse(draftRow);

  let proposals: AuthorDraft["proposals"] = [];
  if (draft.generation_id) {
    const rows = z.array(proposalRowSchema).parse(checked(await client.from("proposals")
      .select("id,category,source_start_line,source_end_line,original_snippet,replacement_snippet,explanation,fix")
      .eq("proposal_set_id", draft.generation_id).order("source_start_line").order("id")));
    const decisions = rows.length ? z.array(decisionRowSchema).parse(checked(await client.from("proposal_decisions")
      .select("proposal_id,decision").in("proposal_id", rows.map(row => row.id)))) : [];
    const byId = new Map(decisions.map(row => [row.proposal_id, row.decision]));
    proposals = rows.map(row => ({
      id: row.id, category: row.category, sourceStartLine: row.source_start_line, sourceEndLine: row.source_end_line,
      originalSnippet: row.original_snippet, replacementSnippet: row.replacement_snippet,
      explanation: row.explanation, fix: row.fix, decision: byId.get(row.id) ?? "pending",
    }));
  }

  return {
    id: challenge.id, status: challenge.status, rowVersion: challenge.row_version,
    publishedRevisionId: challenge.published_revision_id, draftVersion: draft.draft_version,
    title: draft.title, description: draft.description, language: draft.language, difficulty: draft.difficulty,
    workingCode: draft.working_code, flawCount: draft.flaw_count, categories: draft.categories,
    generationId: draft.generation_id, proposals,
  };
}

/** Write preconditions shared by create and edit: SYS-16.2 origin and SYS-09.3 workspace account. */
function writeGuard(request: Request, caller: AuthorCaller): AuthorFailure | null {
  if (!matchesRequestOrigin(request, new URL(request.url))) return { status: "forbidden" };
  const workspaceAccount = request.headers.get(workspaceAccountHeader);
  if (workspaceAccount !== null) {
    const expected = challengeIdSchema.safeParse(workspaceAccount);
    if (!expected.success || expected.data.toLowerCase() !== caller.account.id.toLowerCase()) {
      return { status: "account_unavailable" };
    }
  }
  return null;
}

function rpcFailure(error: { code?: string }): AuthorFailure {
  // A PostgreSQL error code confirms rollback. A network error, gateway failure
  // or malformed acknowledgement may have lost a committed outcome.
  const code = error.code ?? "";
  const rolledBack = /^[0-9A-Z]{5}$/.test(code) && !code.startsWith("08") && code !== "40003";
  return { status: rolledBack ? "unavailable" : "uncertain" };
}

/** After a committed write, a failed reread cannot be reported as a definite failure. */
async function confirmedDraft(caller: AuthorCaller, id: string): Promise<DraftResult> {
  try {
    const draft = await loadDraft(caller.client, caller.account.id, id);
    return draft ? { status: "ok", draft } : { status: "uncertain" };
  } catch {
    return { status: "uncertain" };
  }
}

export async function createAuthorDraft(request: Request): Promise<DraftResult> {
  const caller = await authorCaller();
  if (caller.status !== "ok") return caller;
  const guard = writeGuard(request, caller);
  if (guard) return guard;
  const key = challengeIdSchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!key.success || new URL(request.url).searchParams.size) return { status: "invalid" };
  const raw = await readJsonBody(request, authorBodyLimit);
  if (raw.status !== "ok") return raw;
  const input = parseCreateBody(raw.value);
  if (input.status !== "ok") return input;

  try {
    const { data, error } = await caller.client.rpc("create_author_challenge", {
      p_idempotency_key: key.data, p_payload: input.value as Json,
    });
    if (error) return rpcFailure(error);
    const result = writeResultSchema.parse(data);
    if (result.status !== "ok") return { status: result.status };
    return confirmedDraft(caller, result.challengeId);
  } catch {
    return { status: "uncertain" };
  }
}

export async function updateAuthorDraft(id: string, request: Request): Promise<DraftResult> {
  const caller = await authorCaller();
  if (caller.status !== "ok") return caller;
  const guard = writeGuard(request, caller);
  if (guard) return guard;
  const challengeId = challengeIdSchema.safeParse(id);
  if (!challengeId.success || new URL(request.url).searchParams.size) return { status: "invalid" };
  const raw = await readJsonBody(request, authorBodyLimit);
  if (raw.status !== "ok") return raw;
  const input = parsePatchBody(raw.value);
  if (input.status !== "ok") return input;

  try {
    const { data, error } = await caller.client.rpc("update_author_draft", {
      p_challenge_id: challengeId.data, p_payload: input.value as Json,
    });
    if (error) return rpcFailure(error);
    const result = writeResultSchema.parse(data);
    if (result.status !== "ok") return { status: result.status === "in_progress" ? "uncertain" : result.status };
    return confirmedDraft(caller, result.challengeId);
  } catch {
    return { status: "uncertain" };
  }
}

export async function readAuthorDraft(id: string, search = new URLSearchParams()): Promise<DraftResult> {
  const caller = await authorCaller();
  if (caller.status !== "ok") return caller;
  const challengeId = challengeIdSchema.safeParse(id);
  if (!challengeId.success || search.size) return { status: "invalid" };
  try {
    // Only the owner/other/absent classification crosses this boundary.
    const access = accessSchema.parse(checked(await caller.client.rpc("challenge_generation_access", {
      resource_id: challengeId.data,
    })));
    if (access === "UNAUTHENTICATED") return { status: "unauthenticated" };
    if (access === "FORBIDDEN") return { status: "forbidden" };
    if (access === "NOT_FOUND") return { status: "not_found" };
    const draft = await loadDraft(caller.client, caller.account.id, challengeId.data);
    return draft ? { status: "ok", draft } : { status: "not_found" };
  } catch {
    return { status: "unavailable" };
  }
}

const cardRowSchema = z.object({ id: z.uuid(), status: z.enum(lifecycleStatuses), created_at: z.string() });
const cardDraftSchema = z.object({
  challenge_id: z.uuid(), title: z.string(), language: z.enum(languages), difficulty: z.enum(difficulties),
});

export async function readAuthorChallengePage(search: URLSearchParams): Promise<PageResult> {
  const caller = await authorCaller();
  if (caller.status !== "ok") return caller;
  const query = parseListQuery(search);
  if (!query) return { status: "invalid" };
  try {
    let request = caller.client.from("challenges").select("id,status,created_at")
      .eq("author_id", caller.account.id);
    if (query.status) request = request.eq("status", query.status);
    if (query.cursor) {
      const { createdAt, id } = query.cursor;
      request = request.or(`created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.gt.${id})`);
    }
    const rows = z.array(cardRowSchema).parse(checked(await request
      .order("created_at", { ascending: false }).order("id", { ascending: true }).limit(query.limit + 1)));
    const pageRows = rows.slice(0, query.limit);
    const drafts = pageRows.length ? z.array(cardDraftSchema).parse(checked(await caller.client.from("challenge_drafts")
      .select("challenge_id,title,language,difficulty").in("challenge_id", pageRows.map(row => row.id)))) : [];
    const byId = new Map(drafts.map(row => [row.challenge_id, row]));
    const items = pageRows.map(row => {
      const draft = byId.get(row.id);
      if (!draft) throw new Error("Challenge without a working draft");
      return { id: row.id, status: row.status, title: draft.title, language: draft.language,
        difficulty: draft.difficulty, createdAt: row.created_at };
    });
    const last = pageRows.at(-1);
    const nextCursor = rows.length > query.limit && last
      ? encodeListCursor({ createdAt: last.created_at, id: last.id, status: query.status ?? null }) : null;
    return { status: "ok", page: { items, nextCursor } };
  } catch {
    return { status: "unavailable" };
  }
}
