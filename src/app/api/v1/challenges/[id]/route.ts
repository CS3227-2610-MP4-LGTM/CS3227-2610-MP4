import { readChallengeWithAccess } from "@/server/learner/challenges";
import { learnerDataResponse, learnerErrorResponse } from "@/server/learner/responses";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await readChallengeWithAccess(id, new URL(request.url).searchParams);
  return result.status === "ok" ? learnerDataResponse(result.challenge) : learnerErrorResponse(result);
}
