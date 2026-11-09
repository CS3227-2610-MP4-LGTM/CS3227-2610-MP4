// @vitest-environment node

import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAccount: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.getAccount }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));

const challengeId = "00000000-0000-4000-8000-000000000101";
const revisionId = "00000000-0000-4000-8000-000000000201";
const learnerId = "00000000-0000-4000-8000-000000000011";
const key = "00000000-0000-4000-8000-000000000951";
const baseBody = { revisionId, comments: [] };
const maxBodyBytes = 128 * 1024;

// These production modules are acceptance interfaces introduced by T-11.
// Resolve them at runtime so the production baseline can typecheck before implementation.
const routeModule = "../../../src/app/api/v1/challenges/[id]/submissions/route.ts";
const messagesModule = "../../../src/lib/learner/submissions.ts";
type SubmissionRoute = {
  POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAccount.mockResolvedValue({
    status: "ok", account: { id: learnerId, role: "learner", displayName: "Learner A" },
  });
});

async function submit(body: string, idempotencyKey: string | null = key, search = "") {
  const headers = new Headers({ "content-type": "application/json" });
  if (idempotencyKey !== null) headers.set("idempotency-key", idempotencyKey);
  const { POST } = await import(routeModule) as SubmissionRoute;
  return POST(new Request(`https://app.example.test/api/v1/challenges/${challengeId}/submissions${search}`, {
    method: "POST", body, headers,
  }), { params: Promise.resolve({ id: challengeId }) });
}

it("LRN-04.4 LRN-04.5 LRN-04.6 exports exact shared messages for the two meanings of 409 and 503", async () => {
  const { submissionErrorMessages } = await import(messagesModule) as { submissionErrorMessages: Record<string, string> };
  expect(submissionErrorMessages).toMatchObject({
    lifecycleUnavailable: "This challenge is no longer available for submission.",
    inProgress: "Submission is still being confirmed. Check again.",
    submissionUnavailable: "We couldn't submit your review. Try again.",
    accountServiceUnavailable: "We can't check your account right now. Try again.",
  });
});

it.each([
  ["unexpected top-level field", { ...baseBody, learnerId }],
  ["previous submission reference", { ...baseBody, previousSubmissionId: key }],
  ["non-UUID revision", { ...baseBody, revisionId: "not-a-revision" }],
  ["null comments", { ...baseBody, comments: null }],
  ["missing comments", { revisionId }],
  ["over-count review", { revisionId, comments: Array.from({ length: 51 }, () => ({ line: 1, body: "Note." })) }],
  ["blank comment", { revisionId, comments: [{ line: 1, body: "   \n" }] }],
  ["overlong Unicode comment", { revisionId, comments: [{ line: 1, body: "🚲".repeat(2001) }] }],
  ["fractional line", { revisionId, comments: [{ line: 1.5, body: "Note." }] }],
  ["nonpositive line", { revisionId, comments: [{ line: 0, body: "Note." }] }],
  ["client comment ID", { revisionId, comments: [{ id: key, line: 1, body: "Note." }] }],
  ["client ordinal", { revisionId, comments: [{ ordinal: 0, line: 1, body: "Note." }] }],
  ["client location fields", { revisionId, comments: [{ line: 1, body: "Note.", path: "challenge.js", side: "after" }] }],
] as const)("SYS-02.1 LRN-04.2 LRN-04.5 rejects %s before invoking the write RPC", async (_label, body) => {
  const response = await submit(JSON.stringify(body));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR", message: expect.any(String) } });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([null, "not-a-uuid"])("LRN-04.2 SYS-02.1 rejects Idempotency-Key %s", async (idempotencyKey) => {
  const response = await submit(JSON.stringify(baseBody), idempotencyKey);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("SYS-02.1 LRN-04.2 rejects an unexpected query field", async () => {
  const response = await submit(JSON.stringify(baseBody), key, "?attemptNumber=1");
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("LRN-04.5 SYS-02.1 checks the raw UTF-8 byte limit before JSON parsing", async () => {
  // Malformed JSON reports validation at the byte cap and size above it.
  const multibyte = "🚲".repeat(maxBodyBytes / 4);
  expect(multibyte.length).toBeLessThan(maxBodyBytes);
  const withinLimit = await submit(multibyte);
  const overLimit = await submit(multibyte + "x");
  expect(withinLimit.status).toBe(400);
  expect(await withinLimit.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  expect(overLimit.status).toBe(413);
  expect(await overLimit.json()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("LRN-04.6 SYS-11.4 emits the exact account outage message in a private 503 response", async () => {
  mocks.getAccount.mockResolvedValue({ status: "unavailable" });
  const response = await submit(JSON.stringify(baseBody));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: { code: "SERVICE_UNAVAILABLE", message: "We can't check your account right now. Try again." },
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("LRN-04.6 emits a private submission 503 without database details when the write RPC fails", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: {
      code: "XX000",
      message: "internal submission write error",
      details: "internal table details",
      hint: "internal diagnostic hint",
    },
  });

  const response = await submit(JSON.stringify(baseBody));
  const { submissionErrorMessages } = await import(messagesModule) as { submissionErrorMessages: Record<string, string> };

  expect(mocks.rpc).toHaveBeenCalled();
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({
    error: { code: "SERVICE_UNAVAILABLE", message: submissionErrorMessages.submissionUnavailable },
  });
});
