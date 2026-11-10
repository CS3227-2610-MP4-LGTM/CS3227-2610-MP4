// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/ta/learners/[id]/summary/route";
import { POST } from "@/app/api/v1/ta/learners/[id]/summaries/route";
import { readLearnerSummary, requestLearnerSummary } from "@/server/ta/summaries";
import { id } from "./evidence";
const mocks = vi.hoisted(() => ({ account: vi.fn(), rpc: vi.fn(), from: vi.fn(), admin: vi.fn(), provider: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.account }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/llm/boundary", () => ({ createLlmBoundary: mocks.provider }));
const ctx = (learnerId = id(11)) => ({ params: Promise.resolve({ id: learnerId }) });
function request(options: { method?: string; body?: string; key?: string | null; origin?: string | null; query?: string; account?: string } = {}) {
  const headers = new Headers({ "Content-Type": "application/json", "X-LGTM-Workspace-Account-Id": options.account ?? id(21) });
  if (options.key !== null) headers.set("Idempotency-Key", options.key ?? id(56011));
  if (options.origin !== null) headers.set("Origin", options.origin ?? "http://localhost");
  const method = options.method ?? "POST";
  return new Request(`http://localhost/api/v1/ta/learners/${id(11)}/${method === "GET" ? "summary" : "summaries"}${options.query ?? ""}`, { method, headers, ...(method === "POST" ? { body: options.body ?? "{}" } : {}) });
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.admin.mockImplementation(() => { throw new Error("No unauthorized privileged call"); });
  mocks.provider.mockImplementation(() => { throw new Error("No unauthorized provider"); });
  mocks.rpc.mockResolvedValue({ error: null, data: { status: "ok", learner: { id: id(11), displayName: "Learner A" } } });
});
it.each([
  [{ status: "unauthenticated" }, 401, "UNAUTHENTICATED", "unauthenticated"],
  [{ status: "forbidden" }, 403, "FORBIDDEN", "account_unavailable"],
  [{ status: "unavailable" }, 503, "SERVICE_UNAVAILABLE", "account_service_unavailable"],
  [{ status: "ok", account: { id: id(11), role: "learner" } }, 403, "FORBIDDEN", "role_denied"],
  [{ status: "ok", account: { id: id(1), role: "author" } }, 403, "FORBIDDEN", "role_denied"],
] as const)("SYS-08.2 SYS-11 SEC-01.1 denies %j at direct summary services and routes before any data/accounting/dispatch", async (account, http, code, status) => {
  mocks.account.mockResolvedValue(account);
  expect(await readLearnerSummary(id(11))).toEqual({ status });
  expect(await requestLearnerSummary(id(11), request())).toEqual({ status });
  for (const response of [await GET(request({ method: "GET" }), ctx()), await POST(request(), ctx())]) {
    expect(response.status).toBe(http); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ error: expect.objectContaining({ code, message: expect.any(String) }) });
  }
  expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
});
it.each([
  { key: null }, { key: "forged" }, { body: "{" }, { body: "null" }, { body: "[]" },
  { body: JSON.stringify({ evidence: [id(503)] }) }, { body: JSON.stringify({ actorId: id(22) }) },
  { body: JSON.stringify({ inputFingerprint: "forged", output: {} }) }, { body: JSON.stringify({ accountId: id(22), inputTokens: 0 }) },
  { query: "?learnerId=forged" }, { query: "?__proto__=bypass" },
])("SYS-02.1 SEC-01.1 rejects malformed/forged summary request %j before privileged work", async options => {
  mocks.account.mockResolvedValue({ status: "ok", account: { id: id(21), role: "ta" } });
  const response = await POST(request(options), ctx()); expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: expect.objectContaining({ code: "VALIDATION_ERROR" }) });
  expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
});
it("SYS-02.1 SEC-04.1 rejects bodies beyond 128 KiB without parsing, reservation or dispatch", async () => {
  mocks.account.mockResolvedValue({ status: "ok", account: { id: id(21), role: "ta" } });
  const response = await POST(request({ body: " ".repeat(131073) }), ctx()); expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ error: expect.objectContaining({ code: "PAYLOAD_TOO_LARGE" }) });
  expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
});
it("SYS-02.1 SYS-16.2 validates resource/query/origin before dispatch and never trusts a caller account header", async () => {
  mocks.account.mockResolvedValue({ status: "ok", account: { id: id(21), role: "ta" } });
  expect((await GET(request({ method: "GET" }), ctx("not-a-uuid"))).status).toBe(400);
  expect((await GET(request({ method: "GET", query: "?output=all" }), ctx())).status).toBe(400);
  expect((await POST(request(), ctx("not-a-uuid"))).status).toBe(400);
  expect((await POST(request({ origin: "https://attacker.invalid" }), ctx())).status).toBe(403);
  const changed = await POST(request({ account: id(22) }), ctx()); expect(changed.status).toBe(403);
  expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
});
