import "server-only";
import { authorErrorMessages as messages } from "@/lib/author/drafts";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { accountAccessHeader } from "@/lib/learner/challenges";
import type { AuthorFailure } from "./drafts";

const headers = { "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0" };

const errors = {
  invalid: [400, "VALIDATION_ERROR", messages.invalid],
  unauthenticated: [401, "UNAUTHENTICATED", messages.unauthenticated],
  role_denied: [403, "FORBIDDEN", messages.forbidden],
  account_unavailable: [403, "FORBIDDEN", messages.forbidden],
  forbidden: [403, "FORBIDDEN", messages.forbidden],
  not_found: [404, "NOT_FOUND", messages.notFound],
  version_conflict: [409, "VERSION_CONFLICT", messages.versionConflict],
  invalid_state: [409, "INVALID_STATE", messages.archived],
  in_progress: [409, "INVALID_STATE", messages.inProgress],
  idempotency_conflict: [409, "IDEMPOTENCY_CONFLICT", messages.idempotencyConflict],
  too_large: [413, "PAYLOAD_TOO_LARGE", messages.tooLarge],
  account_service_unavailable: [503, "SERVICE_UNAVAILABLE", messages.unavailable],
  unavailable: [503, "SERVICE_UNAVAILABLE", messages.unavailable],
  uncertain: [503, "SERVICE_UNAVAILABLE", messages.uncertain],
} as const satisfies Record<AuthorFailure["status"], readonly [number, string, string]>;

export function authorDataResponse<T>(data: T, status = 200): Response {
  return Response.json({ data }, { status, headers });
}

export function authorErrorResponse(result: AuthorFailure): Response {
  const [status, code, message] = errors[result.status];
  const fieldErrors = result.status === "invalid" ? result.fieldErrors : undefined;
  const responseHeaders = isWorkspaceAccessFailure(result) ? { ...headers, [accountAccessHeader]: result.status } : headers;
  return Response.json({ error: { code, message, ...(fieldErrors && { fieldErrors }) } }, { status, headers: responseHeaders });
}
