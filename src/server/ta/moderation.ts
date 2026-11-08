import "server-only";
import { z } from "zod";
import { submissionSchema } from "@/lib/ta/submissions";
import type { FlagPageResult, OverrideResult, ResolutionResult, MutationFailure } from "@/lib/ta/moderation";
import { projectEffectiveGrade } from "@/lib/grading/effective-grade";
import { withTa } from "./submissions";
import { encodeFlagCursor, parseFlagQuery, parseOverride, parseResolution } from "./moderation-validation";
const flag = submissionSchema.shape.flags.element;
const grading = submissionSchema.shape.grading;
const failure = z.strictObject({ status: z.enum(["forbidden", "invalid", "not_found", "invalid_state", "conflict", "idempotency_conflict"]) });
export async function readFlagPage(search: URLSearchParams): Promise<FlagPageResult> {
 return withTa(async client => {
  let query; try { query = parseFlagQuery(search); } catch { return { status: "invalid" } as const; }
  const { data, error } = await client.rpc("list_ta_flags", { p_limit: query.limit, p_status: query.status, p_kind: query.kind, p_before: query.anchor?.createdAt, p_after_id: query.anchor?.id });
  if (error) throw error;
  const result = z.union([z.strictObject({ status: z.literal("ok"), items: z.array(flag).max(51) }), failure]).parse(data);
  if (result.status !== "ok") return { status: result.status === "forbidden" ? "role_denied" : "invalid" } as const;
  const items = result.items.slice(0,query.limit), last = items.at(-1);
  return { status: "ok", page: { items, nextCursor: last && result.items.length > query.limit ? encodeFlagCursor({ createdAt: last.createdAt, id: last.id },query) : null } };
 });
}
export async function appendOverride(id: string, payload: unknown, key: string): Promise<OverrideResult> {
 return withTa(async client => {
  let body; try { z.uuid().parse(id); z.uuid().parse(key); body = parseOverride(payload); } catch { return { status: "invalid" } as const; }
  const { data,error } = await client.rpc("append_ta_override", { p_id: id, p_payload: body, p_key: key });
  if (error) throw error;
  const result = z.union([z.strictObject({ status: z.literal("ok"), override: grading.shape.overrides.element, grading }), failure]).parse(data);
  if (result.status === "forbidden") return { status: "role_denied" } as const;
  if (result.status === "ok") result.grading.effective = projectEffectiveGrade(result.grading.original?.score ?? null,result.grading.overrides);
  return result.status === "ok" ? result : { status: result.status } as MutationFailure;
 });
}
export async function appendResolution(id: string, payload: unknown, key: string): Promise<ResolutionResult> {
 return withTa(async client => {
  let body; try { z.uuid().parse(id); z.uuid().parse(key); body = parseResolution(payload); } catch { return { status: "invalid" } as const; }
  const { data,error } = await client.rpc("append_ta_resolution", { p_id: id, p_payload: body, p_key: key });
  if (error) throw error;
  const result = z.union([z.strictObject({ status: z.literal("ok"), flag }), failure]).parse(data);
  return result.status === "ok" ? result : { status: result.status === "forbidden" ? "role_denied" : result.status } as MutationFailure;
 });
}
