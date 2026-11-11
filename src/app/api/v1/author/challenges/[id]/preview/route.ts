import { readAuthorPreview } from "@/server/author/proposals";
import { authorDataResponse, authorErrorResponse, previewIncompleteResponse } from "@/server/author/responses";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const result = await readAuthorPreview(id, new URL(request.url).searchParams);
  if (result.status === "ok") return authorDataResponse(result.preview);
  return result.status === "incomplete" ? previewIncompleteResponse() : authorErrorResponse(result);
}
