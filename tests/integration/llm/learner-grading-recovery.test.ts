// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
const submissionId = "38f00000-0000-4000-8000-000000030301";
const commentId = "38f00000-0000-4000-8000-000000030302";
let h: TestHarness;

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
  try {
    await insert(h.db, "public.submissions", {
      id: submissionId, learner_id: owner, challenge_id: keys.a, revision_id: keys.pinnedA,
      attempt_number: 2, previous_submission_id: keys.firstA,
    });
    await insert(h.db, "public.submission_comments", {
      id: commentId, submission_id: submissionId, ordinal: 0, line: 4, body: "The total is calculated incorrectly.",
    });
  } catch (error) {
    await h.cleanup();
    throw error;
  }
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("AI_PROVIDER", "fake");
  mocks.user.mockResolvedValue(h.clients.learnerA);
  mocks.admin.mockReturnValue(h.admin);
  mocks.execute.mockReset();
  const harness = h;
  return () => harness.cleanup();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function grade(key = randomUUID()) {
  const response = await POST(new Request(`http://localhost/api/v1/submissions/${submissionId}/grade`, {
    method: "POST", body: "{}",
    headers: {
      "Content-Type": "application/json", Origin: "http://localhost", "Idempotency-Key": key,
      "X-LGTM-Workspace-Account-Id": owner, "X-LGTM-Grading-Intent": "initial",
    },
  }), { params: Promise.resolve({ id: submissionId }) });
  return { status: response.status, body: await response.json() };
}

async function expireRun(id: string) {
  // Backdate only this fixture's run after the final assessment capture.
  await h.db.query("begin");
  try {
    await h.db.query("set local session_replication_role = replica");
    const result = await h.db.query(`update public.grading_runs
      set created_at = clock_timestamp() - interval '60 seconds'
      where id = $1 and submission_id = $2 and state = 'running'`, [id, submissionId]);
    expect(result.rowCount).toBe(1);
    await h.db.query("commit");
  } catch (error) {
    await h.db.query("rollback");
    throw error;
  }
}

it("LRN-05.3 LRN-05.6 SEC-05.2 records and replays the timeout when completion reaches the run deadline", async () => {
  mocks.execute.mockResolvedValue(assessment("The consequence is clear."));
  const rpc = h.admin.rpc.bind(h.admin);
  let rejection: string | undefined;
  const spy = vi.spyOn(h.admin, "rpc").mockImplementation((name, args, options) => {
    if (name !== "complete_learner_grading") return rpc(name, args, options);
    return (async () => {
      await expireRun(args.p_grading_run_id);
      const response = await rpc(name, args, options);
      rejection = response.error?.message;
      return response;
    })() as unknown as ReturnType<typeof rpc>;
  });

  const key = randomUUID();
  const original = await grade(key);
  const { rows: recorded } = await h.db.query(
    "select state, failure_code from public.grading_runs where submission_id = $1", [submissionId],
  );
  const replay = await grade(key);

  expect(spy.mock.calls.filter(([name]) => name === "complete_learner_grading")).toHaveLength(1);
  expect(rejection).toBe("INVALID_STATE");
  expect(mocks.execute).toHaveBeenCalledTimes(1);
  expect(replay).toMatchObject({ status: 504, body: { error: { code: "AI_TIMEOUT" } } });
  expect(original).toEqual(replay);
  expect(recorded).toEqual([{ state: "failed", failure_code: "AI_TIMEOUT" }]);
});

it.each([
  { name: "U+034F", mark: "\u034F" },
  { name: "U+FE0E", mark: "\uFE0E" },
  { name: "U+0301", mark: "\u0301" },
])("LRN-05.5 SEC-03.1 SEC-05.3 retries and never stores a private ID split by $name", async ({ mark }) => {
  const flawId = keys.pinnedAFlaw;
  const echo = `${flawId.slice(0, 1)}${mark}${flawId.slice(1)}`;
  mocks.execute.mockResolvedValue(assessment(`The consequence is clear. Reference ${echo}.`));

  const result = await grade();
  const grades = await h.db.query("select id from public.ai_grades where submission_id = $1", [submissionId]);

  expect(mocks.execute).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({ status: 422, body: { error: { code: "INVALID_AI_OUTPUT" } } });
  expect(JSON.stringify(result.body)).not.toContain(echo);
  expect(grades.rows).toEqual([]);
});
