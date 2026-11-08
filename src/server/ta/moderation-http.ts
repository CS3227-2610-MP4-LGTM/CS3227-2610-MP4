import "server-only";
import type { MutationFailure } from "@/lib/ta/moderation";
import { dataResponse, errorResponse } from "./responses";
export function mutationResponse(result: { status: "ok" | "payload_too_large" } | MutationFailure, data?: unknown): Response {
 if (result.status === "ok") { const response=dataResponse(data); return new Response(response.body, { status: 201, headers: response.headers }); }
 if (result.status === "payload_too_large") return Response.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "The moderation request is too large." } }, { status: 413, headers: { "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0" } });
 const code = result.status === "invalid_state" ? "INVALID_STATE" : result.status === "conflict" ? "VERSION_CONFLICT" : result.status === "idempotency_conflict" ? "IDEMPOTENCY_CONFLICT" : null;
 if (code) return Response.json({ error: { code, message: "Refresh before starting a new moderation action." } }, { status: 409, headers: { "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0" } });
 return errorResponse(result as Exclude<MutationFailure, {status: "invalid_state" | "conflict" | "idempotency_conflict"}>);
}
export async function moderationBody(request: Request): Promise<{ status: "ok"; body: unknown; key: string } | { status: "invalid" | "role_denied" | "payload_too_large" }> {
 // Next may use an internal hostname in request.url. Host is the incoming HTTP
 // authority browsers send, not a client-selectable forwarded-host header.
 const target=new URL(request.url), host=request.headers.get("host");
 if (host) {
  if (!/^[A-Za-z0-9.:[\]-]+$/.test(host)) return { status: "role_denied" };
  target.host=host;
 }
 if (request.headers.get("origin") !== target.origin) return { status: "role_denied" };
 try {
  // Bound decoding as well as canonical field lengths, including unknown fields.
  const reader = request.body?.getReader();
  if (!reader) return { status: "invalid" };
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 32768) { await reader.cancel(); return { status: "payload_too_large" }; } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return { status: "ok", body: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), key: request.headers.get("Idempotency-Key") ?? "" };
 } catch { return { status: "invalid" }; }
}
