// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/submissions/[id]/grade/route";
import type { Provider } from "@/server/llm/provider";
import { envelope } from "../../unit/server/llm/fixtures";
import { insert } from "../domain/fixture";
import { accounts, keys, openHarness, type TestHarness } from "./harness";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), admin: vi.fn(), execute: vi.fn<Provider["execute"]>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({ createClient: mocks.user }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/llm/provider", async original => ({
  ...await original<typeof import("@/server/llm/provider")>(),
  createFakeProvider: () => ({ execute: mocks.execute }),
}));

const owner = accounts.learnerA.id;
const submissionId = "38f00000-0000-4000-8000-000000030201";
const commentId = "38f00000-0000-4000-8000-000000030202";
const safeFeedback = "The consequence is clear.";
const invalidState = { status: 409, body: { error: { code: "INVALID_STATE" } } };
const conflict = { status: 409, body: { error: { code: "IDEMPOTENCY_CONFLICT" } } };
let h: TestHarness | undefined;

function assessment(feedback: string): Awaited<ReturnType<Provider["execute"]>> {
  return {
    output: envelope("assess_review", { assessments: [{
      key: keys.pinnedAFlaw, commentId, explanationCredit: 1, fixCredit: 1, feedback,
    }] }),
    usage: { inputTokens: 100, outputTokens: 20, verified: true },
  };
}

beforeEach(async () => {
  h = await openHarness();
  await insert(h.db, "public.submissions", {
    id: submissionId, learner_id: owner, challenge_id: keys.a, revision_id: keys.pinnedA,
    attempt_number: 2, previous_submission_id: keys.firstA,
  });
  await insert(h.db, "public.submission_comments", {
    id: commentId, submission_id: submissionId, ordinal: 0, line: 4, body: "The total is calculated incorrectly.",
  });
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("AI_PROVIDER", "fake");
  mocks.user.mockResolvedValue(h.clients.learnerA);
  mocks.admin.mockReturnValue(h.admin);
  mocks.execute.mockReset().mockResolvedValue(assessment(safeFeedback));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  const harness = h;
  h = undefined;
  await harness?.cleanup();
});

afterAll(() => h?.cleanup());

async function grade(intent: "initial" | "retry", key = randomUUID()) {
  const response = await POST(new Request(`http://localhost/api/v1/submissions/${submissionId}/grade`, {
    method: "POST", body: "{}",
    headers: {
      "Content-Type": "application/json", Origin: "http://localhost", "Idempotency-Key": key,
      "X-LGTM-Workspace-Account-Id": owner, "X-LGTM-Grading-Intent": intent,
    },
  }), { params: Promise.resolve({ id: submissionId }) });
  return { status: response.status, body: await response.json() };
}

function watchPrivateWork() {
  const rpc = vi.spyOn(h!.admin, "rpc");
  const dispatched = mocks.execute.mock.calls.length;
  return () => {
    expect(rpc.mock.calls.filter(([name]) => name === "llm_grading_context" || name === "llm_accounting")).toEqual([]);
    expect(mocks.execute).toHaveBeenCalledTimes(dispatched);
    rpc.mockRestore();
  };
}

async function counts() {
  const { rows: [row] } = await h!.db.query(`select
    (select count(*)::int from public.grading_runs where submission_id = $1) as runs,
    (select count(*)::int from public.ai_grades where submission_id = $1) as grades,
    (select count(*)::int from public.review_flags where submission_id = $1 and kind = 'grading_output_retried') as retry_flags`,
    [submissionId]);
  return row;
}

it("LRN-05.2 SEC-05.1 keeps an in-flight duplicate at 409 and replays a separate key's observed 409 after completion", async () => {
  const dispatch = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  mocks.execute.mockImplementationOnce(async () => {
    dispatch.resolve();
    await release.promise;
    return assessment(safeFeedback);
  });

  const startKey = randomUUID();
  const observerKey = randomUUID();
  const original = grade("initial", startKey);
  const observed = await (async () => {
    try {
      await Promise.race([dispatch.promise, original.then(result => {
        throw new Error(`Grading returned ${result.status} before reaching the provider`);
      })]);
      const noPrivateWork = watchPrivateWork();
      const duplicate = await grade("initial", startKey);
      const active = await grade("initial", observerKey);
      noPrivateWork();
      expect(duplicate).toMatchObject(invalidState);
      expect(active).toMatchObject(invalidState);
      return active;
    } finally {
      release.resolve();
      await original;
    }
  })();

  const completed = await original;
  expect(completed).toMatchObject({ status: 200, body: { data: { state: "completed" } } });
  expect(await counts()).toMatchObject({ runs: 1, grades: 1 });
  const noPrivateWork = watchPrivateWork();
  expect(await grade("initial", startKey)).toEqual(completed);
  const replay = await grade("initial", observerKey);
  noPrivateWork();
  expect(replay).toEqual(observed);
});

it("LRN-05.3 SEC-05.1 replays a key that observed a failed run after another key successfully retries", async () => {
  mocks.execute.mockRejectedValueOnce(Object.assign(new Error("Unavailable"), { code: "AI_UNAVAILABLE" }));
  const failed = await grade("initial");
  expect(failed).toMatchObject({ status: 502, body: { error: { code: "AI_UNAVAILABLE" } } });
  const observerKey = randomUUID();
  expect(await grade("initial", observerKey)).toEqual(failed);
  expect(await grade("retry")).toMatchObject({ status: 200, body: { data: { state: "completed" } } });
  expect(await counts()).toMatchObject({ runs: 2, grades: 1 });
  expect(mocks.execute).toHaveBeenCalledTimes(2);

  const noPrivateWork = watchPrivateWork();
  const replay = await grade("initial", observerKey);
  noPrivateWork();
  expect(replay).toEqual(failed);
});

it("LRN-05.3 SEC-05.1 replays a retry that observed pending after an initial request completes grading", async () => {
  const retryKey = randomUUID();
  const pending = await grade("retry", retryKey);
  expect(pending).toMatchObject({ status: 200, body: { data: { state: "pending", original: null } } });
  expect(await counts()).toMatchObject({ runs: 0, grades: 0 });
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(await grade("initial")).toMatchObject({ status: 200, body: { data: { state: "completed" } } });

  const noPrivateWork = watchPrivateWork();
  const replay = await grade("retry", retryKey);
  noPrivateWork();
  expect(replay).toEqual(pending);
});

it.each(["started", "observed"] as const)(
  "LRN-05.4 SYS-10.3 SEC-05.1 replays a %s completed result only for the same validated intent",
  async source => {
    const startKey = randomUUID();
    const completed = await grade("initial", startKey);
    expect(completed).toMatchObject({ status: 200, body: { data: { state: "completed" } } });
    const key = source === "started" ? startKey : randomUUID();

    const noPrivateWork = watchPrivateWork();
    expect(await grade("initial", key)).toEqual(completed);
    expect(await grade("initial", key)).toEqual(completed);
    const changed = await grade("retry", key);
    noPrivateWork();
    expect(await counts()).toMatchObject({ runs: 1, grades: 1 });
    expect(changed).toMatchObject(conflict);
  },
);

it("LRN-05.3 LRN-05.6 SYS-10.3 records a rejected input-limit retry under its validated intent", async () => {
  await h!.db.query(`insert into public.grading_runs (submission_id, run_number, state, finished_at, failure_code)
    values ($1, 1, 'failed', clock_timestamp(), 'PAYLOAD_TOO_LARGE')`, [submissionId]);
  const key = randomUUID();

  const noPrivateWork = watchPrivateWork();
  const rejected = await grade("retry", key);
  expect(rejected).toMatchObject(invalidState);
  expect(await grade("retry", key)).toEqual(rejected);
  const changed = await grade("initial", key);
  noPrivateWork();
  expect(await counts()).toMatchObject({ runs: 1, grades: 0 });
  expect(changed).toMatchObject(conflict);
});

const compactKey = keys.pinnedAFlaw.replaceAll("-", "").toUpperCase();
const fullwidthKey = keys.pinnedAFlaw.toUpperCase().replace(/[0-9A-F-]/g,
  char => String.fromCharCode(char.charCodeAt(0) + 0xfee0));

it.each([
  { spelling: "fullwidth", echo: fullwidthKey, validRetry: true },
  { spelling: "compact", echo: compactKey, validRetry: false },
  { spelling: "space-separated", echo: compactKey.match(/.{4}/g)!.join(" "), validRetry: false },
])("LRN-05.5 SEC-03.1 SEC-05.3 rejects $spelling private feedback (valid retry: $validRetry)", async ({ echo, validRetry }) => {
  const unsafe = assessment(`The consequence is clear. Reference ${echo}.`);
  mocks.execute.mockResolvedValueOnce(unsafe);
  if (!validRetry) mocks.execute.mockResolvedValueOnce(unsafe);

  const result = await grade("initial");
  expect(mocks.execute).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(result.body)).not.toContain(echo);
  if (validRetry) {
    expect(result).toMatchObject({ status: 200, body: { data: { state: "completed", original: {
      comments: [expect.objectContaining({ feedback: safeFeedback })],
    } } } });
    expect(await counts()).toEqual({ runs: 1, grades: 1, retry_flags: 1 });
  } else {
    expect(result).toMatchObject({ status: 422, body: { error: { code: "INVALID_AI_OUTPUT" } } });
    expect(await counts()).toEqual({ runs: 1, grades: 0, retry_flags: 0 });
  }
});
