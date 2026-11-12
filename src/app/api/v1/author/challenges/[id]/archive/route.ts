import { changeAuthorLifecycle } from "@/server/author/lifecycle";
import { authorDataResponse, lifecycleErrorResponse } from "@/server/author/responses";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const result = await changeAuthorLifecycle("archive", id, request);
  return result.status === "ok" ? authorDataResponse(result.challenge) : lifecycleErrorResponse(result);
}
