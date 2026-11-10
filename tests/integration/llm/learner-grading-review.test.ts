// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/submissions/[id]/grade/route";
import { createAccountingStore } from "@/server/llm/accounting";
import { createLlmBoundary } from "@/server/llm/boundary";
import type { Provider } from "@/server/llm/provider";
import { envelope, uid } from "../../unit/server/llm/fixtures";
import { insert } from "../domain/fixture";
import { accounts, keys, limits, openHarness, remap, type TestHarness } from "./harness";

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
const submissionId = remap(uid(30101));
const commentId = remap(uid(30102));
const runId = remap(uid(30103));
const match = { key: keys.pinnedAFlaw, commentId };
const contextSignature = "public.llm_grading_context(uuid,uuid,uuid)";
const contextArgs = { account_id: owner, submission_id: submissionId, grading_run_id: runId };
const validFeedback = "The consequence is clear.";
const echoedId = "D42D535D-0162-4A1E-AE83-5746B10D186A";
let h: TestHarness;

function assessment(feedback: string) {
  return {
    output: envelope("assess_review", { assessments: [{ ...match, explanationCredit: 1, fixCredit: 1, feedback }] }),
    usage: { inputTokens: 100, outputTokens: 20, verified: true },
  };
}

beforeAll(async () => {
  h = await openHarness();
  await insert(h.db, "public.submissions", {
    id: submissionId, learner_id: owner, challenge_id: keys.a, revision_id: keys.pinnedA,
    attempt_number: 2, previous_submission_id: keys.firstA,
  });
  await insert(h.db, "public.submission_comments", {
    id: commentId, submission_id: submissionId, ordinal: 0, line: 4, body: "The total is calculated incorrectly.",
  });
});

beforeEach(() => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("AI_PROVIDER", "fake");
  mocks.user.mockResolvedValue(h.clients.learnerA);
  mocks.admin.mockReturnValue(h.admin);
  mocks.execute.mockReset().mockResolvedValue(assessment(validFeedback));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (!h) return;
  await h.db.query("begin");
  try {
    await h.db.query("set local session_replication_role = replica");
    const operations = "select id from private.llm_operations where resource_id = $1";
    for (const table of ["llm_usage_events", "ai_usage_records"]) {
      await h.db.query(`delete from private.${table} where operation_id in (${operations})`, [submissionId]);
    }
    await h.db.query("delete from private.llm_operations where resource_id = $1", [submissionId]);
    await h.db.query("delete from private.learner_grading_requests where submission_id = $1", [submissionId]);
    const grades = "select id from public.ai_grades where submission_id = $1";
    for (const table of ["ai_grade_evidence", "ai_grade_comment_results", "ai_grade_assessments", "ai_grade_eligible_hints"]) {
      await h.db.query(`delete from public.${table} where grade_id in (${grades})`, [submissionId]);
    }
    for (const table of ["review_flags", "ai_grades", "grading_runs"]) {
      await h.db.query(`delete from public.${table} where submission_id = $1`, [submissionId]);
    }
    await h.db.query("commit");
  } catch (error) {
    await h.db.query("rollback");
    throw error;
  }
});
afterAll(async () => { await h?.cleanup(); });

async function grade(intent?: string, key = randomUUID()) {
  const response = await POST(new Request(`http://localhost/api/v1/submissions/${submissionId}/grade`, {
    method: "POST", body: "{}",
    headers: {
      "Content-Type": "application/json", Origin: "http://localhost", "Idempotency-Key": key,
      "X-LGTM-Workspace-Account-Id": owner,
      ...(intent === undefined ? {} : { "X-LGTM-Grading-Intent": intent }),
    },
  }), { params: Promise.resolve({ id: submissionId }) });
  return { status: response.status, body: await response.json() };
}

async function runs() {
  return (await h.db.query("select state, failure_code from public.grading_runs where submission_id = $1 order by run_number", [submissionId])).rows;
}

async function gradeCount() {
  const { rows: [row] } = await h.db.query("select count(*)::int as count from public.ai_grades where submission_id = $1", [submissionId]);
  return row.count;
}

async function seedRun(expired = false) {
  await h.db.query(`insert into public.grading_runs (id, submission_id, run_number, state, created_at)
    values ($1, $2, 1, 'running', clock_timestamp() - make_interval(secs => $3))`, [runId, submissionId, expired ? 60 : 0]);
}

async function expireRun(id: string) {
  // Advance this fixture's effective age without changing the app or waiting a minute.
  await h.db.query("begin");
  try {
    await h.db.query("set local session_replication_role = replica");
    await h.db.query("update public.grading_runs set created_at = clock_timestamp() - interval '60 seconds' where id = $1", [id]);
    await h.db.query("commit");
  } catch (error) {
    await h.db.query("rollback");
    throw error;
  }
}

it.each([undefined, "resume"])("SYS-02.1 LRN-05.2 rejects invalid grading intent (%s) before privileged work", async intent => {
  mocks.admin.mockClear();
  expect(await grade(intent)).toMatchObject({ status: 400, body: { error: { code: "VALIDATION_ERROR" } } });
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(await runs()).toEqual([]);
});

it("LRN-05.2 SYS-10.3 enforces start and retry intent in the database independently of the HTTP route", async () => {
  const start = (p_intent: "initial" | "retry") => h.admin.rpc("start_learner_grading", {
    p_account_id: owner, p_submission_id: submissionId, p_idempotency_key: randomUUID(), p_intent,
  });
  expect(await start("retry")).toMatchObject({ error: null, data: { status: "pending" } });
  expect(await runs()).toEqual([]);
  const first = await start("initial");
  expect(first).toMatchObject({ error: null, data: { status: "started", gradingRunId: expect.any(String) } });
  expect(await h.admin.rpc("fail_learner_grading", {
    p_account_id: owner, p_submission_id: submissionId, p_grading_run_id: first.data.gradingRunId,
    p_failure_code: "AI_UNAVAILABLE",
  })).toMatchObject({ error: null });
  expect(await start("initial")).toMatchObject({ error: null, data: { status: "failed", failureCode: "AI_UNAVAILABLE" } });
  expect(await runs()).toEqual([{ state: "failed", failure_code: "AI_UNAVAILABLE" }]);
  expect(await start("retry")).toMatchObject({ error: null, data: { status: "started", gradingRunId: expect.any(String) } });
  expect(await runs()).toEqual([{ state: "failed", failure_code: "AI_UNAVAILABLE" }, { state: "running", failure_code: null }]);
});

it("LRN-05.2 LRN-05.3 SEC-05.1 prevents a stale initial request from retrying another tab's failed run", async () => {
  const { data, error } = await h.clients.learnerA.rpc("read_learner_submission", { p_submission_id: submissionId });
  expect(error).toBeNull();
  expect(data).toMatchObject({ submission: { grading: { state: "pending" } } });

  const call = h.admin.rpc.bind(h.admin);
  const rpc = vi.spyOn(h.admin, "rpc").mockImplementation((name, args, options) => {
    if (name !== "start_learner_grading") return call(name, args, options);
    // Commit the competing failure after the route's owned read and before its start RPC.
    return h.db.query(`insert into public.grading_runs (id, submission_id, run_number, state, finished_at, failure_code)
      values ($1, $2, 1, 'failed', clock_timestamp(), 'AI_UNAVAILABLE')`, [runId, submissionId])
      .then(() => call(name, args, options)) as unknown as ReturnType<typeof call>;
  });
  expect(await grade("initial")).toMatchObject({ status: 502, body: { error: { code: "AI_UNAVAILABLE" } } });
  expect(rpc.mock.calls.filter(([name]) => name === "start_learner_grading")).toHaveLength(1);
  expect(await runs()).toEqual([{ state: "failed", failure_code: "AI_UNAVAILABLE" }]);
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(rpc.mock.calls.some(([name]) => name === "llm_grading_context" || name === "llm_accounting")).toBe(false);
});

it("LRN-05.3 does not start the first run for explicit retry intent", async () => {
  const rpc = vi.spyOn(h.admin, "rpc");
  expect(await grade("retry")).toMatchObject({ status: 200, body: { data: { state: "pending", original: null } } });
  expect(await runs()).toEqual([]);
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(rpc.mock.calls.some(([name]) => name === "llm_grading_context" || name === "llm_accounting")).toBe(false);
});

it("LRN-05.3 SEC-05.1 preserves a failed key after a fresh retry key completes the grade", async () => {
  const key = randomUUID();
  mocks.execute.mockRejectedValueOnce(Object.assign(new Error("Unavailable"), { code: "AI_UNAVAILABLE" }));
  const failed = await grade("initial", key);
  expect(failed).toMatchObject({ status: 502, body: { error: { code: "AI_UNAVAILABLE" } } });
  expect(await grade("retry")).toMatchObject({ status: 200, body: { data: { state: "completed" } } });
  const rpc = vi.spyOn(h.admin, "rpc");
  expect(await grade("initial", key)).toEqual(failed);
  expect(await gradeCount()).toBe(1);
  expect(await runs()).toEqual([{ state: "failed", failure_code: "AI_UNAVAILABLE" }, { state: "completed", failure_code: null }]);
  expect(mocks.execute).toHaveBeenCalledTimes(2);
  expect(rpc.mock.calls.some(([name]) => name === "llm_grading_context" || name === "llm_accounting")).toBe(false);
});

it("SYS-10.1 SYS-10.3 SEC-01.1 keeps the replay ledger and private lock helper inaccessible to API roles", async () => {
  const ledger = "private.learner_grading_requests";
  const lock = "private.lock_learner_grading_submission(uuid,uuid)";
  const { rows: [acl] } = await h.db.query(`select c.relrowsecurity as rls,
    exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where a.grantee = 0) as public_table,
    exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0) as public_function
    from pg_class c, pg_proc p where c.oid = $1::regclass and p.oid = $2::regprocedure`, [ledger, lock]);
  expect(acl).toEqual({ rls: true, public_table: false, public_function: false });
  const { rows } = await h.db.query(`select role,
    has_table_privilege(role, $1, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as table_access,
    has_any_column_privilege(role, $1, 'SELECT,INSERT,UPDATE,REFERENCES') as column_access,
    has_function_privilege(role, $2, 'EXECUTE') as execute
    from unnest(array['anon','authenticated','service_role']) as role`, [ledger, lock]);
  for (const { role, ...privileges } of rows) {
    expect(privileges, role).toEqual({ table_access: false, column_access: false, execute: false });
  }
  expect(rows).toHaveLength(3);
  for (const role of ["anon", "authenticated", "service_role"] as const) {
    const db = await h.connection(role, owner);
    await expect(db.query(`select 1 from ${ledger} limit 1`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("select private.lock_learner_grading_submission($1::uuid, $2::uuid)", [owner, submissionId])).rejects.toMatchObject({ code: "42501" });
  }
});

it("SYS-10.3 SEC-01.1 grants the bound context RPC only to the service role and requires the exact unexpired run", async () => {
  await seedRun();
  const { rows: [acl] } = await h.db.query(`select has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
    has_function_privilege('service_role', p.oid, 'EXECUTE') as service,
    exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0) as public,
    exists (select 1 from aclexplode(p.proacl) a where a.grantee = 'service_role'::regrole and a.privilege_type = 'EXECUTE') as explicit_service
    from pg_proc p where p.oid = to_regprocedure($1)`, [contextSignature]);
  expect(acl).toEqual({ anon: false, authenticated: false, service: true, public: false, explicit_service: true });
  for (const client of [h.client(), h.clients.learnerA, h.clients.learnerB, h.clients.authorA, h.clients.taA]) {
    expect((await client.rpc("llm_grading_context", contextArgs)).error).toMatchObject({ code: "42501" });
  }
  expect((await h.admin.rpc("llm_grading_context", { ...contextArgs, account_id: accounts.learnerB.id })).error)
    .toMatchObject({ message: "FORBIDDEN" });
  expect((await h.admin.rpc("llm_grading_context", { ...contextArgs, grading_run_id: randomUUID() })).error)
    .toMatchObject({ message: "INVALID_STATE" });
  expect(await h.admin.rpc("llm_grading_context", contextArgs)).toMatchObject({
    error: null, data: { revisionId: keys.pinnedA, flaws: expect.arrayContaining([expect.objectContaining({ id: match.key })]) },
  });
  await expireRun(runId);
  expect(await h.admin.rpc("llm_grading_context", contextArgs)).toMatchObject({
    data: null, error: { message: "INVALID_STATE" },
  });
});

it("LRN-05.2 SYS-10.3 SEC-01.1 passes the started run to the first private context read and rejects its expiry", async () => {
  const rpc = h.admin.rpc.bind(h.admin);
  let startedRun: string | undefined;
  const spy = vi.spyOn(h.admin, "rpc").mockImplementation((name, args, options) => {
    const result = rpc(name, args, options);
    if (name !== "start_learner_grading") return result;
    return Promise.resolve(result).then(async response => {
      if (response.data?.status === "started") {
        startedRun = response.data.gradingRunId;
        if (startedRun) await expireRun(startedRun);
      }
      return response;
    }) as unknown as ReturnType<typeof rpc>;
  });
  const result = await grade("initial");
  expect(startedRun).toEqual(expect.any(String));
  expect(spy.mock.calls.find(([name]) => name === "llm_grading_context")?.[1])
    .toEqual({ account_id: owner, submission_id: submissionId, grading_run_id: startedRun });
  expect(result).toMatchObject({ status: 504, body: { error: { code: "AI_TIMEOUT" } } });
  expect(spy.mock.calls.some(([name]) => name === "llm_accounting")).toBe(false);
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(await gradeCount()).toBe(0);
});

it.each(["before dispatch", "before recapture"] as const)(
  "LRN-05.2 SYS-10.3 SEC-01.1 rejects the bound run when the database deadline passes %s",
  async stage => {
    await seedRun(stage === "before dispatch");
    const clock = Date.now;
    const accounting = createAccountingStore({ db: await h.connection(), clock, limits, environmentId: "t04-llm-acceptance" });
    const reserve = vi.spyOn(accounting, "reserve");
    const provider = { execute: mocks.execute.mockImplementation(async () => {
      await expireRun(runId);
      return assessment(validFeedback);
    }) };
    const boundary = createLlmBoundary({ client: h.clients.learnerA, provider, accounting, clock, limits });
    const result = await boundary.execute({
      operation: "assess_review", resourceId: submissionId, idempotencyKey: randomUUID(),
    }, { gradingRunId: runId, matches: [match] });
    expect(result).toEqual({ error: { code: "INVALID_STATE" } });
    expect(reserve).toHaveBeenCalledTimes(stage === "before dispatch" ? 0 : 1);
    expect(mocks.execute).toHaveBeenCalledTimes(stage === "before dispatch" ? 0 : 1);
    expect(await runs()).toEqual([{ state: "running", failure_code: null }]);
  },
);

it.each([true, false])("SEC-03.1 SEC-05.3 rejects UUID-shaped assessment feedback and allows one normal retry (valid retry: %s)", async succeeds => {
  mocks.execute.mockResolvedValue(assessment(`The reasoning is clear. Reference ${echoedId}.`));
  if (succeeds) mocks.execute.mockResolvedValueOnce(assessment(`The reasoning is clear. Reference ${match.key}.`))
    .mockResolvedValueOnce(assessment(validFeedback));
  const result = await grade("initial");
  if (succeeds) {
    expect(result).toMatchObject({ status: 200, body: { data: { state: "completed", original: {
      comments: [expect.objectContaining({ feedback: validFeedback })],
    } } } });
  } else {
    expect(result).toMatchObject({ status: 422, body: { error: { code: "INVALID_AI_OUTPUT" } } });
    expect(await runs()).toEqual([{ state: "failed", failure_code: "INVALID_AI_OUTPUT" }]);
  }
  expect(await gradeCount()).toBe(succeeds ? 1 : 0);
  expect(mocks.execute).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(result.body)).not.toContain(succeeds ? match.key : echoedId);
});
