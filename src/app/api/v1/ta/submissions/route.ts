import { readSubmissionPage } from "@/server/ta/submissions";
import { dataResponse, errorResponse } from "@/server/ta/responses";
export async function GET(request: Request): Promise<Response> {
  const result = await readSubmissionPage(new URL(request.url).searchParams);
  return result.status === "ok" ? dataResponse(result.page) : errorResponse(result);
}
