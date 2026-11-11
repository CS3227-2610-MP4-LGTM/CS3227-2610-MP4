import "server-only";
import { z } from "zod";
import { draftFields, lifecycleStatuses, validateDraftFields, type DraftField, type FieldErrors } from "@/lib/author/drafts";

export const challengeIdSchema = z.uuid();
const version = z.number().int().positive().max(2_147_483_647);
const fieldShape = Object.fromEntries(draftFields.map(field => [field, z.unknown().optional()])) as Record<DraftField, z.ZodOptional<z.ZodUnknown>>;
const createSchema = z.strictObject(fieldShape);
const patchSchema = z.strictObject({ ...fieldShape, expectedRowVersion: version, expectedDraftVersion: version });

type Parsed<T> = { status: "ok"; value: T } | { status: "invalid"; fieldErrors?: FieldErrors };

/** POST body: exactly the seven draft fields, each validated with its AUT-01/AUT-02 message. */
export function parseCreateBody(body: unknown): Parsed<Record<DraftField, unknown>> {
  const shape = createSchema.safeParse(body);
  // Strict-object issues can name unknown properties, so they never become field errors.
  if (!shape.success) return { status: "invalid" };
  const { values, fieldErrors, valid } = validateDraftFields(shape.data);
  return valid ? { status: "ok", value: values as Record<DraftField, unknown> } : { status: "invalid", fieldErrors };
}

/** PATCH body: both expected versions and at least one draft field; explicit nulls count as missing values. */
export function parsePatchBody(body: unknown): Parsed<Record<string, unknown>> {
  const shape = patchSchema.safeParse(body);
  if (!shape.success) return { status: "invalid" };
  const { expectedRowVersion, expectedDraftVersion, ...fields } = shape.data;
  const present = draftFields.filter(field => field in fields);
  if (!present.length) return { status: "invalid" };
  const { values, fieldErrors, valid } = validateDraftFields(fields, present);
  return valid ? { status: "ok", value: { expectedRowVersion, expectedDraftVersion, ...values } } : { status: "invalid", fieldErrors };
}

const statusSchema = z.enum(lifecycleStatuses);
const anchorSchema = z.strictObject({
  version: z.literal(1),
  createdAt: z.string().max(40).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/),
  id: challengeIdSchema,
  status: statusSchema.nullable(),
});
const querySchema = z.strictObject({
  status: statusSchema.optional(),
  limit: z.string().regex(/^[1-9][0-9]?$/).transform(Number).pipe(z.number().max(50)).optional(),
  cursor: z.string().max(512).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

export type ListAnchor = z.infer<typeof anchorSchema>;
export type ListQuery = { status?: z.infer<typeof statusSchema>; limit: number; cursor?: ListAnchor };

export function encodeListCursor(anchor: Omit<ListAnchor, "version">) {
  return Buffer.from(JSON.stringify(anchorSchema.parse({ version: 1, ...anchor }))).toString("base64url");
}

/** Bounded list query; a cursor is valid only with the status filter it was issued for. */
export function parseListQuery(search: URLSearchParams): ListQuery | null {
  const fields = new Map<string, string>();
  for (const [key, value] of search) {
    if (fields.has(key)) return null;
    fields.set(key, value);
  }
  const parsed = querySchema.safeParse(Object.fromEntries(fields));
  if (!parsed.success) return null;
  const { status, limit = 20, cursor } = parsed.data;
  if (!cursor) return { status, limit };
  try {
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor) return null;
    const anchor = anchorSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    if (anchor.status !== (status ?? null)) return null;
    return { status, limit, cursor: anchor };
  } catch {
    return null;
  }
}
