import { learnerSubmissionResponse } from "@/server/learner/responses";
import { createLearnerSubmission } from "@/server/learner/submissions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return learnerSubmissionResponse(await createLearnerSubmission(id, request));
}
