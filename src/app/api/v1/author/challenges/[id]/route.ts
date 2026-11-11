import { readAuthorDraft, updateAuthorDraft } from "@/server/author/drafts";
import { authorDataResponse, authorErrorResponse } from "@/server/author/responses";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const result = await readAuthorDraft(id, new URL(request.url).searchParams);
  return result.status === "ok" ? authorDataResponse(result.draft) : authorErrorResponse(result);
}

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const result = await updateAuthorDraft(id, request);
  return result.status === "ok" ? authorDataResponse(result.draft) : authorErrorResponse(result);
}
