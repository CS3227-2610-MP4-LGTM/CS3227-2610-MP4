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
const publicHost = "app.example.test";
const foreignHost = "foreign.example.test";
const publicOrigin = `https://${publicHost}`;
const foreignOrigin = `https://${foreignHost}`;
const body = { revisionId, comments: [] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAccount.mockResolvedValue({ status: "ok", account: { id: learnerId, role: "learner", displayName: "Learner A" } });
  mocks.rpc.mockResolvedValue({ data: { status: "attempt_limit" }, error: null, status: 200 });
});

function submit(originHeaders: HeadersInit) {
  const headers = new Headers(originHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("Idempotency-Key", key);
  return POST(new Request(`https://next.internal/api/v1/challenges/${challengeId}/submissions`, {
    method: "POST", headers, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: challengeId }) });
}

it.each<{ name: string; headers: HeadersInit }>([
  { name: "matching public Origin and Host", headers: { Host: publicHost, Origin: publicOrigin } },
  { name: "valid public Host without Origin", headers: { Host: publicHost } },
])("SYS-16.2 SEC-REV-01 invokes the write RPC with $name and an internal request URL", async ({ headers }) => {
  const response = await submit(headers);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("create_learner_submission", {
    p_challenge_id: challengeId, p_idempotency_key: key, p_payload: body,
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "ATTEMPT_LIMIT" } });
});

it.each<{ name: string; headers: HeadersInit }>([
  { name: "foreign Origin with public Host", headers: { Host: publicHost, Origin: foreignOrigin } },
  { name: "malformed Host containing a path", headers: { Host: `${foreignHost}/path`, Origin: foreignOrigin } },
  { name: "foreign Origin matching only X-Forwarded-Host", headers: {
    Host: publicHost, Origin: foreignOrigin, "X-Forwarded-Host": foreignHost,
  } },
])("SYS-16.2 SEC-REV-01 rejects $name before calling the write RPC", async ({ headers }) => {
  const response = await submit(headers);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});
