// @vitest-environment node
/// <reference types="vite/client" />

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { submissionSuccessSchema } from "@/lib/learner/submissions";
import { insert } from "./fixture";
import { createLearnerBrowseFixture } from "./learner-browse-fixture";

const mocks = vi.hoisted(() => ({ client: null as SupabaseClient | null, admin: vi.fn(), provider: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => mocks.client }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/llm/provider", async original => ({
  ...await original<typeof import("@/server/llm/provider")>(),
  createFakeProvider: () => ({ execute: mocks.provider }),
  createSocProvider: () => ({ execute: mocks.provider }),
}));

type Fixture = Awaited<ReturnType<typeof createLearnerBrowseFixture>>;
type Caller = keyof Fixture["actors"] | "anon";
type HintRoute = {
  GET: (request: Request, context: { params: Promise<{ id: string; hintId: string }> }) => Promise<Response>;
};
const path = "/src/app/api/v1/submissions/[id]/hints/[hintId]/route.ts";
const routes = import.meta.glob<HintRoute>("/src/app/api/v1/submissions/*/hints/*/route.ts");
const rpc = "read_learner_submission_hint";
const absent = "00000000-0000-4000-8000-000000099999";
const accountHeader = "X-LGTM-Workspace-Account-Id";
const feedback = "The effect on the payable amount is clear.";
let fixture: Fixture;
let hint1: string;
let hint2: string;
let hint3: string;
let currentRevisionHint: string;
let first: string;
let second: string;
let other: string;
let otherSecond: string;
let pending: string;
let hintTwoView: { hintId: string; category: string; text: string };

function client(caller: Caller) {
  return caller === "anon" ? fixture.h.client() : fixture.actors[caller].client;
}

async function seedAttempt(learner: "learnerA" | "learnerB", challengeId: string, revisionId: string, previousId?: string) {
  const id = randomUUID();
  await insert(fixture.h.db, "public.submissions", {
    id, learner_id: fixture.actors[learner].id, challenge_id: challengeId, revision_id: revisionId,
    attempt_number: previousId ? 2 : 1, previous_submission_id: previousId ?? null,
  });
  return id;
}

async function seedGrade(id: string, hint: string, category: string, matchedLine: number) {
  const { db } = fixture.h;
  const gradeId = randomUUID();
  const runId = randomUUID();
  const commentId = randomUUID();
  await insert(db, "public.submission_comments", {
    id: commentId, submission_id: id, ordinal: 0, line: matchedLine, body: "Consider the consequence of this return value.",
  });
  await insert(db, "public.grading_runs", {
    id: runId, submission_id: id, run_number: 1, state: "completed", created_at: fixture.createdAt, finished_at: fixture.newerAt,
  });
  await insert(db, "public.ai_grades", {
    id: gradeId, submission_id: id, score: 40, passed: false,
    identification_points: 25, explanation_points: 15, fix_points: 0,
  });
  await insert(db, "public.ai_grade_evidence", {
    grade_id: gradeId, grading_run_id: runId, provider_output_retried: false,
  });
  await insert(db, "public.ai_grade_comment_results", {
    grade_id: gradeId, comment_id: commentId, kind: "matched", explanation_credit: 1, fix_credit: 0, feedback,
  });
  const { rows } = await db.query<{ flaw_id: string; matched: boolean }>(`select h.flaw_id, h.id <> $2 as matched
    from public.flaw_hints h join public.submissions s on s.revision_id = h.revision_id where s.id = $1`, [id, hint]);
  for (const flaw of rows) {
    await insert(db, "public.ai_grade_assessments", {
      grade_id: gradeId, flaw_id: flaw.flaw_id, comment_id: flaw.matched ? commentId : null,
      distance: flaw.matched ? 0 : null,
    });
  }
  await insert(db, "public.ai_grade_eligible_hints", { grade_id: gradeId, hint_id: hint, category, ordinal: 0 });
}

beforeAll(async () => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("AI_PROVIDER", "fake");
  fixture = await createLearnerBrowseFixture({ scope: "submission", pageSize: 0, cleanupFeatureSubmissions: true });
  const { ids, h } = fixture;
  const { rows } = await h.db.query<{ id: string; text: string }>(`select h.id, h.text from public.flaw_hints h
    join public.revision_flaws f on f.id = h.flaw_id where h.revision_id in ($1, $2) order by h.id`,
  [ids.revision1, ids.quotientRevision]);
  [hint1, hint2, hint3] = rows.map(row => row.id);
  hintTwoView = { hintId: hint2, category: "edge_case", text: rows[1].text };
  first = await seedAttempt("learnerA", ids.c1, ids.revision1);
  await seedGrade(first, hint2, "edge_case", 3);
  second = await seedAttempt("learnerA", ids.c1, ids.revision1, first);
  await seedGrade(second, hint1, "logic_bug", 10);
  other = await seedAttempt("learnerB", ids.c1, ids.revision1);
  await seedGrade(other, hint2, "edge_case", 3);
  otherSecond = await seedAttempt("learnerB", ids.c1, ids.revision1, other);
  await seedGrade(otherSecond, hint2, "edge_case", 3);
  pending = await seedAttempt("learnerA", ids.c2, ids.quotientRevision);
  await fixture.publishNextRevision();
  const liveHints = await h.db.query<{ id: string }>("select id from public.flaw_hints where revision_id = $1 order by id", [ids.revision2]);
  currentRevisionHint = liveHints.rows[0].id;
});

beforeEach(() => {
  mocks.admin.mockClear().mockImplementation(() => { throw new Error("Unexpected privileged access"); });
  mocks.provider.mockClear().mockImplementation(() => { throw new Error("Unexpected provider dispatch"); });
});
afterEach(() => {
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.provider).not.toHaveBeenCalled();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await fixture?.dispose();
});

async function read(id: string, hintId: string, caller: Caller = "learnerA", options: { account?: string; search?: string } = {}) {
  const load = routes[path];
  if (!load) throw new Error(`Missing T-13 Route Handler: ${path}`);
  const { GET } = await load();
  mocks.client = client(caller);
  const headers = new Headers();
  if (options.account) headers.set(accountHeader, options.account);
  const response = await GET(new Request(`http://localhost/api/v1/submissions/${id}/hints/${hintId}${options.search ?? ""}`,
    { headers }), { params: Promise.resolve({ id, hintId }) });
  const cache = response.headers.get("cache-control");
  expect(cache).toContain("private");
  expect(cache).toContain("no-store");
  return { status: response.status, body: await response.json() };
}

function direct(id: string, hintId: string, caller: Caller = "learnerA") {
  return client(caller).rpc(rpc, { p_submission_id: id, p_hint_id: hintId });
}

async function deny(id: string, hintId: string, status: 403 | 404, caller: Caller = "learnerA") {
  expect(await read(id, hintId, caller)).toEqual({
    status, body: { error: { code: status === 403 ? "FORBIDDEN" : "NOT_FOUND", message: expect.stringMatching(/\S/) } },
  });
  const { data, error } = await direct(id, hintId, caller);
  expect(error).toBeNull();
  expect(data).toEqual({ status: status === 403 ? "forbidden" : "not_found" });
}

it("SEC-03.2 SYS-10.1 explicitly grants cached-hint execution only to authenticated", async () => {
  const { h } = fixture;
  const { rows } = await h.db.query(`select
    has_function_privilege('anon', p.oid, 'execute') as anon,
    has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
    has_function_privilege('service_role', p.oid, 'execute') as service_role,
    exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public,
    exists (select 1 from aclexplode(p.proacl) a
      where a.grantee = 'authenticated'::regrole and a.privilege_type = 'EXECUTE') as explicit_authenticated
    from pg_proc p where p.oid = to_regprocedure($1)`, [`public.${rpc}(uuid,uuid)`]);
  expect(rows).toEqual([{ anon: false, authenticated: true, service_role: false, public: false, explicit_authenticated: true }]);
  expect((await direct(first, hint2, "anon")).error).toMatchObject({ code: "42501" });
  expect((await h.admin.rpc(rpc, { p_submission_id: first, p_hint_id: hint2 })).error).toMatchObject({ code: "42501" });
});

it("LRN-06.1 SEC-03.2 preserves the strict result projection with feedback and hint IDs but no cached text", async () => {
  const { GET } = await import("@/app/api/v1/submissions/[id]/route");
  mocks.client = client("learnerA");
  const response = await GET(new Request(`http://localhost/api/v1/submissions/${first}`),
    { params: Promise.resolve({ id: first }) });
  expect(response.status).toBe(200);
  const raw = await response.json();
  const { data } = submissionSuccessSchema.parse(raw);
  expect(data.grading.original?.comments).toEqual([{
    commentId: data.comments[0].id, matched: true, explanationCredit: 1, fixCredit: 0, feedback,
  }]);
  expect(data.grading.original?.eligibleHints).toEqual([{ hintId: hint2, category: "edge_case" }]);
  expect(Object.keys(raw.data).sort()).toEqual([
    "attemptNumber", "challenge", "challengeId", "comments", "flags", "grading", "id", "learner",
    "previousSubmissionId", "revisionId", "submittedAt",
  ]);
  expect(Object.keys(raw.data.grading).sort()).toEqual(["effective", "failureCode", "original", "overrides", "state"]);
  expect(Object.keys(raw.data.grading.original).sort()).toEqual([
    "comments", "duplicateCommentIds", "eligibleHints", "explanationPoints", "fixPoints", "identificationPoints",
    "matchedCount", "missedCount", "passMark", "passed", "score", "unmatchedCommentIds",
  ]);
  expect(JSON.stringify(raw)).not.toContain(hintTwoView.text);
});

it("LRN-06.3 SEC-03.2 returns only the approved cached hint and checks real sessions, roles, and workspace account", async () => {
  expect(await read(first, hint2)).toEqual({ status: 200, body: { data: hintTwoView } });
  const owner = await direct(first, hint2);
  expect(owner.error).toBeNull();
  expect(owner.data).toEqual({ status: "ok", hint: hintTwoView });
  for (const caller of ["learnerB", "authorA", "authorB", "taA", "taB"] as const) await deny(first, hint2, 403, caller);
  expect(await read(first, hint2, "anon")).toMatchObject({ status: 401, body: { error: { code: "UNAUTHENTICATED" } } });
  expect(await read(first, hint2, "learnerA", { account: fixture.actors.learnerB.id }))
    .toMatchObject({ status: 403, body: { error: { code: "FORBIDDEN" } } });
  for (const [hintId, search] of [[hint2, "?includeAnswer=true"], ["invalid", ""]]) {
    expect(await read(first, hintId, "learnerA", { search })).toMatchObject({ status: 400, body: { error: { code: "VALIDATION_ERROR" } } });
  }
});

it("SEC-03.2 SYS-12.5 denies premature, matched, foreign-revision, foreign-submission and missing hints", async () => {
  await deny(pending, hint3, 403);
  await deny(first, hint1, 403);
  await deny(first, hint3, 403);
  await deny(first, currentRevisionHint, 403);
  await deny(other, hint2, 403);
  await deny(first, absent, 404);
  await deny(absent, hint2, 404);
});

it("LRN-06.3 scopes second-attempt hint reads to its own original grade's eligible hints", async () => {
  await deny(second, hint2, 403);
  const { status, body } = await read(second, hint1);
  expect(status).toBe(200);
  expect(body).toEqual({ data: {
    hintId: hint1, category: "logic_bug", text: "Consider what the returned value represents at the extremes of a discount.",
  } });
  expect((await direct(second, hint1)).data).toEqual({ status: "ok", hint: body.data });
  await deny(first, hint1, 403);
  for (const id of [other, otherSecond]) {
    expect(await read(id, hint2, "learnerB")).toEqual({ status: 200, body: { data: hintTwoView } });
    expect((await direct(id, hint2, "learnerB")).data).toEqual({ status: "ok", hint: hintTwoView });
  }
});

it("LRN-06.4 SEC-05 serves eligible history after unpublish and archive without writing grades or accounting", async () => {
  const { db } = fixture.h;
  const { c1 } = fixture.ids;
  const { id: actor } = fixture.actors.learnerA;
  const snapshot = async () => (await db.query(`select
    (select jsonb_agg(to_jsonb(g) order by g.id) from public.ai_grades g where submission_id = any($1::uuid[])) as grades,
    (select jsonb_agg(to_jsonb(r) order by r.id) from public.grading_runs r where submission_id = any($1::uuid[])) as runs,
    (select jsonb_agg(to_jsonb(o) order by o.id) from private.llm_operations o where account_id = $2) as operations,
    (select count(*) from private.ai_usage_records where account_id = $2) as usage,
    (select count(*) from private.llm_usage_events where account_id = $2) as events`, [[first, second], actor])).rows;
  const before = await snapshot();
  for (const status of ["unpublished", "archived"]) {
    await db.query("update public.challenges set status = $2, row_version = row_version + 1 where id = $1", [c1, status]);
    expect(await read(first, hint2)).toEqual({ status: 200, body: { data: hintTwoView } });
    expect((await direct(first, hint2)).data).toEqual({ status: "ok", hint: hintTwoView });
    await deny(first, hint1, 403);
  }
  expect(await snapshot()).toEqual(before);
});
