import "server-only";
import { authorErrorMessages as messages, proposalMessages } from "@/lib/author/drafts";
import { publicationMessages } from "@/lib/author/publication";
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

/** INTEGRATION-SPEC §3 status and message for a recorded generation failure code. */
const generationErrors: Record<string, readonly [number, string]> = {
  VALIDATION_ERROR: [400, messages.invalid],
  UNAUTHENTICATED: [401, messages.unauthenticated],
  FORBIDDEN: [403, messages.forbidden],
  NOT_FOUND: [404, messages.notFound],
  VERSION_CONFLICT: [409, messages.versionConflict],
  // A generation INVALID_STATE means the draft became ineligible (archived) before completion.
  INVALID_STATE: [409, messages.archived],
  IDEMPOTENCY_CONFLICT: [409, messages.idempotencyConflict],
  PAYLOAD_TOO_LARGE: [413, proposalMessages.tooLarge],
  INVALID_AI_OUTPUT: [422, proposalMessages.invalidOutput],
  RATE_LIMITED: [429, proposalMessages.limited],
  AI_UNAVAILABLE: [502, proposalMessages.failed],
  SERVICE_UNAVAILABLE: [503, messages.unavailable],
  AI_TIMEOUT: [504, proposalMessages.timeout],
};

export function generationErrorResponse(code: string): Response {
  const known = Object.hasOwn(generationErrors, code);
  const [status, message] = known ? generationErrors[code] : generationErrors.SERVICE_UNAVAILABLE;
  return Response.json({ error: { code: known ? code : "SERVICE_UNAVAILABLE", message } }, { status, headers });
}

/** AUT-04.3: the final preview is unavailable until decisions are complete with one approval. */
export function previewIncompleteResponse(): Response {
  return Response.json({ error: { code: "INVALID_STATE", message: proposalMessages.undecided } }, { status: 409, headers });
}

/** AUT-05.1 and AUT-05.4: publication failures use the generation statuses with publication messages. */
const publicationErrors: Record<string, readonly [number, string, string]> = {
  NOT_PUBLISHABLE: [409, "INVALID_STATE", publicationMessages.ineligible],
  VERSION_CONFLICT: [409, "VERSION_CONFLICT", publicationMessages.changed],
  PAYLOAD_TOO_LARGE: [413, "PAYLOAD_TOO_LARGE", publicationMessages.tooLarge],
  INVALID_AI_OUTPUT: [422, "INVALID_AI_OUTPUT", publicationMessages.invalidOutput],
  RATE_LIMITED: [429, "RATE_LIMITED", publicationMessages.limited],
  AI_UNAVAILABLE: [502, "AI_UNAVAILABLE", publicationMessages.failed],
  AI_TIMEOUT: [504, "AI_TIMEOUT", publicationMessages.timeout],
};

export function publicationErrorResponse(code: string): Response {
  if (!Object.hasOwn(publicationErrors, code)) return generationErrorResponse(code);
  const [status, errorCode, message] = publicationErrors[code];
  return Response.json({ error: { code: errorCode, message } }, { status, headers });
}
