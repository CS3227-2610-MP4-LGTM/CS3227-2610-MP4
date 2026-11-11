import { readAuthorRevision } from "@/server/author/publication";
import { authorDataResponse, authorErrorResponse } from "@/server/author/responses";

type Context = { params: Promise<{ id: string; revisionId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id, revisionId } = await params;
  const result = await readAuthorRevision(id, revisionId, new URL(request.url).searchParams);
  return result.status === "ok" ? authorDataResponse(result.revision) : authorErrorResponse(result);
}
