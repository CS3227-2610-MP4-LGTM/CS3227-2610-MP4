import "server-only";

export type JsonBody = { status: "ok"; value: unknown } | { status: "too_large" | "invalid" };

/** Reads at most `limit` UTF-8 bytes before parsing, so oversized envelopes never reach JSON.parse. */
export async function readJsonBody(request: Request, limit: number): Promise<JsonBody> {
  const reader = request.body?.getReader();
  if (!reader) return { status: "invalid" };
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        void reader.cancel().catch(() => {});
        return { status: "too_large" };
      }
      chunks.push(chunk.value);
    }
    const body = chunks.map(chunk => decoder.decode(chunk, { stream: true })).join("") + decoder.decode();
    return { status: "ok", value: JSON.parse(body) as unknown };
  } catch {
    return { status: "invalid" };
  } finally {
    reader.releaseLock();
  }
}

/** SYS-16.2: a cookie-authenticated mutation accepts only a same-origin or absent Origin. */
export function matchesRequestOrigin(request: Request, url: URL) {
  const origin = request.headers.get("Origin");
  const host = request.headers.get("Host");
  if (host === null) return origin === null || origin === url.origin;
  // Next can put its internal hostname in Request.url. Use the inbound Host
  // authority with Next's protocol, never a forwarded host from the caller.
  if (!/^(?:[a-z0-9.-]+|\[[a-f0-9:.]+\])(?::\d+)?$/i.test(host)) return false;
  try {
    const inbound = new URL(`${url.protocol}//${host}`);
    if (!inbound.hostname.startsWith("[") && !inbound.hostname.replace(/\.$/, "").split(".").every(
      label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
    )) return false;
    return origin === null || origin === inbound.origin;
  } catch {
    return false;
  }
}
