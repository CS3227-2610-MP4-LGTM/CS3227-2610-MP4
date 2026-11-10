// @vitest-environment node

import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/challenges/[id]/submissions/route";
import { sendReview } from "@/components/learner/client-submissions";
import { submissionInputSchema, submissionOutcomeMessages } from "@/lib/learner/submissions";
import { uid } from "../server/llm/fixtures";
import { challengeId, learnerId, pending, revisionId, submission, submissionId } from "./grading-fixture";

const mocks = vi.hoisted(() => ({ getAccount: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.getAccount }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));

const retryId = uid(502);
const foreign = uid(503);
const key = uid(955);
const origin = "https://app.example.test";
const accountHeader = "X-LGTM-Workspace-Account-Id";
const input = { revisionId, previousSubmissionId: submissionId, comments: [{ line: 3, body: "A revised comment." }] };
const comments = input.comments.map((comment, ordinal) => ({ ...comment, ordinal, id: uid(603 + ordinal) }));
const secondAttempt = { ...submission, id: retryId, attemptNumber: 2, previousSubmissionId: submissionId, comments };
const { code, ...metadata } = submission.challenge;
const { flags, ...savedFields } = secondAttempt;
const rpcView = { ...savedFields, challenge: { ...metadata, source: code.after } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAccount.mockResolvedValue({
    status: "ok", account: { id: learnerId, role: "learner", displayName: "Learner A" },
  });
});

function post(payload: object, options: { origin?: string; account?: string } = {}) {
  return POST(new Request(`${origin}/api/v1/challenges/${challengeId}/submissions`, {
    method: "POST", body: JSON.stringify(payload), headers: {
      "Content-Type": "application/json", "Idempotency-Key": key, Origin: options.origin ?? origin,
      [accountHeader]: options.account ?? learnerId,
    },
  }), { params: Promise.resolve({ id: challengeId }) });
}

it("LRN-06.6 accepts an optional previous UUID and forwards the normalized payload on the existing write path", async () => {
  mocks.rpc.mockResolvedValue({ data: { status: "ok", submission: rpcView }, error: null });
  const response = await post({ ...input, comments: [{ line: 3, body: "  A revised comment. " }] });
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ data: { ...secondAttempt, grading: pending, flags } });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("create_learner_submission", {
    p_challenge_id: challengeId, p_idempotency_key: key, p_payload: input,
  });
  expect(submissionInputSchema.parse({ revisionId, comments: [] })).toEqual({ revisionId, comments: [] });
});

it.each([
  { previousSubmissionId: null }, { previousSubmissionId: "not-a-uuid" },
  { attemptNumber: 2 }, { learnerId }, { score: 100 },
  { comments: [{ line: 3, body: "Test", id: uid(601) }] },
  { comments: [{ line: 3, body: "Test", ordinal: 0 }] },
  { comments: [{ line: 4, body: "First" }, { line: 3, body: "Second" }] },
])("LRN-06.6 SYS-02.1 rejects invalid retry input %j before writing", async invalid => {
  const response = await post({ ...input, ...invalid });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([
  { origin: "https://foreign.example.test" }, { account: foreign },
])("LRN-06.6 SYS-09 SYS-11 preserves Origin and workspace account checks for %j", async options => {
  const response = await post(input, options);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([
  { id: retryId, attemptNumber: 2, previousSubmissionId: foreign },
  { id: submissionId, attemptNumber: 1, previousSubmissionId: null },
])("LRN-06.6 rejects a server acknowledgement that does not bind to the requested first attempt (%j)", async mismatch => {
  mocks.rpc.mockResolvedValue({ data: { status: "ok", submission: { ...rpcView, ...mismatch } }, error: null });
  const response = await post(input);
  expect(mocks.rpc).toHaveBeenCalledOnce();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { message: submissionOutcomeMessages.uncertain } });
});

it.each([
  { previousSubmissionId: submissionId, attemptNumber: 2, outcome: { status: "ok", id: retryId } },
  { previousSubmissionId: foreign, attemptNumber: 2, outcome: { status: "uncertain" } },
  { previousSubmissionId: null, attemptNumber: 1, outcome: { status: "uncertain" } },
])("LRN-06.6 binds the client acknowledgement to the named first attempt ($previousSubmissionId)", async ({
  previousSubmissionId, attemptNumber, outcome,
}) => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({
    data: { ...secondAttempt, previousSubmissionId, attemptNumber, grading: pending, flags },
  }, { status: 201 }));
  try {
    expect(await sendReview(challengeId, { payload: input, key, accountId: learnerId }, false)).toEqual(outcome);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/v1/challenges/${challengeId}/submissions`,
      expect.objectContaining({ body: JSON.stringify(input), method: "POST" }));
  } finally {
    fetch.mockRestore();
  }
});
