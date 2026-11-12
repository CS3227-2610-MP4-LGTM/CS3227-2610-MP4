import "server-only";
import { z } from "zod";
import type { LifecycleAction, LifecycleResult } from "@/lib/author/lifecycle";
import type { Json } from "@/lib/supabase/database.types";
import { rpcFailure, type AuthorFailure } from "./drafts";
import { writeRequest } from "./proposals";
import { challengeIdSchema } from "./validation";

export type LifecycleOutcome = { status: "ok"; challenge: LifecycleResult } | AuthorFailure;

const version = z.number().int().positive().max(2_147_483_647);
const lifecycleBody = z.strictObject({ expectedRowVersion: version });
const resultSchema = z.union([
  z.strictObject({
    status: z.literal("ok"),
    challenge: z.strictObject({ id: z.uuid(), status: z.enum(["unpublished", "archived"]), rowVersion: version }),
  }),
  z.strictObject({ status: z.enum([
    "invalid", "forbidden", "not_found", "version_conflict", "invalid_state", "in_progress", "idempotency_conflict",
  ]) }),
]);

/**
 * AUT-06.4–06.7: unpublish or archive the caller's own challenge. The write is
 * user-scoped (SYS-10.3 has no lifecycle named use): one database function
 * checks role, ownership, the allowed transition and the expected row version
 * under the challenge-row lock that attempt creation also takes.
 */
export async function changeAuthorLifecycle(action: LifecycleAction, id: string, request: Request): Promise<LifecycleOutcome> {
  const key = challengeIdSchema.safeParse(request.headers.get("Idempotency-Key"));
  const parsed = await writeRequest(id, request, lifecycleBody);
  if ("failure" in parsed) return parsed.failure as AuthorFailure;
  if (!key.success) return { status: "invalid" };
  const { caller, challengeId, body } = parsed;

  try {
    const { data, error } = await caller.client.rpc("change_author_challenge_lifecycle", {
      p_challenge_id: challengeId, p_action: action, p_idempotency_key: key.data, p_payload: body as Json,
    });
    if (error) return rpcFailure(error);
    const result = resultSchema.parse(data);
    return result.status === "ok" ? result : { status: result.status };
  } catch {
    return { status: "uncertain" };
  }
}
