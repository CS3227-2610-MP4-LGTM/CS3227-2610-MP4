import { readLearnerSummary } from "@/server/ta/summaries";
import { summaryResponse } from "@/server/ta/summary-http";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return summaryResponse(await readLearnerSummary((await context.params).id, new URL(request.url).searchParams));
}
