// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Provider } from "@/server/llm/provider";
import { envelope } from "../../unit/server/llm/fixtures";
import { insert, quote } from "./fixture";
import { createLearnerBrowseFixture } from "./learner-browse-fixture";

const mocks = vi.hoisted(() => ({
  client: null as SupabaseClient | null, admin: null as SupabaseClient | null,
  createAdmin: vi.fn(), execute: vi.fn<Provider["execute"]>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => mocks.client }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: mocks.createAdmin }));
vi.mock("@/server/llm/provider", async original => ({
  ...await original<typeof import("@/server/llm/provider")>(),
  createFakeProvider: () => ({ execute: mocks.execute }),
}));

type Fixture = Awaited<ReturnType<typeof createLearnerBrowseFixture>>;
type Actor = keyof Fixture["actors"];
type Learner = "learnerA" | "learnerB";
type Comment = { id: string; line: number; body: string };
type Run = { id: string; run_number: number; state: string; created_at: Date; finished_at: Date | null; failure_code: string | null };
type Attempt = Awaited<ReturnType<typeof attempt>>;
type Route = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
// These route modules are acceptance interfaces introduced by T-12.
const readModule = "../../../src/app/api/v1/submissions/[id]/route.ts";
const gradeModule = "../../../src/app/api/v1/submissions/[id]/grade/route.ts";
const origin = "http://localhost";
const accountHeader = "X-LGTM-Workspace-Account-Id";
const submissionIds: string[] = [];
const absent = "00000000-0000-4000-8000-000000099999";
const privateSentinel = "private raw provider response sentinel";
const feedback = "The consequence and proposed fix are clear.";
const note = "This returns the discount rather than the payable amount; multiply by one minus fraction.";
let fixture: Fixture;

beforeAll(async () => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("AI_PROVIDER", "fake");
  fixture = await createLearnerBrowseFixture({ scope: "submission", pageSize: 1 });
  mocks.admin = fixture.h.admin;
});

beforeEach(() => {
  mocks.createAdmin.mockReset().mockImplementation(() => mocks.admin);
  mocks.execute.mockReset().mockImplementation(async request => {
    if (request.data.operation !== "assess_review") throw new Error("Unexpected operation");
    return {
      output: envelope("assess_review", { assessments: request.data.payload.matches.map(({ key, comment }) =>
        ({ key, commentId: comment.id, explanationCredit: 1, fixCredit: 1, feedback })) }),
      usage: { inputTokens: 100, outputTokens: 20, verified: true },
    };
  });
});

afterAll(async () => {
  vi.unstubAllEnvs();
  if (!fixture) return;
  const { db } = fixture.h;
  const actors = Object.values(fixture.actors).map(({ id }) => id);
  await db.query("begin");
  try {
    // Delete committed fixtures by local test-owned IDs, including accounting and the grading replay ledger.
    await db.query("set local session_replication_role = replica");
    for (const table of ["llm_usage_events", "ai_usage_records", "llm_operations"]) {
      await db.query(`delete from private.${quote(table)} where account_id = any($1::uuid[])`, [actors]);
    }
    const ledgers = await db.query<{ table_name: string }>(`select c.table_name
      from information_schema.columns c
      join information_schema.tables t using (table_schema, table_name)
      where c.table_schema = 'private' and t.table_type = 'BASE TABLE'
        and c.column_name = 'submission_id' and c.udt_name = 'uuid'`);
    for (const { table_name } of ledgers.rows) {
      await db.query(`delete from private.${quote(table_name)} where submission_id = any($1::uuid[])`, [submissionIds]);
    }
    for (const table of ["ai_grade_evidence", "ai_grade_comment_results", "ai_grade_assessments", "ai_grade_eligible_hints"]) {
      await db.query(`delete from public.${quote(table)} where grade_id in
        (select id from public.ai_grades where submission_id = any($1::uuid[]))`, [submissionIds]);
    }
    for (const table of ["review_flags", "ai_grades"]) {
      await db.query(`delete from public.${quote(table)} where submission_id = any($1::uuid[])`, [submissionIds]);
    }
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await fixture.dispose();
  }
});

async function attempt(learner: Learner, challengeId: string, revisionId: string, notes: readonly (readonly [number, string])[] = []) {
  const id = randomUUID();
  const owner = fixture.actors[learner].id;
  const comments: Comment[] = notes.map(([line, body]) => ({ id: randomUUID(), line, body }));
  await insert(fixture.h.db, "public.submissions", {
    id, learner_id: owner, challenge_id: challengeId, revision_id: revisionId, attempt_number: 1,
  });
  submissionIds.push(id);
  for (const [ordinal, comment] of comments.entries()) {
    await insert(fixture.h.db, "public.submission_comments", { ...comment, submission_id: id, ordinal });
  }
  return { id, owner, learner, revisionId, comments };
}

async function request(id: string, caller: Actor | "anon", key?: string, intent: "initial" | "retry" = "initial") {
  mocks.client = caller === "anon" ? fixture.h.client() : fixture.actors[caller].client;
  const params = { params: Promise.resolve({ id }) };
  const endpoint = `${origin}/api/v1/submissions/${id}`;
  let response: Response;
  if (key) {
    const { POST } = await import(gradeModule) as { POST: Route };
    response = await POST(new Request(endpoint + "/grade", {
      method: "POST", body: "{}", headers: {
        "Content-Type": "application/json", "Idempotency-Key": key, Origin: origin,
        "X-LGTM-Grading-Intent": intent,
        [accountHeader]: caller === "anon" ? absent : fixture.actors[caller].id,
      },
    }), params);
  } else {
    const { GET } = await import(readModule) as { GET: Route };
    response = await GET(new Request(endpoint), params);
  }
  return { status: response.status, headers: response.headers, body: await response.json() };
}

function grade({ id, learner }: Attempt, key = randomUUID(), intent: "initial" | "retry" = "initial") {
  return request(id, learner, key, intent);
}
function read({ id, learner }: Attempt) { return request(id, learner); }

async function runs({ id }: Attempt) {
  return (await fixture.h.db.query<Run>(`select id, run_number, state, created_at, finished_at, failure_code
    from public.grading_runs where submission_id = $1 order by run_number`, [id])).rows;
}

async function counts({ id }: Attempt) {
  return (await fixture.h.db.query(`select
    (select count(*)::int from public.ai_grades where submission_id = $1) as grades,
    (select count(*)::int from public.review_flags where submission_id = $1) as flags,
    (select count(*)::int from public.ai_grade_evidence e join public.ai_grades g on g.id = e.grade_id where g.submission_id = $1) as evidence,
    (select count(*)::int from public.ai_grade_comment_results c join public.ai_grades g on g.id = c.grade_id where g.submission_id = $1) as comments,
    (select count(*)::int from public.ai_grade_assessments a join public.ai_grades g on g.id = a.grade_id where g.submission_id = $1) as assessments,
    (select count(*)::int from private.llm_operations where resource_id = $1) as operations`, [id])).rows[0];
}

const startName = "start_learner_grading";
const completeName = "complete_learner_grading";
const failName = "fail_learner_grading";
function ownerArgs({ id, owner }: Attempt) { return { p_account_id: owner, p_submission_id: id }; }
function start(submission: Attempt, intent: "initial" | "retry" = "initial") {
  return fixture.h.admin.rpc(startName, { ...ownerArgs(submission), p_idempotency_key: randomUUID(), p_intent: intent });
}
function fail(submission: Attempt, id: string, failure = "AI_UNAVAILABLE") {
  return fixture.h.admin.rpc(failName, { ...ownerArgs(submission), p_grading_run_id: id, p_failure_code: failure });
}
function complete(submission: Attempt, id: string, payload: object) {
  return fixture.h.admin.rpc(completeName, { ...ownerArgs(submission), p_grading_run_id: id, p_payload: payload });
}
async function seedRun(submission: Attempt, state: "running" | "pending" | "failed", ageSeconds = 0, code = "AI_UNAVAILABLE") {
  const id = randomUUID();
  await fixture.h.db.query(`insert into public.grading_runs (id, submission_id, run_number, state, created_at, finished_at, failure_code)
    values ($1, $2, 1, $3, clock_timestamp() - make_interval(secs => $4),
      case when $3 = 'failed' then clock_timestamp() end, case when $3 = 'failed' then $5 end)`,
    [id, submission.id, state, ageSeconds, code]);
  return id;
}

it("LRN-05.1 SYS-10.2 SYS-12.1 SEC-01.1 permits only the owning Learner across HTTP and the result RPC", async () => {
  const { ids, actors, h } = fixture;
  const owned = await attempt("learnerB", ids.reviewChallenge, ids.reviewRevision, [[3, note]]);
  expect(await read(owned)).toMatchObject({ status: 200, body: { data: { id: owned.id, grading: { state: "pending", original: null } } } });
  for (const actor of ["learnerA", "authorA", "authorB", "taA", "taB", "anon"] as const) {
    const response = await request(owned.id, actor);
    const post = await request(owned.id, actor, randomUUID());
    for (const result of [response, post]) {
      expect(result.status, actor).toBe(actor === "anon" ? 401 : 403);
      expect(JSON.stringify(result.body)).not.toContain(note);
    }
    const client = actor === "anon" ? h.client() : actors[actor].client;
    const direct = await client.rpc("read_learner_submission", { p_submission_id: owned.id });
    if (actor === "anon") expect(direct.error).not.toBeNull();
    else expect(direct.data).toEqual({ status: "forbidden" });
  }
  expect((await request(absent, "learnerB")).status).toBe(404);
  expect((await request(absent, "learnerB", randomUUID())).status).toBe(404);
  expect(mocks.createAdmin).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(await runs(owned)).toEqual([]);
  expect(await counts(owned)).toMatchObject({ operations: 0, grades: 0 });
});

it("SYS-10.1 SYS-10.3 SEC-01.1 limits grading functions to their explicit roles and keeps direct writes private", async () => {
  const { ids, h, actors } = fixture;
  const owned = await attempt("learnerB", ids.practice[0], fixture.longPublication.revisionId);
  const adminSignatures = [
    `public.${startName}(uuid,uuid,uuid,text)`,
    `public.${completeName}(uuid,uuid,uuid,jsonb)`,
    `public.${failName}(uuid,uuid,uuid,text)`,
    "public.llm_grading_context(uuid,uuid)",
  ];
  const { rows: privileges } = await h.db.query(`select signature,
    has_function_privilege('anon', p.oid, 'execute') as anon,
    has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
    has_function_privilege('service_role', p.oid, 'execute') as admin,
    exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public,
    exists (select 1 from aclexplode(p.proacl) a
      where a.grantee = 'service_role'::regrole and a.privilege_type = 'EXECUTE') as explicit_admin
    from unnest($1::text[]) signature join pg_proc p on p.oid = to_regprocedure(signature)`, [adminSignatures]);
  expect(privileges).toEqual(expect.arrayContaining(adminSignatures.map(signature =>
    ({ signature, anon: false, authenticated: false, admin: true, public: false, explicit_admin: true }))));
  expect(privileges).toHaveLength(adminSignatures.length);
  const rpcArgs = [
    [startName, { ...ownerArgs(owned), p_idempotency_key: randomUUID(), p_intent: "initial" }],
    [completeName, { ...ownerArgs(owned), p_grading_run_id: absent, p_payload: {} }],
    [failName, { ...ownerArgs(owned), p_grading_run_id: absent, p_failure_code: "AI_TIMEOUT" }],
    ["llm_grading_context", { account_id: owned.owner, submission_id: owned.id }],
  ] as const;
  for (const client of [h.client(), ...Object.values(actors).map(actor => actor.client)]) {
    for (const [name, args] of rpcArgs) {
      expect((await client.rpc(name, args)).error, name).toMatchObject({ code: "42501" });
    }
  }
  for (const name of ["grading_runs", "ai_grades", "ai_grade_evidence", "ai_grade_comment_results", "ai_grade_assessments", "ai_grade_eligible_hints", "review_flags"]) {
    const { rows } = await h.db.query<{ exposed: boolean }>(`select
      has_table_privilege('service_role', $1, 'SELECT,INSERT,UPDATE,DELETE') or
      has_any_column_privilege('service_role', $1, 'SELECT,INSERT,UPDATE') or
      has_table_privilege('anon', $1, 'SELECT,INSERT,UPDATE,DELETE') or
      has_table_privilege('authenticated', $1, 'INSERT,UPDATE,DELETE') as exposed`, [`public.${name}`]);
    expect(rows[0].exposed, name).toBe(false);
  }
  expect((await actors.learnerB.client.from("revision_flaws").select("id,explanation,fix").eq("revision_id", owned.revisionId)).data ?? []).toEqual([]);
  for (const actor of [actors.learnerA, actors.authorA, actors.taA]) {
    const forged = { p_account_id: actor.id, p_submission_id: owned.id };
    expect((await h.admin.rpc(startName, { ...forged, p_idempotency_key: randomUUID(), p_intent: "initial" })).error).toMatchObject({ message: "FORBIDDEN" });
    expect((await h.admin.rpc(completeName, { ...forged, p_grading_run_id: absent, p_payload: {} })).error).toMatchObject({ message: "FORBIDDEN" });
    expect((await h.admin.rpc(failName, { ...forged, p_grading_run_id: absent, p_failure_code: "AI_TIMEOUT" })).error).toMatchObject({ message: "FORBIDDEN" });
  }
  expect(await runs(owned)).toEqual([]);
});

it("LRN-05.1 LRN-05.4 LRN-05.5 SYS-12.4 grades the pinned first attempt and persists one assessment for every pinned flaw", async () => {
  const { ids, h, checkout, nextCheckout } = fixture;
  const owned = await attempt("learnerA", ids.c1, ids.revision1, [[3, note], [4, "Duplicate concern."], [6, "Currency precision."]]);
  const [match, duplicate, unmatched] = owned.comments;
  const { rows: [firstFlaw, missedFlaw] } = await h.db.query<{ id: string }>(
    "select id from public.revision_flaws where revision_id = $1 order by start_line, id", [ids.revision1]);
  await fixture.publishNextRevision();
  await h.db.query("update public.challenges set status = 'unpublished' where id = $1", [ids.c1]);

  const result = await grade(owned);
  expect(result.status).toBe(200);
  const original = expect.objectContaining({
    score: 25, passMark: 60, passed: false, identificationPoints: 0, explanationPoints: 15, fixPoints: 10,
    matchedCount: 1, missedCount: 1, unmatchedCommentIds: [unmatched.id], duplicateCommentIds: [duplicate.id],
    comments: [
      { commentId: match.id, matched: true, explanationCredit: 1, fixCredit: 1, feedback },
      ...[duplicate, unmatched].map(({ id }) => ({ commentId: id, matched: false, explanationCredit: null, fixCredit: null, feedback: null })),
    ],
  });
  expect(result.body).toMatchObject({ data: { state: "completed", failureCode: null, original } });
  const { rows: assessments } = await h.db.query(`select a.flaw_id, a.comment_id, a.distance
    from public.ai_grade_assessments a join public.ai_grades g on g.id = a.grade_id
    join public.revision_flaws f on f.id = a.flaw_id
    where g.submission_id = $1 order by f.start_line, a.flaw_id`, [owned.id]);
  expect(assessments).toEqual([
    { flaw_id: firstFlaw.id, comment_id: match.id, distance: 0 },
    { flaw_id: missedFlaw.id, comment_id: null, distance: null },
  ]);
  expect(await counts(owned)).toMatchObject({ grades: 1, evidence: 1, comments: 3, assessments: 2, flags: 0 });
  expect(await runs(owned)).toEqual([expect.objectContaining({ run_number: 1, state: "completed", finished_at: expect.any(Date) })]);
  expect(mocks.execute.mock.calls[0]?.[0].data).toMatchObject({ payload: {
    flawedCode: checkout.flawedCode,
    matches: [expect.objectContaining({ key: firstFlaw.id, comment: { id: match.id, line: 3, body: note } })],
  } });

  const rpc = vi.spyOn(h.admin, "rpc");
  try {
    const reopened = await read(owned);
    expect(reopened.status).toBe(200);
    expect(reopened.headers.get("Cache-Control")).toContain("no-store");
    expect(reopened.body).toMatchObject({ data: {
      revisionId: ids.revision1, challenge: { code: { before: "", after: checkout.flawedCode } },
      grading: { state: "completed", original },
    } });
    for (const secret of [firstFlaw.id, missedFlaw.id, checkout.source, nextCheckout.flawedCode,
      checkout.changes[0].explanation, checkout.changes[0].fix, fixture.actors.learnerA.email]) {
      expect(JSON.stringify(reopened.body)).not.toContain(secret);
    }
    expect(await grade(owned)).toMatchObject({ status: 200, body: result.body });
    expect(rpc.mock.calls.some(([name]) => name === "llm_grading_context")).toBe(false);
    expect(mocks.execute).toHaveBeenCalledOnce();
  } finally {
    rpc.mockRestore();
  }
});

it.each([{ comments: [] }, { comments: [[1, "A harmless first line."]] }] as const)(
  "LRN-05.4 SEC-05.1 completes a zero grade without a provider or reservation when no comments match (%j)", async ({ comments }) => {
    const { ids } = fixture;
    const owned = comments.length
      ? await attempt("learnerB", ids.differentDifficulty, ids.differentDifficultyRevision, comments)
      : await attempt("learnerA", ids.c2, ids.quotientRevision, comments);
    expect(await grade(owned)).toMatchObject({ status: 200, body: { data: {
      state: "completed", original: { score: 0, passed: false, matchedCount: 0, unmatchedCommentIds: owned.comments.map(c => c.id) },
    } } });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(await counts(owned)).toMatchObject({ grades: 1, operations: 0, flags: 0, evidence: 1 });
  },
);

it("LRN-05.2 SEC-05.1 coalesces concurrent grade requests, including the same replay key", async () => {
  const { ids } = fixture;
  const owned = await attempt("learnerA", ids.differentDifficulty, ids.differentDifficultyRevision, [[3, note]]);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const execute = mocks.execute.getMockImplementation()!;
  mocks.execute.mockImplementationOnce(async (...args) => {
    entered.resolve();
    await release.promise;
    return execute(...args);
  });
  const key = randomUUID();
  const inFlight = grade(owned, key);
  try {
    await Promise.race([entered.promise, inFlight.then(result => { throw new Error(`Grade resolved before dispatch with status ${result.status}`); })]);
    const reading = await read(owned);
    expect(reading).toMatchObject({ status: 200, body: { data: { grading: { state: "running", original: null } } } });
    for (const replay of await Promise.all([grade(owned, key), grade(owned)])) {
      expect(replay).toMatchObject({ status: 409, body: { error: { code: "INVALID_STATE" } } });
    }
  } finally {
    release.resolve();
    await inFlight;
  }
  const first = await inFlight;
  expect(first).toMatchObject({ status: 200, body: { data: { state: "completed" } } });
  expect(await grade(owned, key)).toMatchObject({ status: 200, body: first.body });
  expect(await runs(owned)).toHaveLength(1);
  expect(await counts(owned)).toMatchObject({ grades: 1, operations: 1 });
  expect(mocks.execute).toHaveBeenCalledOnce();
});

it("LRN-05.3 LRN-05.6 SYS-18.2 SEC-06.1 retains a failed submission, replays its outcome, and retries only with a new key", async () => {
  const { ids } = fixture;
  const owned = await attempt("learnerA", ids.differentLanguage, ids.differentLanguageRevision, [[2, "The handler hides failures."]]);
  mocks.execute.mockRejectedValueOnce(Object.assign(new Error(privateSentinel), { code: "AI_UNAVAILABLE" }));
  const logged = ["log", "info", "warn", "error", "debug"].map(name => vi.spyOn(console, name as "log").mockImplementation(() => {}));
  const key = randomUUID();
  try {
    const failed = await grade(owned, key);
    expect(failed).toMatchObject({ status: 502, body: { error: { code: "AI_UNAVAILABLE" } } });
    const observed = await read(owned);
    expect(observed.body).toMatchObject({ data: { id: owned.id, attemptNumber: 1,
      grading: { state: "failed", failureCode: "AI_UNAVAILABLE", original: null, effective: null } } });
    expect(JSON.stringify([failed.body, observed.body, ...logged.map(log => log.mock.calls)])).not.toContain(privateSentinel);
    expect(await counts(owned)).toMatchObject({ grades: 0, comments: 0, assessments: 0, evidence: 0, flags: 0 });
    expect(await grade(owned, key)).toMatchObject({ status: failed.status, body: failed.body });
    expect(mocks.execute).toHaveBeenCalledOnce();

    expect(await grade(owned, randomUUID(), "retry")).toMatchObject({ status: 200, body: { data: { state: "completed" } } });
    expect(await runs(owned)).toEqual([
      expect.objectContaining({ run_number: 1, state: "failed", failure_code: "AI_UNAVAILABLE" }),
      expect.objectContaining({ run_number: 2, state: "completed", failure_code: null }),
    ]);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(await counts(owned)).toMatchObject({ grades: 1 });
    expect((await read(owned)).body.data.attemptNumber).toBe(1);
  } finally {
    for (const log of logged) log.mockRestore();
  }
});

it("LRN-05.6 blocks retries after AI input-limit failure without invoking the provider", async () => {
  const { ids } = fixture;
  const owned = await attempt("learnerB", ids.differentLanguage, ids.differentLanguageRevision, [[2, "An eligible comment."]]);
  await seedRun(owned, "failed", 0, "PAYLOAD_TOO_LARGE");
  expect((await read(owned)).body.data.grading).toMatchObject({ state: "failed", failureCode: "PAYLOAD_TOO_LARGE", original: null });
  expect(await grade(owned, randomUUID(), "retry")).toMatchObject({ status: 409, body: { error: { code: "INVALID_STATE" } } });
  expect(await runs(owned)).toHaveLength(1);
  expect(await counts(owned)).toMatchObject({ operations: 0, grades: 0 });
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("LRN-05.2 LRN-05.3 LRN-05.6 SYS-10.3 projects an expired run read-only then settles it while starting the next run", async () => {
  const { ids, h } = fixture;
  const owned = await attempt("learnerA", ids.differentCategory, ids.differentCategoryRevision);
  const id = await seedRun(owned, "running", 60);
  const before = await runs(owned);
  expect((await read(owned)).body.data.grading).toMatchObject({ state: "failed", failureCode: "AI_TIMEOUT", original: null });
  expect(await runs(owned)).toEqual(before);
  const { rows: [lower] } = await h.db.query<{ now: Date }>("select clock_timestamp() as now");
  expect((await start(owned, "retry")).error).toBeNull();
  const { rows: [upper] } = await h.db.query<{ now: Date }>("select clock_timestamp() as now");
  const history = await runs(owned);
  expect(history).toEqual([
    expect.objectContaining({ id, run_number: 1, state: "failed", failure_code: "AI_TIMEOUT", finished_at: expect.any(Date) }),
    expect.objectContaining({ run_number: 2, state: "running", created_at: expect.any(Date), finished_at: null, failure_code: null }),
  ]);
  for (const time of [history[0].finished_at!, history[1].created_at]) {
    expect(time.valueOf()).toBeGreaterThanOrEqual(lower.now.valueOf());
    expect(time.valueOf()).toBeLessThanOrEqual(upper.now.valueOf());
  }
  expect((await fail(owned, id)).error).toMatchObject({ message: "INVALID_STATE" });
  expect(await runs(owned)).toEqual(history);
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("LRN-05.2 SYS-10.3 fails closed for a stored pending run and does not transition it", async () => {
  const { ids } = fixture;
  const owned = await attempt("learnerB", ids.differentCategory, ids.differentCategoryRevision);
  const id = await seedRun(owned, "pending", 60);
  const before = await runs(owned);
  expect((await read(owned)).body.data?.grading?.state).not.toBe("pending");
  expect(await grade(owned)).toMatchObject({ status: 409, body: { error: { code: "INVALID_STATE" } } });
  expect((await fail(owned, id)).error).toMatchObject({ message: "INVALID_STATE" });
  expect(await runs(owned)).toEqual(before);
  expect(await counts(owned)).toMatchObject({ grades: 0, operations: 0 });
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("LRN-05.2 SYS-10.3 rejects expired completion and atomically rejects invalid children for an active run", async () => {
  const { ids, h } = fixture;
  const owned = await attempt("learnerB", ids.c2, ids.quotientRevision);
  const { rows: [flaw] } = await h.db.query<{ id: string; category: string; hint_id: string }>(
    `select f.id, f.category, h.id as hint_id from public.revision_flaws f
      join public.flaw_hints h on h.flaw_id = f.id where f.revision_id = $1`, [owned.revisionId]);
  const payload = {
    original: { score: 0, passMark: 60, passed: false, identificationPoints: 0, explanationPoints: 0, fixPoints: 0,
      matchedCount: 0, missedCount: 1, unmatchedCommentIds: [], duplicateCommentIds: [], comments: [],
      eligibleHints: [{ hintId: flaw.hint_id, category: flaw.category }] },
    matching: { matches: [], missedFlawIds: [flaw.id], unmatchedCommentIds: [], duplicateCommentIds: [] },
    assessments: [{ flawId: flaw.id, commentId: null, explanationCredit: 0, fixCredit: 0, feedback: null }],
    ruleFlags: [], providerOutputRetried: false,
  };
  const expired = await seedRun(owned, "running", 60);
  expect((await complete(owned, expired, payload)).error).toMatchObject({ message: "INVALID_STATE" });
  expect(await runs(owned)).toEqual([expect.objectContaining({ id: expired, state: "running", finished_at: null })]);
  expect((await start(owned, "retry")).error).toBeNull();
  const [, active] = await runs(owned);
  expect((await complete(owned, expired, payload)).error).toMatchObject({ message: "INVALID_STATE" });
  const malformed = { ...payload, assessments: [{ ...payload.assessments[0], flawId: absent }] };
  expect((await complete(owned, active.id, malformed)).error).not.toBeNull();
  expect(await counts(owned)).toMatchObject({ grades: 0, evidence: 0, comments: 0, assessments: 0, flags: 0 });
  expect((await runs(owned))[1]).toMatchObject({ id: active.id, state: "running", finished_at: null });
  expect((await complete(owned, active.id, payload)).error).toBeNull();
  expect(await counts(owned)).toMatchObject({ grades: 1, evidence: 1, assessments: 1 });
  expect((await runs(owned))[1]).toMatchObject({ id: active.id, state: "completed", finished_at: expect.any(Date) });
});

it("SYS-12.4 SYS-18.2 freezes the state, finish time and failure code of both terminal run states", async () => {
  const { ids, h } = fixture;
  const owned = await attempt("learnerA", ids.practice[0], fixture.longPublication.revisionId);
  expect((await start(owned)).error).toBeNull();
  const [active] = await runs(owned);
  expect((await fail(owned, active.id)).error).toBeNull();
  expect((await grade(owned, randomUUID(), "retry")).status).toBe(200);
  const history = await runs(owned);
  expect(history.map(run => run.state)).toEqual(["failed", "completed"]);
  for (const [id, assignment] of [
    [history[0].id, "state = 'completed', failure_code = null"],
    [history[0].id, "finished_at = finished_at + interval '1 second'"],
    [history[0].id, "failure_code = 'AI_TIMEOUT'"],
    [history[1].id, "state = 'failed', failure_code = 'AI_TIMEOUT'"],
    [history[1].id, "finished_at = finished_at + interval '1 second'"],
  ]) {
    await expect(h.db.query(`update public.grading_runs set ${assignment} where id = $1`, [id])).rejects.toMatchObject({
      code: expect.stringMatching(/^(23514|P0001)$/),
    });
  }
  expect(await runs(owned)).toEqual(history);
});

it.each([true, false])("SEC-03.1 SEC-05.3 SYS-18.2 rejects unsafe feedback and allows at most one output retry (valid retry: %s)", async succeeds => {
  const { ids, checkout } = fixture;
  const owned = succeeds
    ? await attempt("learnerB", ids.unpublished, ids.unpublishedRevision, [[3, note]])
    : await attempt("learnerB", ids.archived, ids.archivedRevision, [[2, "The handler suppresses failures."]]);
  const unsafe = succeeds ? checkout.changes[1].explanation : "Look at line 2.";
  const unsafeOutput: Provider["execute"] = async request => {
    if (request.data.operation !== "assess_review") throw new Error("Unexpected operation");
    const { key, comment } = request.data.payload.matches[0];
    return {
      output: envelope("assess_review", { assessments: [{
        key, commentId: comment.id, explanationCredit: 1, fixCredit: 1, feedback: unsafe,
      }] }),
      usage: { inputTokens: 100, outputTokens: 20, verified: true },
    };
  };
  mocks.execute.mockImplementationOnce(unsafeOutput);
  if (!succeeds) mocks.execute.mockImplementationOnce(unsafeOutput);

  const result = await grade(owned);
  expect(mocks.execute).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(result.body)).not.toContain(unsafe);
  if (succeeds) {
    expect(result).toMatchObject({ status: 200, body: { data: { state: "completed" } } });
    const { rows } = await fixture.h.db.query("select source, kind from public.review_flags where submission_id = $1", [owned.id]);
    expect(rows).toEqual([{ source: "rule", kind: "grading_output_retried" }]);
    expect(await counts(owned)).toMatchObject({ grades: 1, flags: 1, evidence: 1, operations: 1 });
  } else {
    expect(result).toMatchObject({ status: 422, body: { error: { code: "INVALID_AI_OUTPUT" } } });
    expect(await counts(owned)).toMatchObject({ grades: 0, flags: 0, comments: 0, assessments: 0, evidence: 0, operations: 1 });
    expect(await runs(owned)).toEqual([expect.objectContaining({ state: "failed", failure_code: "INVALID_AI_OUTPUT" })]);
  }
});
