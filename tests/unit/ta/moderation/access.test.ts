// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { appendOverride, appendResolution, readFlagPage } from "@/server/ta/moderation";
import { POST as overridePost } from "@/app/api/v1/ta/submissions/[id]/overrides/route";
import { POST as resolutionPost } from "@/app/api/v1/ta/flags/[id]/resolutions/route";
import { GET as flagsGet } from "@/app/api/v1/ta/flags/route";
import { id } from "../inspection/evidence";
const mocks = vi.hoisted(() => ({ account: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.account }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: () => { throw new Error("No privileged human moderation"); } }));
vi.mock("@/server/llm/boundary", () => ({ createLlmBoundary: () => { throw new Error("No AI for moderation"); } }));
beforeEach(() => vi.resetAllMocks());
function request(kind: "override" | "resolution", body: string, requestKey = id(10001), origin = "http://localhost") {
  return new Request(`http://localhost/api/v1/ta/${kind === "override" ? `submissions/${id(501)}/overrides` : `flags/${id(801)}/resolutions`}`, { method: "POST", headers: { origin, "content-type": "application/json", "Idempotency-Key": requestKey }, body });
}
const contexts = { override: { params: Promise.resolve({ id: id(501) }) }, resolution: { params: Promise.resolve({ id: id(801) }) } };
it.each([
  [{ status: "unauthenticated" }, "unauthenticated", 401, "UNAUTHENTICATED"],
  [{ status: "forbidden" }, "account_unavailable", 403, "FORBIDDEN"],
  [{ status: "unavailable" }, "account_service_unavailable", 503, "SERVICE_UNAVAILABLE"],
  [{ status: "ok", account: { id: id(1), role: "author", displayName: "Author A" } }, "role_denied", 403, "FORBIDDEN"],
  [{ status: "ok", account: { id: id(11), role: "learner", displayName: "Learner A" } }, "role_denied", 403, "FORBIDDEN"],
] as const)("SYS-08.2 SYS-08.3 SYS-09 SYS-11 TA-02.8 TA-03.8 closes every moderation boundary for account %j", async (account, status, http, code) => {
  mocks.account.mockResolvedValue(account);
  const override = { score: 70, reason: "Evidence" }, resolution = { disposition: "upheld", reason: "Evidence" };
  expect(await appendOverride(id(501), override, id(10001))).toEqual({ status });
  expect(await appendResolution(id(801), resolution, id(10002))).toEqual({ status });
  expect(await readFlagPage(new URLSearchParams())).toEqual({ status });
  const responses = [await overridePost(request("override", JSON.stringify(override)), contexts.override),
    await resolutionPost(request("resolution", JSON.stringify(resolution)), contexts.resolution),
    await flagsGet(new Request("http://localhost/api/v1/ta/flags"))];
  for (const response of responses) {
    expect(response.status).toBe(http); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ error: expect.objectContaining({ code, message: expect.any(String) }) });
  }
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
});
it("SYS-09 SYS-11.4 TA-03.8 rechecks identity for each mutation instead of reusing a prior TA permission", async () => {
  mocks.account.mockResolvedValueOnce({ status: "ok", account: { id: id(21), role: "ta", displayName: "TA A" } }).mockResolvedValue({ status: "unauthenticated" });
  await appendOverride("invalid-id", { score: 70, reason: "Evidence" }, id(10001));
  expect(await appendOverride(id(501), { score: 70, reason: "Evidence" }, id(10002))).toEqual({ status: "unauthenticated" });
  expect(mocks.account).toHaveBeenCalledTimes(2); expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(["{broken", "null", "[]", '{"score":70,"reason":"Evidence","actorId":"forged"}'])("SYS-02.1 TA-03.2 rejects raw malformed/strict override body %s without writes", async body => {
  mocks.account.mockResolvedValue({ status: "ok", account: { id: id(21), role: "ta", displayName: "TA A" } });
  const response = await overridePost(request("override", body), contexts.override);
  expect(response.status).toBe(400); expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
});
it("SYS-16.2 rejects cross-origin cookie mutations before writes at both endpoints", async () => {
  mocks.account.mockResolvedValue({ status: "ok", account: { id: id(21), role: "ta", displayName: "TA A" } });
  for (const response of [await overridePost(request("override", '{"score":70,"reason":"Evidence"}', id(10001), "https://attacker.example"), contexts.override),
    await resolutionPost(request("resolution", '{"disposition":"upheld","reason":"Evidence"}', id(10002), "https://attacker.example"), contexts.resolution)]) {
    expect(response.status).toBe(403); expect((await response.json()).error.code).toBe("FORBIDDEN");
  }
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
});
