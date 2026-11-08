import "server-only";
import { z } from "zod";
import { challengeIdSchema as uuid, timestampSchema } from "@/server/learner/validation";
const reason = z.string().trim().refine(value => [...value].length >= 1 && [...value].length <= 2000);
const override = z.strictObject({ score: z.number().int().min(0).max(100), reason });
const resolution = z.strictObject({ disposition: z.enum(["upheld", "dismissed"]), reason });
export const parseOverride = (input: unknown) => override.parse(input);
export const parseResolution = (input: unknown) => resolution.parse(input);
const filtersSchema = z.strictObject({ status: z.enum(["open", "resolved"]), kind: z.enum(["near_pass_mark", "grading_output_retried", "assessment_disagreement", "learner_report"]).optional() });
const anchorSchema = z.strictObject({ createdAt: timestampSchema, id: uuid });
const cursorSchema = z.strictObject({ version: z.literal(1), anchor: anchorSchema, filters: filtersSchema });
const querySchema = filtersSchema.partial({ status: true }).extend({ limit: z.string().regex(/^[1-9][0-9]?$/).transform(Number).pipe(z.number().max(50)).optional(), cursor: z.string().max(512).regex(/^[A-Za-z0-9_-]+$/).optional() });
export function encodeFlagCursor(anchor: z.infer<typeof anchorSchema>, { status, kind }: z.infer<typeof filtersSchema>) {
 return Buffer.from(JSON.stringify(cursorSchema.parse({ version: 1, anchor, filters: { status, kind } }))).toString("base64url");
}
export function parseFlagQuery(search: URLSearchParams) {
 const fields = new Map<string,string>();
 for (const [key,value] of search) { if (fields.has(key)) throw new Error("Duplicate field"); fields.set(key,value); }
 const { cursor, limit = 20, status = "open", kind } = querySchema.parse(Object.fromEntries(fields));
 const filters = { status, kind };
 if (!cursor) return { ...filters, limit, anchor: undefined };
 const bytes = Buffer.from(cursor, "base64url");
 if (bytes.toString("base64url") !== cursor) throw new Error("Invalid cursor");
 const decoded = cursorSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
 if (decoded.filters.status !== status || decoded.filters.kind !== kind) throw new Error("Cursor filters changed");
 return { ...filters, limit, anchor: decoded.anchor };
}
