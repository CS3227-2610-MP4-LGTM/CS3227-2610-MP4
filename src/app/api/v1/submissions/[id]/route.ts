import { learnerDataResponse, learnerResultReadErrorResponse } from "@/server/learner/responses";
import { matchesWorkspaceAccount, readLearnerSubmissionWithAccess, submissionCaller } from "@/server/learner/submissions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await submissionCaller();
  if (caller.status !== "ok") return learnerResultReadErrorResponse(caller);
  if (!matchesWorkspaceAccount(request, caller.account.id)) {
    return learnerResultReadErrorResponse({ status: "account_unavailable" });
  }
  const { id } = await params;
  if (new URL(request.url).searchParams.size) return learnerResultReadErrorResponse({ status: "invalid" });
  const result = await readLearnerSubmissionWithAccess(id, caller);
  return result.status === "ok" ? learnerDataResponse(result.submission) : learnerResultReadErrorResponse(result);
}
