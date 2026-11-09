import { readRecommendations } from "@/server/ta/progress";
import { dataResponse, errorResponse } from "@/server/ta/responses";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const result = await readRecommendations((await params).id, new URL(request.url).searchParams);
  return result.status === "ok" ? dataResponse(result.recommendations) : errorResponse(result);
}
