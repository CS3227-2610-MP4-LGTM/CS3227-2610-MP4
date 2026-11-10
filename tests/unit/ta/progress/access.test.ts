// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { readLearner, readLearnerPage, readCategoryProgress, readRecommendations } from "@/server/ta/progress";
import { GET as list } from "@/app/api/v1/ta/learners/route";
import { GET as progress } from "@/app/api/v1/ta/learners/[id]/progress/route";
import { GET as recommendations } from "@/app/api/v1/ta/learners/[id]/recommendations/route";
import { id } from "./evidence";
const mocks = vi.hoisted(() => ({ account: vi.fn(), rpc: vi.fn(), from: vi.fn(), admin: vi.fn(), provider: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.account }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/llm/boundary", () => ({ createLlmBoundary: mocks.provider }));
beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockImplementation(() => { throw new Error("No privileged progress read"); }); mocks.provider.mockImplementation(() => { throw new Error("No provider on read"); }); });
const request = (suffix = "", query = "") => new Request(`http://localhost/api/v1/ta/learners${suffix}?${query}`);
const ctx = (learnerId = id(11)) => ({ params: Promise.resolve({ id: learnerId }) });
it.each([
  [{ status: "unauthenticated" }, 401, "UNAUTHENTICATED", "unauthenticated"],
  [{ status: "forbidden" }, 403, "FORBIDDEN", "account_unavailable"],
  [{ status: "unavailable" }, 503, "SERVICE_UNAVAILABLE", "account_service_unavailable"],
  [{ status: "ok", account: { id: id(11), role: "learner" } }, 403, "FORBIDDEN", "role_denied"],
  [{ status: "ok", account: { id: id(1), role: "author" } }, 403, "FORBIDDEN", "role_denied"],
] as const)("SYS-08.2 SYS-11 TA-05.7 fails closed for %j at every direct entry point without fallback or side effects", async (account, http, code, status) => {
  mocks.account.mockResolvedValue(account);
  for (const result of [await readLearner(id(11)), await readLearnerPage(new URLSearchParams()),
    await readCategoryProgress(id(11)), await readRecommendations(id(11), new URLSearchParams())]) expect(result).toEqual({ status });
  for (const response of [await list(request()), await progress(request(`/${id(11)}/progress`), ctx()), await recommendations(request(`/${id(11)}/recommendations`), ctx())]) {
    expect(response.status).toBe(http); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ error: expect.objectContaining({ code, message: expect.any(String) }) });
  }
  expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
});
it("SYS-02.1 TA-04.2 TA-05.3 validates strict bounds, IDs and queries before protected data reads", async () => {
  mocks.account.mockResolvedValue({ status: "ok", account: { id: id(21), role: "ta" } });
  for (const query of ["limit=0", "limit=51", "limit=1.5", "limit=1&limit=2", "cursor=bad", `cursor=${"a".repeat(513)}`, "role=ta", "learnerId=forged"]) {
    expect(await readLearnerPage(new URLSearchParams(query))).toEqual({ status: "invalid" });
  }
  for (const query of ["limit=0", "limit=11", "limit=1.5", "limit=1&limit=2", "cursor=bad", "actorId=forged"]) {
    expect(await readRecommendations(id(11), new URLSearchParams(query))).toEqual({ status: "invalid" });
  }
  expect(await readLearner("bad")).toEqual({ status: "invalid" });
  expect(await readCategoryProgress("bad")).toEqual({ status: "invalid" });
  expect(await readRecommendations("bad", new URLSearchParams())).toEqual({ status: "invalid" });
  expect((await progress(request(`/${id(11)}/progress`, "extra=true"), ctx())).status).toBe(400);
  expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
});
it("SYS-11.4 TA-05.6 database failure is unavailable, never empty progress or recommendations", async () => {
  mocks.account.mockResolvedValue({ status: "ok", account: { id: id(21), role: "ta" } });
  mocks.from.mockImplementation(() => { throw new Error("private database diagnostic"); });
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "private database diagnostic" } });
  expect(await readLearnerPage(new URLSearchParams())).toEqual({ status: "unavailable" });
  expect(await readLearner(id(11))).toEqual({ status: "unavailable" });
  expect(await readCategoryProgress(id(11))).toEqual({ status: "unavailable" });
  expect(await readRecommendations(id(11), new URLSearchParams())).toEqual({ status: "unavailable" });
  for (const response of [await list(request()), await progress(request(`/${id(11)}/progress`), ctx()), await recommendations(request(`/${id(11)}/recommendations`), ctx())]) {
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("private database diagnostic");
  }
  expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
});
it.each([
  ["directory", "__proto__=unknown"],
  ["directory", "__proto__=first&__proto__=second"],
  ["recommendations", "__proto__=unknown"],
  ["recommendations", "__proto__=first&__proto__=second"],
] as const)("SYS-02.1 SEC-REV-02 %s rejects %s before protected reads", async (section, query) => {
  mocks.account.mockResolvedValue({ status: "ok", account: { id: id(21), role: "ta" } });
  // Valid read responses expose a parser bypass as successful access, rather
  // than an unrelated missing-mock or database failure.
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "list_ta_learners"
    ? { status: "ok", items: [], anchors: [] }
    : { status: "ok", learner: { id: id(11), displayName: "Learner A" } } }));
  mocks.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [], error: null }) });
  const result = section === "directory" ? await readLearnerPage(new URLSearchParams(query)) : await readRecommendations(id(11), new URLSearchParams(query));
  expect.soft(result).toEqual({ status: "invalid" });
  const response = section === "directory" ? await list(request("", query)) : await recommendations(request(`/${id(11)}/recommendations`, query), ctx());
  expect.soft(response.status).toBe(400);
  expect.soft(await response.json()).toEqual({ error: expect.objectContaining({ code: "VALIDATION_ERROR", message: expect.any(String) }) });
  expect.soft(mocks.from).not.toHaveBeenCalled(); expect.soft(mocks.rpc).not.toHaveBeenCalled();
  expect.soft(mocks.admin).not.toHaveBeenCalled(); expect.soft(mocks.provider).not.toHaveBeenCalled();
});
