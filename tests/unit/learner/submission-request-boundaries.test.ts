// @vitest-environment node

import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/challenges/[id]/submissions/route";

const mocks = vi.hoisted(() => ({ getAccount: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.getAccount }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));

const challengeId = "00000000-0000-4000-8000-000000000101";
const revisionId = "00000000-0000-4000-8000-000000000201";
const learnerId = "00000000-0000-4000-8000-000000000011";
const key = "00000000-0000-4000-8000-000000000951";
const accountHeader = "X-LGTM-Workspace-Account-Id";
const origin = "https://app.example.test";
const body = { revisionId, comments: [{ line: 3, body: "Check the return value." }] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAccount.mockResolvedValue({ status: "ok", account: { id: learnerId, role: "learner", displayName: "Learner A" } });
  mocks.rpc.mockResolvedValue({ data: { status: "attempt_limit" }, error: null, status: 200 });
});

function submit(headers: Record<string, string>, payload: unknown = body) {
  return POST(new Request(`${origin}/api/v1/challenges/${challengeId}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key, ...headers },
    body: JSON.stringify(payload),
  }), { params: Promise.resolve({ id: challengeId }) });
}

it("SYS-16.2 SEC-REV-01 rejects an untrusted Origin before calling the write RPC", async () => {
  const response = await submit({ Origin: "https://foreign.example.test", [accountHeader]: learnerId });
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it.each([
  ["a mismatched UUID", "00000000-0000-4000-8000-000000000012"],
  ["a malformed UUID", "not-a-uuid"],
])("SYS-08.3 SYS-09.3 SEC-REV-02 rejects %s in the workspace account header before calling the RPC", async (_case, value) => {
  const response = await submit({ Origin: origin, [accountHeader]: value });
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it("SYS-08.3 SEC-REV-02 still accepts headerless callers acting as themselves", async () => {
  const response = await submit({});
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "ATTEMPT_LIMIT" } });
});

it("SYS-16.1 SEC-REV-04 keeps unexpected property names out of validation messages and field errors", async () => {
  const topLevel = "PRIVATE_TOP_LEVEL_NOTE";
  const nested = "PRIVATE_NESTED_SOURCE_SNIPPET";
  const response = await submit({}, {
    ...body,
    [topLevel]: true,
    comments: [{ ...body.comments[0], [nested]: true }],
  });
  expect(response.status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
  const json = await response.json();
  expect(json).toMatchObject({ error: { code: "VALIDATION_ERROR", message: expect.any(String) } });
  expect(JSON.stringify(json.error)).not.toContain(topLevel);
  expect(JSON.stringify(json.error)).not.toContain(nested);
});
