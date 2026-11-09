import "server-only";
import { isWorkspaceAccessFailure, type WorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { accountAccessHeader, genericReadFailure, type ReadFailure } from "@/lib/learner/challenges";
import { submissionErrorMessages, submissionOutcomeMessages } from "@/lib/learner/submissions";
import type { CreateSubmissionResult } from "./submissions";

const headers = { "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0" };

export function learnerDataResponse<T>(data: T): Response {
  return Response.json({ data }, { headers });
}

const errors = {
  invalid: [400, "VALIDATION_ERROR", "The challenge request is invalid."],
  unauthenticated: [401, "UNAUTHENTICATED", "Sign in to continue."],
  forbidden: [403, "FORBIDDEN", "This item isn't available to your account."],
  not_found: [404, "NOT_FOUND", "We couldn't find this challenge."],
  unavailable: [503, "SERVICE_UNAVAILABLE", "We couldn't complete the challenge request. Try again."],
} as const satisfies Record<ReadFailure["status"], readonly [number, string, string]>;

export function learnerErrorResponse(result: ReadFailure | WorkspaceAccessFailure): Response {
  const [failure, responseHeaders] = isWorkspaceAccessFailure(result)
    ? [genericReadFailure(result), { ...headers, [accountAccessHeader]: result.status }] as const
    : [result, headers] as const;
  const [status, code, message] = errors[failure.status];
  return Response.json({ error: { code, message } }, { status, headers: responseHeaders });
}

const submissionErrors = {
  invalid: [400, "VALIDATION_ERROR", submissionOutcomeMessages.invalid],
  forbidden: errors.forbidden,
  not_found: [404, "NOT_FOUND", submissionOutcomeMessages.notFound],
  lifecycle_unavailable: [409, "INVALID_STATE", submissionErrorMessages.lifecycleUnavailable],
  version_conflict: [409, "VERSION_CONFLICT", submissionOutcomeMessages.stale],
  attempt_limit: [409, "ATTEMPT_LIMIT", submissionOutcomeMessages.attemptLimit],
  in_progress: [409, "INVALID_STATE", submissionErrorMessages.inProgress],
  idempotency_conflict: [409, "IDEMPOTENCY_CONFLICT", submissionOutcomeMessages.conflict],
  too_large: [413, "PAYLOAD_TOO_LARGE", submissionOutcomeMessages.tooLarge],
  rate_limited: [429, "RATE_LIMITED", submissionOutcomeMessages.rateLimited],
  unavailable: [503, "SERVICE_UNAVAILABLE", submissionErrorMessages.submissionUnavailable],
  uncertain: [503, "SERVICE_UNAVAILABLE", submissionOutcomeMessages.uncertain],
} as const;

export function learnerSubmissionResponse(result: CreateSubmissionResult): Response {
  if (result.status === "ok") return Response.json({ data: result.submission }, { status: 201, headers });
  if (result.status === "account_service_unavailable") {
    return Response.json({ error: { code: "SERVICE_UNAVAILABLE", message: submissionErrorMessages.accountServiceUnavailable } },
      { status: 503, headers: { ...headers, [accountAccessHeader]: result.status } });
  }
  if (isWorkspaceAccessFailure(result)) return learnerErrorResponse(result);
  const [status, code, message] = submissionErrors[result.status];
  const fieldErrors = result.status === "invalid" ? result.fieldErrors : undefined;
  return Response.json({ error: { code, message, ...(fieldErrors && { fieldErrors }) } }, { status, headers });
}
