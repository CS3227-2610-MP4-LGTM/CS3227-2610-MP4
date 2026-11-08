import "server-only";
import type { ReadFailure } from "@/lib/ta/submissions";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { accountAccessHeader } from "@/lib/learner/challenges";
const headers = { "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0" };
export function dataResponse(data: unknown) { return Response.json({ data }, { headers }); }
export function errorResponse(failure: ReadFailure) {
  const status = failure.status;
  const [http, code, message] = status === "invalid" ? [400, "VALIDATION_ERROR", "The submission request is invalid."]
    : status === "unauthenticated" ? [401, "UNAUTHENTICATED", "Sign in to continue."]
    : status === "role_denied" || status === "account_unavailable" ? [403, "FORBIDDEN", "This item isn't available to your account."]
    : status === "not_found" ? [404, "NOT_FOUND", "Submission not found."]
    : [503, "SERVICE_UNAVAILABLE", "We couldn't complete the submission request. Try again."];
  return Response.json({ error: { code, message } }, { status: http as number, headers: { ...headers, ...(isWorkspaceAccessFailure(failure) ? { [accountAccessHeader]: status } : {}) } });
}
