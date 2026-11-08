import { appendResolution } from "@/server/ta/moderation";
import { moderationBody, mutationResponse } from "@/server/ta/moderation-http";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
 const input = await moderationBody(request);
 if (input.status !== "ok") return mutationResponse(input);
 const result = await appendResolution((await context.params).id,input.body,input.key);
 return mutationResponse(result,result.status === "ok" ? result.flag : undefined);
}
