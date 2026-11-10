import "server-only";
import type { SummaryGenerationResult, SummaryReadResult } from "@/lib/ta/summaries";
import { errorResponse } from "./responses";
const headers = { "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0" };
export function summaryResponse(result: SummaryReadResult | SummaryGenerationResult, mutation = false) {
  if (result.status === "ok") return Response.json({ data: mutation ? result.summary : { summary: result.summary, stale: "stale" in result ? result.stale : false } }, { status: mutation ? 201 : 200, headers });
  if (result.status !== "failed") return errorResponse(result);
  const code = result.code;
  const statuses: Record<string, number> = { INVALID_STATE: 409, IDEMPOTENCY_CONFLICT: 409, VERSION_CONFLICT: 409, PAYLOAD_TOO_LARGE: 413, RATE_LIMITED: 429, AI_TIMEOUT: 504, INVALID_AI_OUTPUT: 422, AI_UNAVAILABLE: 502, SERVICE_UNAVAILABLE: 503, FORBIDDEN: 403, UNAUTHENTICATED: 401, NOT_FOUND: 404, VALIDATION_ERROR: 400 };
  return Response.json({ error: { code: statuses[code] ? code : "SERVICE_UNAVAILABLE", message: "We couldn't complete the summary request. Try again." } }, { status: statuses[code] ?? 503, headers });
}
