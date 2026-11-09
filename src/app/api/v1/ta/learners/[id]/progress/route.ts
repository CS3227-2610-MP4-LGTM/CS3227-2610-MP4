import { readCategoryProgress } from "@/server/ta/progress";
import { dataResponse, errorResponse } from "@/server/ta/responses";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const result = await readCategoryProgress((await params).id, new URL(request.url).searchParams);
  return result.status === "ok" ? dataResponse(result.progress) : errorResponse(result);
}
