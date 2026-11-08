import { readChallengePage } from "@/server/learner/challenges";
import { learnerDataResponse, learnerErrorResponse } from "@/server/learner/responses";

export async function GET(request: Request) {
  const result = await readChallengePage(new URL(request.url).searchParams);
  return result.status === "ok" ? learnerDataResponse(result.page) : learnerErrorResponse(result);
}
