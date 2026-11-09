import "server-only";
import { z } from "zod";
import { challengeIdSchema as uuid, timestampSchema } from "@/server/learner/validation";
const filtersSchema = z.strictObject({ learnerId: uuid.optional(), challengeId: uuid.optional(), gradingState: z.enum(["pending", "running", "failed", "completed"]).optional() });
const anchorSchema = z.strictObject({ submittedAt: timestampSchema, id: uuid });
const cursorSchema = z.strictObject({ version: z.literal(1), anchor: anchorSchema, filters: filtersSchema });
const querySchema = filtersSchema.extend({ limit: z.string().regex(/^[1-9][0-9]?$/).transform(Number).pipe(z.number().max(50)).optional(), cursor: z.string().max(512).regex(/^[A-Za-z0-9_-]+$/).optional() });
export function encodeSubmissionCursor(anchor: z.infer<typeof anchorSchema>, { learnerId, challengeId, gradingState }: z.infer<typeof filtersSchema>) {
  return Buffer.from(JSON.stringify(cursorSchema.parse({ version: 1, anchor, filters: { learnerId, challengeId, gradingState } }))).toString("base64url");
}
export function parseSubmissionQuery(search: URLSearchParams) {
  const fields = new Map<string, string>();
  for (const [key, value] of search) { if (fields.has(key)) throw new Error("Duplicate field"); fields.set(key, value); }
  const { cursor, limit = 20, ...filters } = querySchema.parse(Object.fromEntries(fields));
  if (!cursor) return { ...filters, limit, anchor: undefined };
  const bytes = Buffer.from(cursor, "base64url");
  if (bytes.toString("base64url") !== cursor) throw new Error("Invalid cursor");
  const decoded = cursorSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  if (decoded.filters.learnerId !== filters.learnerId || decoded.filters.challengeId !== filters.challengeId || decoded.filters.gradingState !== filters.gradingState) throw new Error("Cursor filters changed");
  return { ...filters, limit, anchor: decoded.anchor };
}
