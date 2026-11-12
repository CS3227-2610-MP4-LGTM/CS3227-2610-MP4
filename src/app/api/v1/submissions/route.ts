import { readSubmissionPageWithAccess } from "@/server/learner/history";
import { learnerDataResponse, learnerErrorResponse } from "@/server/learner/responses";

export async function GET(request: Request) {
  const result = await readSubmissionPageWithAccess(new URL(request.url).searchParams);
  return result.status === "ok" ? learnerDataResponse(result.page) : learnerErrorResponse(result);
}
