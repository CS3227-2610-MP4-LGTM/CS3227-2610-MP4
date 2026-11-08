import "server-only";
import { z } from "zod";
import { categoryLabels, difficultyLabels, languageLabels } from "@/lib/learner/challenges";

export const languageSchema = z.enum(Object.keys(languageLabels) as (keyof typeof languageLabels)[]);
export const difficultySchema = z.enum(Object.keys(difficultyLabels) as (keyof typeof difficultyLabels)[]);
export const categorySchema = z.enum(Object.keys(categoryLabels) as (keyof typeof categoryLabels)[]);
const filtersSchema = z.strictObject({
  language: languageSchema.optional(),
  difficulty: difficultySchema.optional(),
  category: categorySchema.optional(),
});

export const challengeIdSchema = z.uuid();
export const timestampSchema = z.iso.datetime({ offset: true }).refine(
  value => !value.startsWith("0000") && /(?:Z|\+00:00)$/.test(value),
);
const anchorSchema = z.strictObject({
  publishedAt: timestampSchema,
  challengeId: challengeIdSchema,
  revisionId: challengeIdSchema.optional(),
});
const cursorSchema = z.strictObject({ version: z.literal(1), anchor: anchorSchema, filters: filtersSchema });
const querySchema = filtersSchema.extend({
  limit: z.string().regex(/^[1-9][0-9]?$/).transform(Number).pipe(z.number().max(50)).optional(),
  cursor: z.string().max(512).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

type Anchor = z.infer<typeof anchorSchema>;
type Filters = z.infer<typeof filtersSchema>;

export function encodeChallengeCursor(anchor: Anchor, { language, difficulty, category }: Filters): string {
  const payload = cursorSchema.parse({ version: 1, anchor, filters: { language, difficulty, category } });
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function parseChallengeListQuery(search: URLSearchParams) {
  const fields = new Map<string, string>();
  for (const [key, value] of search) {
    if (fields.has(key)) throw new Error("Duplicate catalogue query parameter");
    fields.set(key, value);
  }
  const { cursor, limit = 20, ...filters } = querySchema.parse(Object.fromEntries(fields));
  if (!cursor) return { ...filters, limit, cursor: undefined };
  const bytes = Buffer.from(cursor, "base64url");
  if (bytes.toString("base64url") !== cursor) throw new Error("Invalid catalogue cursor");

  const decoded = cursorSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  if (decoded.filters.language !== filters.language || decoded.filters.difficulty !== filters.difficulty
    || decoded.filters.category !== filters.category) throw new Error("Cursor does not match the catalogue filters");
  return { ...filters, limit, cursor: decoded.anchor };
}

export function parseChallengeDetailQuery(id: string, search: URLSearchParams) {
  if (search.size) throw new Error("Unexpected challenge query parameter");
  return challengeIdSchema.parse(id);
}
