import { readSubmission } from "@/server/ta/submissions";
import { dataResponse, errorResponse } from "@/server/ta/responses";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  // The application read still enforces account authorization for direct entry.
  const result = await readSubmission(new URL(request.url).searchParams.size ? "" : id);
  return result.status === "ok" ? dataResponse(result.submission) : errorResponse(result);
}
