// @vitest-environment node
import { expect, it, vi } from "vitest";
import { moderationBody, mutationResponse } from "@/server/ta/moderation-http";
vi.mock("server-only", () => ({}));
function request(origin: string | null, host = "127.0.0.1:3100", forwardedHost?: string) {
 return new Request("http://localhost:3100/api/v1/ta/flags/x/resolutions", {method: "POST",headers: {host,...(origin ? {origin} : {}),...(forwardedHost ? {"x-forwarded-host": forwardedHost} : {})},body: JSON.stringify({disposition: "upheld",reason: "Evidence"})});
}
it("uses incoming authority when Next normalizes the internal request hostname", async () => {
 expect((await moderationBody(request("http://127.0.0.1:3100"))).status).toBe("ok");
});
it.each([null,"https://attacker.example","http://localhost:3100","https://127.0.0.1:3100"])("rejects missing or foreign origin %s even with forwarded host", async origin => {
 expect(await moderationBody(request(origin,"127.0.0.1:3100","attacker.example"))).toEqual({status: "role_denied"});
});
it("bounds the raw byte stream and returns an uncached 413 envelope", async () => {
 const result=await moderationBody(new Request("http://localhost/api/v1/ta/flags/x/resolutions", {method: "POST",headers: {origin: "http://localhost"},body: "a".repeat(32769)}));
 expect(result).toEqual({status: "payload_too_large"});
 const response=mutationResponse({status: "payload_too_large"});
 expect(response.status).toBe(413); expect(response.headers.get("cache-control")).toContain("no-store");
 expect((await response.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
});
