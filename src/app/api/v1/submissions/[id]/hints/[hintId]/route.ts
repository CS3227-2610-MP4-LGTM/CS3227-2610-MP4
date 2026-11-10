import { learnerDataResponse, learnerResultReadErrorResponse } from "@/server/learner/responses";
import { matchesWorkspaceAccount, readLearnerHint, submissionCaller } from "@/server/learner/submissions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; hintId: string }> }) {
  const caller = await submissionCaller();
  if (caller.status !== "ok") return learnerResultReadErrorResponse(caller);
  if (!matchesWorkspaceAccount(request, caller.account.id)) {
    return learnerResultReadErrorResponse({ status: "account_unavailable" });
  }
  if (new URL(request.url).searchParams.size) return learnerResultReadErrorResponse({ status: "invalid" });
  const { id, hintId } = await params;
  const result = await readLearnerHint(id, hintId, caller);
  return result.status === "ok" ? learnerDataResponse(result.hint) : learnerResultReadErrorResponse(result);
}
