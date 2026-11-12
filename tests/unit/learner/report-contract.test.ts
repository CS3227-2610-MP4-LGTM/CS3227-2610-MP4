// @vitest-environment node

import { beforeEach, expect, it, vi } from "vitest";
import { accountAccessHeader } from "@/lib/learner/challenges";
import { workspaceAccountHeader } from "@/lib/learner/submissions";
import { learnerId, reportFlag, reportKey, reportReason, submissionId, unmatchedId } from "./report-fixture";

const mocks = vi.hoisted(() => ({ getAccount: vi.fn(), rpc: vi.fn(), admin: vi.fn(), boundary: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.getAccount }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/llm/boundary", () => ({ createLlmBoundary: mocks.boundary }));

// Acceptance interfaces introduced by T-15. Resolve them at runtime so the
// production baseline typechecks before implementation.
const routeModule = "../../../src/app/api/v1/submissions/[id]/reports/route.ts";
const messagesModule = "../../../src/lib/learner/reports.ts";
type ReportRoute = { POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> };

const host = "app.example.test";
const origin = `https://${host}`;
const body = { commentId: unmatchedId, reason: reportReason };
const messages = {
  ineligible: "This comment isn't available for reporting.",
  alreadyReported: "This comment has already been reported.",
  inProgress: "Your report is still being confirmed. Check again.",
  failed: "We couldn't send your report. Try again.",
  uncertain: "We couldn't confirm your report. Check report again.",
  throttled: "Too many requests. Try again later.",
  account: "We can't check your account right now. Try again.",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAccount.mockResolvedValue({ status: "ok", account: { id: learnerId, role: "learner", displayName: "Learner A" } });
  mocks.rpc.mockResolvedValue({ data: { status: "ok", flag: reportFlag() }, error: null, status: 200 });
});

type Options = { key?: string | string[] | null; search?: string; id?: string; headers?: Record<string, string> };
async function report(payload: unknown, { key = reportKey, search = "", id = submissionId, headers = {} }: Options = {}) {
  const requestHeaders = new Headers({ "Content-Type": "application/json", Host: host, Origin: origin, ...headers });
  for (const value of key === null ? [] : [key].flat()) requestHeaders.append("Idempotency-Key", value);
  const { POST } = await import(routeModule) as ReportRoute;
  return POST(new Request(`https://next.internal/api/v1/submissions/${id}/reports${search}`, {
    method: "POST", headers: requestHeaders, body: typeof payload === "string" ? payload : JSON.stringify(payload),
  }), { params: Promise.resolve({ id }) });
}

async function expectError(response: Response, status: number, code: string, message?: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const payload = await response.json();
  expect(Object.keys(payload)).toEqual(["error"]);
  expect(payload.error).toMatchObject({ code, message: message ?? expect.stringMatching(/\S/) });
  expect(Object.keys(payload.error).filter(key => !["code", "message", "fieldErrors"].includes(key))).toEqual([]);
  return payload.error as { code: string; message: string; fieldErrors?: Record<string, string[]> };
}

it("LRN-07.5 LRN-07.6 LRN-07.7 exports the three 409 INVALID_STATE meanings once as shared Learner constants", async () => {
  const { reportErrorMessages } = await import(messagesModule) as { reportErrorMessages: Record<string, string> };
  expect(reportErrorMessages).toMatchObject({
    ineligible: messages.ineligible, alreadyReported: messages.alreadyReported, inProgress: messages.inProgress,
  });
});

it("LRN-07.2 LRN-07.4 sends only the path submission, key and canonical trimmed payload, returning a strict private 201 FlagView", async () => {
  const response = await report({ commentId: unmatchedId, reason: `  ${reportReason}\n` });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("create_learner_report", {
    p_submission_id: submissionId, p_idempotency_key: reportKey, p_payload: body,
  });
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ data: reportFlag() });
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.boundary).not.toHaveBeenCalled();
});

it("LRN-07.3 admits a 2000-code-point reason whose UTF-8 envelope exceeds 2000 bytes", async () => {
  const reason = "🚲".repeat(2000);
  mocks.rpc.mockResolvedValue({ data: { status: "ok", flag: reportFlag({ reason }) }, error: null, status: 200 });
  const response = await report({ commentId: unmatchedId, reason: ` ${reason} ` });
  expect(response.status).toBe(201);
  expect(mocks.rpc).toHaveBeenCalledWith("create_learner_report", expect.objectContaining({ p_payload: { commentId: unmatchedId, reason } }));
});

it.each([
  ["blank reason", { commentId: unmatchedId, reason: "" }, "Enter a reason."],
  ["whitespace-only reason", { commentId: unmatchedId, reason: " \n\t " }, "Enter a reason."],
  ["2001-code-point reason", { commentId: unmatchedId, reason: "🚲".repeat(2001) }, "Reason is too long."],
] as const)("LRN-07.3 rejects a %s with its reason field error before the write RPC", async (_label, payload, message) => {
  const error = await expectError(await report(payload), 400, "VALIDATION_ERROR");
  expect(error.fieldErrors).toEqual({ reason: [message] });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([
  ["forged learner", { ...body, learnerId }],
  ["forged kind", { ...body, kind: "near_pass_mark" }],
  ["forged source", { ...body, source: "rule" }],
  ["forged grade", { ...body, grade: 100 }],
  ["forged fingerprint", { ...body, fingerprint: "caller-supplied" }],
  ["missing commentId", { reason: reportReason }],
  ["missing reason", { commentId: unmatchedId }],
  ["non-UUID commentId", { ...body, commentId: "comment-3" }],
  ["numeric reason", { ...body, reason: 42 }],
  ["null reason", { ...body, reason: null }],
  ["array body", [body]],
  ["null body", null],
  ["malformed JSON", "{"],
] as const)("SYS-02.1 LRN-07.2 rejects %s without writing or echoing unknown fields", async (_label, payload) => {
  const response = await report(payload);
  const text = JSON.stringify(await expectError(response, 400, "VALIDATION_ERROR"));
  for (const field of ["learnerId", "kind", "source", "grade", "fingerprint"]) expect(text).not.toContain(field);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each<[string, Options]>([
  ["missing Idempotency-Key", { key: null }],
  ["non-UUID Idempotency-Key", { key: "not-a-key" }],
  ["duplicated Idempotency-Key header", { key: [reportKey, "00000000-0000-4000-8000-000000000952"] }],
  ["unused query field", { search: "?commentId=x" }],
  ["duplicated query field", { search: "?reason=a&reason=b" }],
  ["non-UUID path submission", { id: "submission-1" }],
])("SYS-02.1 LRN-07.2 rejects a %s before the write RPC", async (_label, options) => {
  await expectError(await report(body, options), 400, "VALIDATION_ERROR");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("SYS-02.1 checks the raw body limit before parsing and returns 413", async () => {
  await expectError(await report(JSON.stringify({ ...body, padding: "x".repeat(1024 * 1024) })), 413, "PAYLOAD_TOO_LARGE");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([
  ["foreign Origin", { Origin: "https://foreign.example.test" }],
  ["foreign Origin matching only X-Forwarded-Host", { Origin: "https://foreign.example.test", "X-Forwarded-Host": "foreign.example.test" }],
])("SYS-11 SYS-02.1 rejects a %s with 403 before the write RPC", async (_label, headers) => {
  await expectError(await report(body, { headers }), 403, "FORBIDDEN");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("LRN-07.7 SYS-11 rejects a mismatched workspace account header with the account recovery header", async () => {
  const response = await report(body, { headers: { [workspaceAccountHeader]: "00000000-0000-4000-8000-000000000099" } });
  await expectError(response, 403, "FORBIDDEN");
  expect(response.headers.get(accountAccessHeader)).toBe("account_unavailable");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([
  ["unauthenticated", { status: "unauthenticated" }, 401, "UNAUTHENTICATED", "unauthenticated"],
  ["wrong role", { status: "ok", account: { id: learnerId, role: "ta", displayName: "TA" } }, 403, "FORBIDDEN", "role_denied"],
  ["unavailable account", { status: "forbidden" }, 403, "FORBIDDEN", "account_unavailable"],
  ["account outage", { status: "unavailable" }, 503, "SERVICE_UNAVAILABLE", "account_service_unavailable"],
] as const)("LRN-07.7 SYS-11 maps a %s caller before the write RPC", async (_label, account, status, code, header) => {
  mocks.getAccount.mockResolvedValue(account);
  const response = await report(body);
  await expectError(response, status, code, status === 503 ? messages.account : undefined);
  expect(response.headers.get(accountAccessHeader)).toBe(header);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([
  ["absent submission or comment", { status: "not_found" }, 404, "NOT_FOUND", undefined],
  ["ineligible comment", { status: "ineligible" }, 409, "INVALID_STATE", messages.ineligible],
  ["already-reported pair", { status: "already_reported" }, 409, "INVALID_STATE", messages.alreadyReported],
  ["in-progress replay", { status: "in_progress" }, 409, "INVALID_STATE", messages.inProgress],
  ["idempotency conflict", { status: "idempotency_conflict" }, 409, "IDEMPOTENCY_CONFLICT", undefined],
  ["database validation", { status: "invalid" }, 400, "VALIDATION_ERROR", undefined],
] as const)("LRN-07.5 LRN-07.6 LRN-07.7 maps the recorded %s outcome", async (_label, data, status, code, message) => {
  mocks.rpc.mockResolvedValue({ data, error: null, status: 200 });
  await expectError(await report(body), status, code, message);
});

it("SYS-08 SYS-11 maps a database ownership denial to 403 after confirming the caller is still a Learner", async () => {
  mocks.rpc.mockResolvedValue({ data: { status: "forbidden" }, error: null, status: 200 });
  await expectError(await report(body), 403, "FORBIDDEN");
});

it("SYS-11 rechecks the account after a database permission error", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" }, status: 401 });
  mocks.getAccount.mockResolvedValueOnce({ status: "ok", account: { id: learnerId, role: "learner", displayName: "Learner A" } })
    .mockResolvedValueOnce({ status: "unauthenticated" });
  await expectError(await report(body), 401, "UNAUTHENTICATED");
});

it("LRN-07.7 maps throttling to 429 with the shared throttling message", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST", message: "rate limited" }, status: 429 });
  await expectError(await report(body), 429, "RATE_LIMITED", messages.throttled);
});

it.each([
  ["a PostgreSQL error that confirms rollback", { data: null, error: { code: "XX000", message: "internal", details: "secret table", hint: "diagnostic" }, status: 500 }, messages.failed],
  ["a connection failure", { data: null, error: { code: "08006", message: "connection failure" }, status: 500 }, messages.uncertain],
  ["a transport failure", { data: null, error: { code: "", message: "TypeError: fetch failed" }, status: 0 }, messages.uncertain],
  ["a malformed acknowledgement", { data: { status: "ok" }, error: null, status: 200 }, messages.uncertain],
  ["a flag for another submission", { data: { status: "ok", flag: reportFlag({ submissionId: learnerId }) }, error: null, status: 200 }, messages.uncertain],
  ["a flag for another comment", { data: { status: "ok", flag: reportFlag({ commentId: learnerId }) }, error: null, status: 200 }, messages.uncertain],
  ["a rule flag", { data: { status: "ok", flag: reportFlag({ kind: "near_pass_mark", source: "rule" }) }, error: null, status: 200 }, messages.uncertain],
  ["a flag with another reason", { data: { status: "ok", flag: reportFlag({ reason: "Different." }) }, error: null, status: 200 }, messages.uncertain],
  ["a flag with an extra field", { data: { status: "ok", flag: { ...reportFlag(), learnerEmail: "learner@example.test" } }, error: null, status: 200 }, messages.uncertain],
] as const)("LRN-07.6 LRN-07.7 classifies %s as a private 503 without database details", async (_label, result, message) => {
  mocks.rpc.mockResolvedValue(result);
  const response = await report(body);
  const error = await expectError(response, 503, "SERVICE_UNAVAILABLE", message);
  expect(JSON.stringify(error)).not.toMatch(/secret|diagnostic|internal|learner@example/);
});

it("LRN-07.6 treats a thrown RPC call as an uncertain outcome", async () => {
  mocks.rpc.mockRejectedValue(new Error("socket hang up"));
  await expectError(await report(body), 503, "SERVICE_UNAVAILABLE", messages.uncertain);
});
