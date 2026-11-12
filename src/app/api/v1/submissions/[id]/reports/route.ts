import { createLearnerReport } from "@/server/learner/reports";
import { learnerReportResponse } from "@/server/learner/responses";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return learnerReportResponse(await createLearnerReport(id, request));
}
