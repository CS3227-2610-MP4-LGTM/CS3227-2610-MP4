// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/ta/learners/[id]/summaries/route";
import { accountAccessHeader } from "@/lib/learner/challenges";
import { inputs, outputs } from "../../server/llm/fixtures";
import { id } from "./evidence";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), rpc: vi.fn(), persist: vi.fn(), capture: vi.fn(), execute: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.account }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.persist }) }));
vi.mock("@/server/llm/summary-snapshot", () => ({ captureSummary: mocks.capture }));
vi.mock("@/server/llm/accounting", () => ({ createAccountingStore: () => ({ reserve: vi.fn(), settle: vi.fn() }) }));
vi.mock("@/server/llm/boundary", () => ({ createLlmBoundary: () => ({ execute: mocks.execute }) }));

const initialAccount = { status: "ok", account: { id: id(21), displayName: "TA A", role: "ta" } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValueOnce(initialAccount);
  mocks.rpc.mockResolvedValue({ error: null, data: { status: "ok", learner: { id: id(11), displayName: "Learner A" } } });
  mocks.capture.mockResolvedValue({ snapshot: inputs.summarize_learner, fingerprint: "a".repeat(64), retainedFlaws: [] });
  mocks.persist.mockResolvedValue({ error: null, data: { status: "started" } });
  mocks.execute.mockResolvedValue({ data: outputs.summarize_learner, meta: { attempts: 1, outputRetried: false, deadline: Date.now() + 35_000 } });
});

it.each([
  { finalAccount: { status: "unauthenticated" }, http: 401, code: "UNAUTHENTICATED", recovery: "unauthenticated" },
  { finalAccount: { status: "unavailable" }, http: 503, code: "SERVICE_UNAVAILABLE", recovery: "account_service_unavailable" },
  { finalAccount: { status: "forbidden" }, http: 403, code: "FORBIDDEN", recovery: "account_unavailable" },
  { finalAccount: { status: "ok", account: { id: id(22), displayName: "TA B", role: "ta" } }, http: 403, code: "FORBIDDEN", recovery: "account_unavailable" },
])("SYS-11.1 SYS-11.4 TA-04.7 final account recheck preserves $recovery without publishing generated output", async ({ finalAccount, http, code, recovery }) => {
  // SEC-REV-01: initial authorization and generation succeed; only the final
  // pre-persistence account check fails. These are not initial-access tests.
  mocks.account.mockResolvedValueOnce(finalAccount);
  const response = await POST(new Request(`http://localhost/api/v1/ta/learners/${id(11)}/summaries`, {
    method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json", "Idempotency-Key": id(56012) }, body: "{}",
  }), { params: Promise.resolve({ id: id(11) }) });

  expect(mocks.account).toHaveBeenCalledTimes(2);
  expect(mocks.execute).toHaveBeenCalledTimes(1);
  expect(mocks.capture).toHaveBeenCalledTimes(1);
  expect(mocks.persist).toHaveBeenCalledTimes(1);
  expect(mocks.persist).toHaveBeenCalledWith("persist_ta_summary", { p_input: {
    accountId: id(21), learnerId: id(11), idempotencyKey: id(56012), action: "claim",
  } });
  expect(mocks.persist.mock.calls.some(([, args]) => args.p_input.action === "complete")).toBe(false);
  expect(response.status).toBe(http);
  expect(response.headers.get(accountAccessHeader)).toBe(recovery);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ error: expect.objectContaining({ code }) });
});
