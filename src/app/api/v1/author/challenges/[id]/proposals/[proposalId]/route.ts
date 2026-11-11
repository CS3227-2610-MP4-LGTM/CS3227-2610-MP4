import { decideAuthorProposal } from "@/server/author/proposals";
import { authorDataResponse, authorErrorResponse } from "@/server/author/responses";

type Context = { params: Promise<{ id: string; proposalId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { id, proposalId } = await params;
  const result = await decideAuthorProposal(id, proposalId, request);
  return result.status === "ok" ? authorDataResponse(result.draft) : authorErrorResponse(result);
}
