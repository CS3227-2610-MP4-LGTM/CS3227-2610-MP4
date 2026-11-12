import "server-only";
import { z } from "zod";
import { challengeIdSchema, timestampSchema } from "@/lib/learner/challenge-schema";
import { submissionCardSchema, submissionPageSchema, type HistoryResult } from "@/lib/learner/history";
import { genericReadFailure } from "@/lib/learner/challenges";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { submissionCaller } from "./submissions";

const cursorSchema = z.strictObject({
  version: z.literal(1), order: z.literal("submitted-desc-id-asc"), challengeId: challengeIdSchema.nullable(),
  submittedAt: timestampSchema, id: challengeIdSchema,
});
const resultSchema = z.union([
  z.strictObject({ status: z.literal("ok"), items: z.array(submissionCardSchema).max(51) }),
  z.strictObject({ status: z.enum(["forbidden", "invalid"]) }),
]);
function parseQuery(search: URLSearchParams) {
  const raw: Record<string, string> = {};
  for (const [key, value] of search) {
    if (Object.hasOwn(raw, key) || !["limit", "cursor", "challengeId"].includes(key)) throw new Error("Invalid query");
    raw[key] = value;
  }
  const input = z.strictObject({
    limit: z.string().regex(/^[1-9]\d?$/).transform(Number).pipe(z.number().int().min(1).max(50)).optional(),
    cursor: z.string().min(1).max(512).optional(), challengeId: challengeIdSchema.optional(),
  }).parse(raw);
  const challengeId = input.challengeId?.toLowerCase() ?? null;
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (input.cursor) {
    if (!/^[A-Za-z0-9_-]+$/.test(input.cursor)) throw new Error("Invalid cursor");
    cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")));
    if (cursor.challengeId !== challengeId) throw new Error("Mismatched cursor");
  }
  return { limit: input.limit ?? 20, challengeId, cursor };
}
export async function readSubmissionPageWithAccess(search: URLSearchParams): Promise<HistoryResult> {
  const caller = await submissionCaller();
  if (caller.status !== "ok") return caller;
  let query;
  try { query = parseQuery(search); } catch { return { status: "invalid" }; }
  try {
    const { data, error } = await caller.client.rpc("list_learner_submissions", {
      p_limit: query.limit, p_challenge_id: query.challengeId ?? undefined,
      p_before: query.cursor?.submittedAt, p_after_id: query.cursor?.id,
    });
    if (error) return { status: "unavailable" };
    const result = resultSchema.parse(data);
    if (result.status !== "ok") {
      if (result.status === "forbidden") {
        const checked = await submissionCaller();
        if (checked.status !== "ok") return checked;
      }
      return result;
    }
    if (result.items.length > query.limit + 1 || result.items.some(card =>
      card.learner.id !== caller.account.id || (query.challengeId && card.challengeId !== query.challengeId))) {
      return { status: "unavailable" };
    }
    const items = result.items.slice(0, query.limit);
    const last = items.at(-1);
    const nextCursor = last && result.items.length > query.limit
      ? Buffer.from(JSON.stringify({ version: 1, order: "submitted-desc-id-asc", challengeId: query.challengeId,
        submittedAt: last.submittedAt, id: last.id })).toString("base64url") : null;
    return { status: "ok", page: submissionPageSchema.parse({ items, nextCursor }) };
  } catch { return { status: "unavailable" }; }
}
export async function readSubmissionPage(search: URLSearchParams): Promise<HistoryResult> {
  const result = await readSubmissionPageWithAccess(search);
  return isWorkspaceAccessFailure(result) ? genericReadFailure(result) : result;
}
