import { generateAuthorProposals } from "@/server/author/proposals";
import { authorDataResponse, authorErrorResponse, generationErrorResponse } from "@/server/author/responses";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const result = await generateAuthorProposals(id, request);
  if (result.status === "ok") return authorDataResponse(result.draft);
  return result.status === "failed" ? generationErrorResponse(result.code) : authorErrorResponse(result);
}
