import { requestLearnerSummary } from "@/server/ta/summaries";
import { summaryResponse } from "@/server/ta/summary-http";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return summaryResponse(await requestLearnerSummary((await context.params).id, request), true);
}
