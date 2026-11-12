// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { z } from "zod";
import { card } from "./history-fixture";
import { challengeId, learnerId, submittedAt } from "./grading-fixture";
import { uid } from "../server/llm/fixtures";

const mocks = vi.hoisted(() => ({ getAccount: vi.fn(), rpc: vi.fn(), admin: vi.fn(), provider: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.getAccount }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/llm/provider", () => ({ createFakeProvider: mocks.provider }));
// New T-14 interfaces. Runtime imports keep missing acceptance interfaces out of baseline type errors.
const routeModule = "../../../src/app/api/v1/submissions/route.ts";
const schemaModule = "../../../src/lib/learner/history.ts";
async function get(search = "") {
  const { GET } = await import(routeModule) as { GET: (request: Request) => Promise<Response> };
  return GET(new Request(`https://app.example.test/api/v1/submissions${search ? `?${search}` : ""}`));
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAccount.mockResolvedValue({ status: "ok", account: { id: learnerId, role: "learner", displayName: "Learner A" } });
  mocks.rpc.mockResolvedValue({ data: { status: "ok", items: [card()] }, error: null });
});
it.each(["limit=0", "limit=51", "limit=1.5", "limit=-1", "limit=1e1", "limit=", "limit=20&limit=20", "cursor=", "cursor=broken", `cursor=${"x".repeat(513)}`, "cursor=a&cursor=b", "challengeId=bad", `challengeId=${challengeId}&challengeId=${challengeId}`, `learnerId=${learnerId}`, "role=learner", "order=best", "unexpected=x"])("LRN-08.3 SYS-02.1 rejects invalid/duplicate/forged query %s without a database read", async search => {
  const result = await get(search);
  expect(result.status).toBe(400);
  expect(await result.json()).toEqual({ error: { code: "VALIDATION_ERROR", message: expect.any(String) } });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([20, 1, 50])("LRN-08.3 uses bounded limit %i and caller-scoped read arguments", async limit => {
  const result = await get(limit === 20 ? "" : `limit=${limit}`);
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ data: { items: [card()], nextCursor: null } });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("list_learner_submissions", expect.objectContaining({ p_limit: limit }));
  expect(JSON.stringify(mocks.rpc.mock.calls[0])).not.toContain("learner_id");
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.provider).not.toHaveBeenCalled();
  expect(result.headers.get("Cache-Control")).toMatch(/no-store/);
});
it("LRN-08.3 issues a bounded opaque tie cursor, binds the optional challenge filter and rejects reuse with different filters", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: { status: "ok", items: [card(), card({ id: uid(502) })] }, error: null });
  const first = await get(`limit=1&challengeId=${challengeId}`);
  const { data } = await first.json();
  expect(data.items).toHaveLength(1);
  expect(typeof data.nextCursor).toBe("string");
  expect(data.nextCursor.length).toBeLessThanOrEqual(512);
  await get(`limit=1&challengeId=${challengeId}&cursor=${encodeURIComponent(data.nextCursor)}`);
  expect(mocks.rpc).toHaveBeenLastCalledWith("list_learner_submissions", expect.objectContaining({ p_challenge_id: challengeId, p_before: submittedAt, p_after_id: card().id }));
  mocks.rpc.mockClear();
  expect((await get(`cursor=${encodeURIComponent(data.nextCursor)}`)).status).toBe(400);
  expect((await get(`challengeId=${uid(102)}&cursor=${encodeURIComponent(data.nextCursor)}`)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
  ["unauthenticated", 401, "UNAUTHENTICATED"], ["forbidden", 403, "FORBIDDEN"], ["unavailable", 503, "SERVICE_UNAVAILABLE"],
] as const)("LRN-08.8 SYS-11 preserves account failure %s without reading records", async (status, http, code) => {
  mocks.getAccount.mockResolvedValue({ status });
  const result = await get();
  expect(result.status).toBe(http);
  expect(await result.json()).toEqual({ error: { code, message: expect.any(String) } });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(["ta", "author"])("LRN-08.1 SYS-08 rejects stored role %s despite a forged learner query", async role => {
  mocks.getAccount.mockResolvedValue({ status: "ok", account: { id: learnerId, role, displayName: role } });
  expect((await get()).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
  { data: null, error: { message: "private database diagnostics", code: "XX000" } },
  { data: { status: "ok", items: [card({ effectiveScore: 101 })] }, error: null },
  { data: { status: "ok", items: [card({ learner: { id: uid(12), displayName: "Other learner" } })] }, error: null },
  { data: { status: "ok", items: [card({ answerKey: "private answer" })] }, error: null },
  { data: { status: "ok", items: [card({ gradingState: "failed", effectiveScore: 0 })] }, error: null },
])("LRN-08.3 SYS-04 fails a broken or unsafe projection as unavailable, never empty", async result => {
  mocks.rpc.mockResolvedValue(result);
  const response = await get();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: { code: "SERVICE_UNAVAILABLE", message: expect.any(String) } });
});
it("LRN-08.1 LRN-08.2 strictly validates exact bounded Page<SubmissionCard> without private fields", async () => {
  const { submissionPageSchema } = await import(schemaModule) as { submissionPageSchema: z.ZodType };
  const valid = { items: [card()], nextCursor: null };
  expect(submissionPageSchema.safeParse(valid).success).toBe(true);
  for (const bad of [
    { ...valid, count: 1 }, { ...valid, nextCursor: "x".repeat(513) }, { ...valid, items: Array.from({ length: 51 }, () => card()) },
    ...["email", "workingCode", "realDiff", "answerKey"].map(key => ({ ...valid, items: [card({ [key]: "private" })] })),
    { ...valid, items: [card({ learner: { ...card().learner, email: "private@example.test" } })] },
    ...[-1, 1.5, 101].map(effectiveScore => ({ ...valid, items: [card({ effectiveScore })] })),
    { ...valid, items: [card({ attemptNumber: 3 })] }, { ...valid, items: [card({ openFlagCount: -1 })] },
    { ...valid, items: [card({ gradingState: "completed", effectiveScore: null })] },
  ]) expect(submissionPageSchema.safeParse(bad).success).toBe(false);
  for (const gradingState of ["pending", "running", "failed"]) {
    expect(submissionPageSchema.safeParse({ ...valid, items: [card({ gradingState, effectiveScore: null })] }).success).toBe(true);
    expect(submissionPageSchema.safeParse({ ...valid, items: [card({ gradingState, effectiveScore: 0 })] }).success).toBe(false);
  }
  expect(submissionPageSchema.safeParse({ ...valid, items: [card({ effectiveScore: 0 })] }).success).toBe(true);
});
