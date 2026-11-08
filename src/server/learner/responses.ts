import "server-only";
import { isWorkspaceAccessFailure, type WorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { accountAccessHeader, genericReadFailure, type ReadFailure } from "@/lib/learner/challenges";

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
