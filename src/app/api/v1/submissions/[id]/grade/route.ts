import { requestLearnerGrade } from "@/server/learner/grade-submission";
import { learnerGradeResponse } from "@/server/learner/responses";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return learnerGradeResponse(await requestLearnerGrade(id, request));
}
