// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { GET as list } from "@/app/api/v1/ta/submissions/route";
import { GET as detail } from "@/app/api/v1/ta/submissions/[id]/route";
import { readSubmission, readSubmissionPage } from "@/server/ta/submissions";
import { id } from "./evidence";
const mocks = vi.hoisted(() => ({ account: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.account }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: () => { throw new Error("No privileged TA reads"); } }));
vi.mock("@/server/llm/boundary", () => ({ createLlmBoundary: () => { throw new Error("No grading during inspection"); } }));
beforeEach(() => { vi.resetAllMocks(); });
const request = new Request("http://localhost/api/v1/ta/submissions");
const detailRequest = () => detail(new Request(`${request.url}/${id(501)}`), { params: Promise.resolve({ id: id(501) }) });
it.each([
  [{ status: "unauthenticated" }, 401, "UNAUTHENTICATED", "unauthenticated"],
  [{ status: "forbidden" }, 403, "FORBIDDEN", "account_unavailable"],
  [{ status: "unavailable" }, 503, "SERVICE_UNAVAILABLE", "account_service_unavailable"],
  [{ status: "ok", account: { id: id(11), displayName: "Learner A", role: "learner" } }, 403, "FORBIDDEN", "role_denied"],
  [{ status: "ok", account: { id: id(1), displayName: "Author A", role: "author" } }, 403, "FORBIDDEN", "role_denied"],
] as const)("SYS-11.1 SYS-11.2 SYS-11.3 SYS-11.4 preserves auth failure category %j without reads or cached fallback", async (account, httpStatus, code, status) => {
  mocks.account.mockResolvedValue(account);
  expect(await readSubmission(id(501))).toEqual({ status });
  expect(await readSubmissionPage(new URLSearchParams())).toEqual({ status });
  for (const response of [await list(request), await detailRequest()]) {
    expect(response.status).toBe(httpStatus); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ error: expect.objectContaining({ code, message: expect.any(String) }) });
  }
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
});
it("SYS-02.1 rejects invalid input before data queries and read side effects", async () => {
  mocks.account.mockResolvedValue({ status: "ok", account: { id: id(21), displayName: "TA A", role: "ta" } });
  expect(await readSubmission("malformed")).toEqual({ status: "invalid" });
  expect(await readSubmissionPage(new URLSearchParams("limit=999&actorId=forged"))).toEqual({ status: "invalid" });
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
});
