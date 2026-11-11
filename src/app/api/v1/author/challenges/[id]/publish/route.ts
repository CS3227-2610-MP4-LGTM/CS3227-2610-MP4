import { publishAuthorChallenge } from "@/server/author/publication";
import { authorDataResponse, authorErrorResponse, publicationErrorResponse } from "@/server/author/responses";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const result = await publishAuthorChallenge(id, request);
  if (result.status === "ok") return authorDataResponse(result.publication, 201);
  return result.status === "failed" ? publicationErrorResponse(result.code) : authorErrorResponse(result);
}
