// @vitest-environment node
/// <reference types="vite/client" />
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { SubmissionView } from "@/lib/learner/submissions";
import { createLearnerReportsFixture } from "./learner-reports-fixture";

const context = vi.hoisted(() => ({ client: null as SupabaseClient | null, admin: vi.fn(), boundary: vi.fn(), provider: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({
  createClient: async () => {
    if (!context.client) throw new Error("Missing test request context");
    return context.client;
  },
}));
vi.mock("@/server/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => { context.admin(...args); throw new Error("Learner reports must use a user-scoped client"); },
}));
vi.mock("@/server/llm/boundary", () => ({
  createLlmBoundary: (...args: unknown[]) => { context.boundary(...args); throw new Error("Learner reports never request AI"); },
}));
vi.mock("@/server/llm/provider", () => ({ createFakeProvider: context.provider }));

type Fixture = Awaited<ReturnType<typeof createLearnerReportsFixture>>;
type Caller = keyof Fixture["actors"] | "anon";
type Flag = SubmissionView["flags"][number];
type ReportRoute = { POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> };
type ReportApplication = { createLearnerReport: (id: string, request: Request) => Promise<{ status: string; flag?: Flag }> };
type Reader = { readLearnerSubmission: (id: string) => Promise<{ status: string; submission?: SubmissionView }> };
type TaFlags = { readFlagPage: (search: URLSearchParams) => Promise<{ status: string; page?: { items: Flag[] } }> };

// T-15 acceptance interfaces, resolved at runtime so a missing module fails clearly.
const routePath = "/src/app/api/v1/submissions/[id]/reports/route.ts";
const applicationPath = "/src/server/learner/reports.ts";
const routes = import.meta.glob<ReportRoute>("/src/app/api/v1/submissions/*/reports/route.ts");
const applications = import.meta.glob<ReportApplication>("/src/server/learner/reports.ts");
const messages = {
  ineligible: "This comment isn't available for reporting.",
  alreadyReported: "This comment has already been reported.",
  inProgress: "Your report is still being confirmed. Check again.",
};
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const wrongRoles = ["authorA", "authorB", "taA", "taB"] as const;
const reason = "Rounding is unspecified for fractional prices.";

let f: Fixture;
let anon: SupabaseClient;
beforeAll(async () => { f = await createLearnerReportsFixture(); anon = f.h.client(); });
afterAll(async () => { context.client = null; await f?.dispose(); });
beforeEach(() => { context.admin.mockClear(); context.boundary.mockClear(); context.provider.mockClear(); });

const clientFor = (caller: Caller) => caller === "anon" ? anon : f.actors[caller].client;

function request(submissionId: string, payload: unknown, key: string | null) {
  const headers = new Headers({ "Content-Type": "application/json", Origin: "http://localhost" });
  if (key !== null) headers.set("Idempotency-Key", key);
  return new Request(`http://localhost/api/v1/submissions/${submissionId}/reports`, {
    method: "POST", headers, body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}
async function post(caller: Caller, submissionId: string, payload: unknown, key: string | null = randomUUID()) {
  if (!routes[routePath]) throw new Error(`Missing T-15 Route Handler: ${routePath}`);
  const { POST } = await routes[routePath]();
  context.client = clientFor(caller);
  return POST(request(submissionId, payload, key), { params: Promise.resolve({ id: submissionId }) });
}
async function application(caller: Caller, submissionId: string, payload: unknown, key = randomUUID()) {
  if (!applications[applicationPath]) throw new Error(`Missing T-15 application function: ${applicationPath}`);
  const { createLearnerReport } = await applications[applicationPath]();
  context.client = clientFor(caller);
  return createLearnerReport(submissionId, request(submissionId, payload, key));
}
function direct(caller: Caller, submissionId: string, payload: unknown, key: string = randomUUID(), extra: Record<string, unknown> = {}) {
  return (clientFor(caller).rpc as (name: string, args: Record<string, unknown>) => ReturnType<SupabaseClient["rpc"]>)(
    "create_learner_report", { p_submission_id: submissionId, p_idempotency_key: key, p_payload: payload, ...extra });
}
async function created(response: Response): Promise<Flag> {
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json();
  expect(Object.keys(body)).toEqual(["data"]);
  expect(JSON.stringify(body)).not.toMatch(/@example\.test|"email"|fingerprint|idempotency/i);
  return body.data;
}
async function failure(response: Response, status: number, code: string, message?: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json();
  expect(body).toEqual({ error: expect.objectContaining({ code, message: message ?? expect.stringMatching(/\S/) }) });
  return body;
}
async function flags(submissionId: string) {
  return (await f.h.db.query("select id, source, kind, comment_id, reason from public.review_flags where submission_id = $1 order by id", [submissionId])).rows;
}
async function readDetail(caller: Caller, submissionId: string) {
  const { readLearnerSubmission } = await import("@/server/learner/submissions") as Reader;
  context.client = clientFor(caller);
  return readLearnerSubmission(submissionId);
}
async function taFlags(status: "open" | "resolved") {
  const { readFlagPage } = await import("@/server/ta/moderation") as TaFlags;
  context.client = clientFor("taA");
  const page = await readFlagPage(new URLSearchParams(`status=${status}&kind=learner_report&limit=50`));
  expect(page.status).toBe("ok");
  return page.page!.items;
}
async function snapshot() {
  const result: Record<string, unknown> = {};
  for (const table of ["challenges", "challenge_revisions", "revision_flaws", "revision_answers", "flaw_hints", "submissions",
    "submission_comments", "grading_runs", "ai_grades", "ai_grade_evidence", "ai_grade_comment_results", "ai_grade_assessments",
    "ai_grade_eligible_hints", "grade_overrides"]) {
    result[table] = (await f.h.db.query(`select to_jsonb(t) as row from public.${table} t order by to_jsonb(t)::text`)).rows;
  }
  for (const table of ["llm_operations", "ai_usage_records", "llm_usage_events"]) {
    result[table] = (await f.h.db.query(`select to_jsonb(t) as row from private.${table} t order by to_jsonb(t)::text`)).rows;
  }
  return result;
}
function expectNoPrivilegedCalls() {
  expect(context.admin).not.toHaveBeenCalled();
  expect(context.boundary).not.toHaveBeenCalled();
  expect(context.provider).not.toHaveBeenCalled();
}

it("SYS-10.1 SYS-10.2 grants only authenticated execution of a definer RPC and no API access to the ledger or flag writes", async () => {
  const { rows: [fn] } = await f.h.db.query(`
    select p.prosecdef as definer, p.proconfig as config,
      has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
      has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('service_role', p.oid, 'execute') as service_role,
      exists (select 1 from aclexplode(p.proacl) acl where acl.grantee = 0) as public,
      exists (select 1 from aclexplode(p.proacl) acl where acl.grantee = 'authenticated'::regrole and acl.privilege_type = 'EXECUTE') as explicit_authenticated
    from pg_proc p where p.oid = to_regprocedure('public.create_learner_report(uuid,uuid,jsonb)')`);
  expect(fn).toEqual({ definer: true, config: expect.arrayContaining(['search_path=""']), authenticated: true, anon: false, service_role: false, public: false, explicit_authenticated: true });
  const { rows: ledger } = await f.h.db.query(`
    select c.relrowsecurity as rls,
      exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl where acl.grantee = 0) as public_access,
      exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) as app_role(name)
        where has_table_privilege(app_role.name, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
        or has_any_column_privilege(app_role.name, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')) as role_access
    from pg_class c where c.oid = to_regclass('private.learner_report_requests')`);
  expect(ledger).toEqual([{ rls: true, public_access: false, role_access: false }]);
  const { rows: writes } = await f.h.db.query(`
    select app_role.name from unnest(array['anon', 'authenticated', 'service_role']) as app_role(name)
    where has_table_privilege(app_role.name, 'public.review_flags', 'INSERT, UPDATE, DELETE, TRUNCATE')
      or has_any_column_privilege(app_role.name, 'public.review_flags', 'INSERT, UPDATE')`);
  expect(writes).toEqual([]);
  for (const role of ["anon", "service_role"]) {
    await f.h.db.query("begin");
    try {
      await f.h.db.query(`set local role ${role}`);
      await expect(f.h.db.query("select public.create_learner_report($1::uuid, $2::uuid, $3::jsonb)",
        [f.first, randomUUID(), JSON.stringify({ commentId: f.comments.firstUnmatched, reason })])).rejects.toMatchObject({ code: "42501" });
    } finally { await f.h.db.query("rollback"); }
  }
  expect(await flags(f.first)).toEqual([]);
});

it("SYS-08.3 SYS-11 LRN-07.1 denies anonymous, wrong-role and another Learner's report at route, application and RPC", async () => {
  const payload = { commentId: f.comments.firstUnmatched, reason };
  const anonymous = await direct("anon", f.first, payload);
  expect(anonymous.error?.code).toBe("42501");
  await failure(await post("anon", f.first, payload), 401, "UNAUTHENTICATED");
  expect((await application("anon", f.first, payload)).status).toBe("unauthenticated");
  for (const caller of wrongRoles) {
    const rpc = await direct(caller, f.first, payload);
    expect(rpc.error?.code).not.toBe("PGRST202");
    expect(rpc).toMatchObject({ error: null, data: { status: "forbidden" } });
    await failure(await post(caller, f.first, payload), 403, "FORBIDDEN");
    expect((await application(caller, f.first, payload)).status).toBe("role_denied");
  }
  expect(await direct("learnerB", f.first, payload)).toMatchObject({ error: null, data: { status: "forbidden" } });
  await failure(await post("learnerB", f.first, payload), 403, "FORBIDDEN");
  const foreign = await application("learnerB", f.first, payload);
  expect(foreign.status).toBe("forbidden");
  expect(foreign.flag).toBeUndefined();
  expect(await flags(f.first)).toEqual([]);
  expectNoPrivilegedCalls();
});

it("LRN-07.1 LRN-07.7 SYS-12.1 returns 404 for absent records and 409 for matched, duplicate and unfinished grading", async () => {
  const before = await snapshot();
  const cases = [
    [f.ids.missing, f.comments.firstUnmatched, 404, "not_found"],
    [f.first, f.comments.foreignUnmatched, 404, "not_found"],
    [f.first, randomUUID(), 404, "not_found"],
    [f.first, f.comments.matched, 409, "ineligible"],
    [f.first, f.comments.duplicate, 409, "ineligible"],
    [f.pending, f.comments.pendingNote, 409, "ineligible"],
    [f.running, f.comments.runningNote, 409, "ineligible"],
    [f.failed, f.comments.failedNote, 409, "ineligible"],
  ] as const;
  for (const [submissionId, commentId, status, outcome] of cases) {
    const payload = { commentId, reason };
    expect(await direct("learnerA", submissionId, payload)).toMatchObject({ error: null, data: { status: outcome } });
    const response = await post("learnerA", submissionId, payload);
    if (status === 404) await failure(response, 404, "NOT_FOUND");
    else await failure(response, 409, "INVALID_STATE", messages.ineligible);
  }
  for (const submissionId of [f.first, f.pending, f.running, f.failed]) expect(await flags(submissionId)).toEqual([]);
  expect(await snapshot()).toEqual(before);
  expectNoPrivilegedCalls();
});

it("SYS-02.1 SYS-12.5 rejects malformed or forged report input at the route and RPC and blocks direct flag writes", async () => {
  const valid = { commentId: f.comments.firstUnmatched, reason };
  const forged = [
    { ...valid, learnerId: f.actors.learnerB.id }, { ...valid, kind: "near_pass_mark" }, { ...valid, source: "rule" },
    { ...valid, grade: 100 }, { ...valid, fingerprint: "caller" }, { ...valid, submissionId: f.foreign },
    { commentId: valid.commentId }, { reason }, { ...valid, commentId: "comment" }, { ...valid, reason: " \n " },
    { ...valid, reason: "😀".repeat(2001) }, { ...valid, reason: 7 },
  ];
  for (const payload of forged) {
    const rpc = await direct("learnerA", f.first, payload);
    expect(rpc.error?.code).not.toBe("PGRST202");
    expect(rpc.error !== null || (rpc.data as { status?: string })?.status === "invalid").toBe(true);
    await failure(await post("learnerA", f.first, payload), 400, "VALIDATION_ERROR");
  }
  for (const extra of [{ p_learner_id: f.actors.learnerA.id }, { p_kind: "learner_report" }, { p_grade_id: randomUUID() }]) {
    expect((await direct("learnerA", f.first, valid, randomUUID(), extra)).error).not.toBeNull();
  }
  await failure(await post("learnerA", f.first, valid, null), 400, "VALIDATION_ERROR");
  await failure(await post("learnerA", f.first, valid, "not-a-key"), 400, "VALIDATION_ERROR");
  const insertFlag = await clientFor("learnerA").from("review_flags").insert({
    submission_id: f.first, source: "learner", kind: "learner_report", comment_id: valid.commentId, reason,
  });
  expect(insertFlag.error?.code).toBe("42501");
  expect(await flags(f.first)).toEqual([]);
  expectNoPrivilegedCalls();
});

it("LRN-07.4 LRN-07.5 SYS-12.1 creates one immutable report, replays it after resolution and changes no grading record", async () => {
  const before = await snapshot();
  const key = randomUUID();
  const flag = await created(await post("learnerA", f.first, { commentId: f.comments.firstUnmatched, reason: `  ${reason}\n` }, key));
  expect(flag).toEqual({
    id: expect.stringMatching(uuid), submissionId: f.first, source: "learner", kind: "learner_report",
    commentId: f.comments.firstUnmatched, reason, createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/), status: "open", resolutions: [],
  });
  expect(await flags(f.first)).toEqual([{ id: flag.id, source: "learner", kind: "learner_report", comment_id: f.comments.firstUnmatched, reason }]);
  expect(await snapshot()).toEqual(before);
  expectNoPrivilegedCalls();

  const detail = await readDetail("learnerA", f.first);
  expect(detail.status).toBe("ok");
  expect(detail.submission!.flags).toEqual([flag]);
  expect(detail.submission!.grading.original!.unmatchedCommentIds).toContain(f.comments.firstUnmatched);
  const rpcRead = await clientFor("learnerA").rpc("read_learner_submission", { p_submission_id: f.first });
  expect(rpcRead.error).toBeNull();
  expect((rpcRead.data as { submission: { flags: Flag[] } }).submission.flags).toEqual([flag]);
  expect((await taFlags("open")).filter(item => item.id === flag.id)).toEqual([flag]);

  expect(await created(await post("learnerA", f.first, { reason, commentId: f.comments.firstUnmatched }, key))).toEqual(flag);
  await failure(await post("learnerA", f.first, { commentId: f.comments.firstUnmatched, reason }), 409, "INVALID_STATE", messages.alreadyReported);
  expect(await direct("learnerA", f.first, { commentId: f.comments.firstUnmatched, reason })).toMatchObject({ error: null, data: { status: "already_reported" } });
  await failure(await post("learnerA", f.first, { commentId: f.comments.firstUnmatched, reason: "Another reason." }, key), 409, "IDEMPOTENCY_CONFLICT");
  await failure(await post("learnerA", f.first, { commentId: f.comments.raceUnmatched, reason }, key), 409, "IDEMPOTENCY_CONFLICT");

  await f.resolve(flag.id);
  const replay = await created(await post("learnerA", f.first, { commentId: f.comments.firstUnmatched, reason }, key));
  expect(replay).toMatchObject({ id: flag.id, status: "resolved", resolutions: [expect.objectContaining({ disposition: "dismissed" })] });
  expect((await taFlags("resolved")).find(item => item.id === flag.id)).toEqual(replay);
  await failure(await post("learnerA", f.first, { commentId: f.comments.firstUnmatched, reason }), 409, "INVALID_STATE", messages.alreadyReported);
  const update = await clientFor("learnerA").from("review_flags").update({ reason: "Edited." }).eq("id", flag.id);
  const remove = await clientFor("learnerA").from("review_flags").delete().eq("id", flag.id);
  expect(update.error?.code).toBe("42501");
  expect(remove.error?.code).toBe("42501");
  expect(await flags(f.first)).toEqual([{ id: flag.id, source: "learner", kind: "learner_report", comment_id: f.comments.firstUnmatched, reason }]);
  expect(await snapshot()).toEqual(before);
  expectNoPrivilegedCalls();
});

it("LRN-07.1 SYS-12.4 accepts the second attempt, historical results after unpublish/archive and Learner B's own attempt", async () => {
  const second = await created(await post("learnerA", f.second, { commentId: f.comments.secondUnmatched, reason }));
  expect(second).toMatchObject({ submissionId: f.second, commentId: f.comments.secondUnmatched });
  const { rows: [{ status: unpublishedStatus }] } = await f.h.db.query("select status from public.challenges where id = $1", [f.ids.unpublished]);
  const { rows: [{ status: archivedStatus }] } = await f.h.db.query("select status from public.challenges where id = $1", [f.ids.archived]);
  expect([unpublishedStatus, archivedStatus]).toEqual(["unpublished", "archived"]);
  const unpublished = await application("learnerA", f.unpublished, { commentId: f.comments.unpublishedUnmatched, reason });
  expect(unpublished).toMatchObject({ status: "ok", flag: { submissionId: f.unpublished, commentId: f.comments.unpublishedUnmatched } });
  const archived = await direct("learnerA", f.archived, { commentId: f.comments.archivedUnmatched, reason });
  expect(archived).toMatchObject({ error: null, data: { status: "ok", flag: { submissionId: f.archived, commentId: f.comments.archivedUnmatched, reason } } });
  const own = await created(await post("learnerB", f.foreign, { commentId: f.comments.foreignUnmatched, reason }));
  expect(own).toMatchObject({ submissionId: f.foreign, commentId: f.comments.foreignUnmatched });
  for (const [submissionId, flag] of [[f.second, second], [f.foreign, own]] as const) {
    const owner = submissionId === f.foreign ? "learnerB" : "learnerA";
    expect((await readDetail(owner, submissionId)).submission!.flags).toEqual([flag]);
  }
  for (const submissionId of [f.second, f.unpublished, f.archived, f.foreign]) expect(await flags(submissionId)).toHaveLength(1);
  expectNoPrivilegedCalls();
});

it("LRN-07.5 concurrent distinct keys and concurrent same-key duplicates each create exactly one flag", async () => {
  const pair = { commentId: f.comments.raceUnmatched, reason };
  const distinct = await Promise.all([post("learnerA", f.first, pair), post("learnerA", f.first, pair)]);
  expect(distinct.map(response => response.status).sort()).toEqual([201, 409]);
  const winner = await created(distinct.find(response => response.status === 201)!);
  const loser = await distinct.find(response => response.status === 409)!.json();
  expect(loser.error.code).toBe("INVALID_STATE");
  expect([messages.alreadyReported, messages.inProgress]).toContain(loser.error.message);
  expect((await flags(f.first)).filter(row => row.comment_id === f.comments.raceUnmatched)).toEqual([
    { id: winner.id, source: "learner", kind: "learner_report", comment_id: f.comments.raceUnmatched, reason },
  ]);

  const key = randomUUID();
  const same = { commentId: f.comments.secondRace, reason };
  const responses = await Promise.all([post("learnerA", f.second, same, key), post("learnerA", f.second, same, key), post("learnerA", f.second, same, key)]);
  const statuses = responses.map(response => response.status);
  expect(statuses).toContain(201);
  expect(statuses.every(status => status === 201 || status === 409)).toBe(true);
  const results = await Promise.all(responses.map(response => response.json()));
  const successes = results.filter((_, index) => statuses[index] === 201).map(body => body.data);
  for (const body of results.filter((_, index) => statuses[index] === 409)) expect(body.error).toMatchObject({ code: "INVALID_STATE", message: messages.inProgress });
  expect(new Set(successes.map(flag => flag.id)).size).toBe(1);
  expect(await created(await post("learnerA", f.second, same, key))).toEqual(successes[0]);
  expect((await flags(f.second)).filter(row => row.comment_id === f.comments.secondRace)).toHaveLength(1);
});

it("LRN-07.7 replays a recorded failure for its key and evaluates a new explicit key afresh", async () => {
  const key = randomUUID();
  const payload = { commentId: f.comments.lateUnmatched, reason };
  const rejected = await failure(await post("learnerA", f.late, payload, key), 409, "INVALID_STATE", messages.ineligible);
  await f.complete(f.late);
  const replay = await post("learnerA", f.late, payload, key);
  expect(replay.status).toBe(409);
  expect(await replay.json()).toEqual(rejected);
  await failure(await post("learnerA", f.late, { ...payload, reason: "A different reason." }, key), 409, "IDEMPOTENCY_CONFLICT");
  expect(await flags(f.late)).toEqual([]);
  const fresh = await created(await post("learnerA", f.late, payload));
  expect(fresh).toMatchObject({ submissionId: f.late, commentId: f.comments.lateUnmatched, status: "open" });
  expect(await flags(f.late)).toHaveLength(1);
  expectNoPrivilegedCalls();
});
