import { createAuthorDraft, readAuthorChallengePage } from "@/server/author/drafts";
import { authorDataResponse, authorErrorResponse } from "@/server/author/responses";

export async function GET(request: Request) {
  const result = await readAuthorChallengePage(new URL(request.url).searchParams);
  return result.status === "ok" ? authorDataResponse(result.page) : authorErrorResponse(result);
}

export async function POST(request: Request) {
  const result = await createAuthorDraft(request);
  return result.status === "ok" ? authorDataResponse(result.draft, 201) : authorErrorResponse(result);
}
