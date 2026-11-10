// @vitest-environment node

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/challenges/[id]/submissions/route";
import { submissionErrorMessages, submissionSuccessSchema, type SubmissionView } from "@/lib/learner/submissions";
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
type Input = { revisionId: string; comments: { line: number; body: string }[]; previousSubmissionId?: string };
const eligibilityRpc = "read_learner_retry_eligibility";
const origin = "http://localhost";
const accountHeader = "X-LGTM-Workspace-Account-Id";
let fixture: Fixture;

beforeAll(async () => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("AI_PROVIDER", "fake");
  fixture = await createLearnerBrowseFixture({ scope: "submission", pageSize: 1 });
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

function client(caller: Caller) {
  return caller === "anon" ? fixture.h.client() : fixture.actors[caller].client;
}

function post(challengeId: string, payload: Input, key = randomUUID(), caller: Caller = "learnerA") {
  mocks.client = client(caller);
  const headers = new Headers({ "Content-Type": "application/json", "Idempotency-Key": key, Origin: origin });
  if (caller !== "anon") headers.set(accountHeader, fixture.actors[caller].id);
  return POST(new Request(`${origin}/api/v1/challenges/${challengeId}/submissions`, {
    method: "POST", headers, body: JSON.stringify(payload),
  }), { params: Promise.resolve({ id: challengeId }) });
}

function direct(challengeId: string, payload: unknown, key = randomUUID(), caller: Caller = "learnerA") {
  return client(caller).rpc("create_learner_submission", {
    p_challenge_id: challengeId, p_idempotency_key: key, p_payload: payload,
  });
}

function eligibility(id: string, caller: Caller = "learnerA") {
  return client(caller).rpc(eligibilityRpc, { p_submission_id: id });
}

async function rejected(response: Response, status: number, code: string, message = expect.stringMatching(/\S/)) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const json = await response.json();
  expect(json).toEqual({ error: { code, message } });
  return json;
}

async function created(response: Response): Promise<SubmissionView> {
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const { data } = submissionSuccessSchema.parse(await response.json());
  expect(data.grading).toEqual({ state: "pending", original: null, effective: null, failureCode: null, overrides: [] });
  return data;
}

async function seedGrade(id: string, score = 0) {
  const { h, createdAt, newerAt } = fixture;
  const runId = randomUUID();
  const gradeId = randomUUID();
  await insert(h.db, "public.grading_runs", {
    id: runId, submission_id: id, run_number: 1, state: "completed", created_at: createdAt, finished_at: newerAt,
  });
  await insert(h.db, "public.ai_grades", {
    id: gradeId, submission_id: id, score, passed: score >= 60, identification_points: score === 100 ? 50 : 0,
    explanation_points: score === 100 ? 30 : 0, fix_points: score === 100 ? 20 : 0,
  });
  await insert(h.db, "public.ai_grade_evidence", { grade_id: gradeId, grading_run_id: runId, provider_output_retried: false });
}

async function seedSubmission(challengeId: string, revisionId: string, caller: "learnerA" | "learnerB", previousId?: string) {
  const id = randomUUID();
  await insert(fixture.h.db, "public.submissions", {
    id, challenge_id: challengeId, revision_id: revisionId, learner_id: fixture.actors[caller].id,
    attempt_number: previousId ? 2 : 1, previous_submission_id: previousId ?? null,
  });
  return id;
}

async function comments(id: string) {
  return (await fixture.h.db.query("select id, ordinal, line, body from public.submission_comments where submission_id = $1 order by ordinal", [id])).rows;
}

it("LRN-06.5 SYS-10.1 explicitly grants the scoped eligibility RPC only to authenticated", async () => {
  const { h, ids } = fixture;
  const { rows } = await h.db.query(`select
    has_function_privilege('anon', p.oid, 'execute') as anon,
    has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
    has_function_privilege('service_role', p.oid, 'execute') as service_role,
    exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public,
    exists (select 1 from aclexplode(p.proacl) a
      where a.grantee = 'authenticated'::regrole and a.privilege_type = 'EXECUTE') as explicit_authenticated
    from pg_proc p where p.oid = to_regprocedure($1)`, [`public.${eligibilityRpc}(uuid)`]);
  expect(rows).toEqual([{ anon: false, authenticated: true, service_role: false, public: false, explicit_authenticated: true }]);
  expect((await eligibility(ids.missing, "anon")).error).toMatchObject({ code: "42501" });
  expect((await h.admin.rpc(eligibilityRpc, { p_submission_id: ids.missing })).error).toMatchObject({ code: "42501" });
});

it("LRN-06.5 denies another Learner's challenge publication state and second-attempt ID through the scoped retry eligibility reads", async () => {
  const { ids, h } = fixture;
  const first = await seedSubmission(ids.archived, ids.archivedRevision, "learnerB");
  await seedGrade(first);
  const second = await seedSubmission(ids.archived, ids.archivedRevision, "learnerB", first);
  for (const id of [first, second]) {
    expect(await eligibility(id, "learnerB")).toMatchObject({
      error: null, data: { status: "ok", published: false, secondSubmissionId: second },
    });
    for (const caller of ["learnerA", "authorA", "authorB", "taA", "taB"] as const) {
      const { data, error } = await eligibility(id, caller);
      expect(error).toBeNull();
      expect(data).toEqual({ status: "forbidden" });
    }
  }
  const missing = await eligibility(ids.missing);
  expect(missing.error).toBeNull();
  expect(missing.data).toEqual({ status: "not_found" });
  expect((await h.db.query("select status from public.challenges where id = $1", [ids.archived])).rows)
    .toEqual([{ status: "archived" }]);
});

it("LRN-06.5 rejects pending, failed and override-only first attempts through both creation entry points", async () => {
  const { ids, h, actors } = fixture;
  const first = await seedSubmission(ids.reviewChallenge, ids.reviewRevision, "learnerA");
  const payload = { revisionId: ids.reviewRevision, previousSubmissionId: first, comments: [] };
  async function assertIneligible() {
    await rejected(await post(ids.reviewChallenge, payload), 409, "ATTEMPT_LIMIT");
    expect(await direct(ids.reviewChallenge, payload)).toMatchObject({ data: { status: "attempt_limit" }, error: null });
  }
  await assertIneligible();
  await insert(h.db, "public.grading_runs", {
    submission_id: first, run_number: 1, state: "failed", failure_code: "AI_UNAVAILABLE",
    created_at: fixture.createdAt, finished_at: fixture.newerAt,
  });
  await assertIneligible();
  try {
    await insert(h.db, "public.grade_overrides", {
      submission_id: first, actor_id: actors.taA.id, audit_order: 1, score: 100, reason: "Fixture override without an original",
    });
    await assertIneligible();
    expect((await h.db.query("select id from public.submissions where previous_submission_id = $1", [first])).rows).toEqual([]);
  } finally {
    await h.db.query("begin");
    try {
      await h.db.query("set local session_replication_role = replica");
      await h.db.query("delete from public.grade_overrides where submission_id = $1", [first]);
      await h.db.query("delete from private.submission_audit_orders where submission_id = $1", [first]);
      await h.db.query("commit");
    } catch (error) {
      await h.db.query("rollback");
      throw error;
    }
  }
});

it("LRN-06.5 SYS-12.1 denies foreign, wrong-challenge, missing and second-attempt references and non-Learner callers", async () => {
  const { ids } = fixture;
  const first = await seedSubmission(ids.c2, ids.quotientRevision, "learnerA");
  await seedGrade(first);
  const second = await seedSubmission(ids.c2, ids.quotientRevision, "learnerA", first);
  await seedGrade(second);
  const foreign = await seedSubmission(ids.c2, ids.quotientRevision, "learnerB");
  await seedGrade(foreign);
  for (const previousSubmissionId of [foreign, second, ids.missing]) {
    const payload = { revisionId: ids.quotientRevision, previousSubmissionId, comments: [] };
    await rejected(await post(ids.c2, payload), 409, "ATTEMPT_LIMIT");
    expect(await direct(ids.c2, payload)).toMatchObject({ data: { status: "attempt_limit" }, error: null });
  }
  const wrongChallenge = { revisionId: ids.differentCategoryRevision, previousSubmissionId: first, comments: [] };
  await rejected(await post(ids.differentCategory, wrongChallenge), 409, "ATTEMPT_LIMIT");
  expect(await direct(ids.differentCategory, wrongChallenge)).toMatchObject({ data: { status: "attempt_limit" }, error: null });
  const payload = { revisionId: ids.quotientRevision, previousSubmissionId: first, comments: [] };
  for (const caller of ["authorA", "authorB", "taA", "taB"] as const) {
    await rejected(await post(ids.c2, payload, randomUUID(), caller), 403, "FORBIDDEN");
    expect(await direct(ids.c2, payload, randomUUID(), caller)).toMatchObject({ data: { status: "forbidden" }, error: null });
  }
  await rejected(await post(ids.c2, payload, randomUUID(), "anon"), 401, "UNAUTHENTICATED");
  expect((await direct(ids.c2, payload, randomUUID(), "anon")).error).toMatchObject({ code: "42501" });
});

it("LRN-06.6 SYS-14.2 creates one pinned retry of a passing original across fresh keys, preserving comments and legacy replay", async () => {
  const { ids, h, actors, checkout } = fixture;
  const firstKey = randomUUID();
  const firstInput = { revisionId: ids.revision1, comments: [
    { line: 3, body: "The amount is the discount. Return the payable amount." },
    { line: 10, body: "The empty reduction throws. Provide an initial zero." },
  ] };
  const first = await created(await post(ids.c1, firstInput, firstKey));
  // Check the exact fingerprint algorithm used by the deployed T-11 writer.
  const fingerprint = async () => (await h.db.query(`select fingerprint =
    sha256(convert_to(jsonb_build_object('revisionId', $4::uuid, 'comments', $5::jsonb)::text, 'UTF8')) as legacy
    from private.submission_create_requests where actor_id = $1 and challenge_id = $2 and idempotency_key = $3`,
  [actors.learnerA.id, ids.c1, firstKey, ids.revision1, JSON.stringify(firstInput.comments)])).rows;
  expect(await fingerprint()).toEqual([{ legacy: true }]);
  await seedGrade(first.id, 100);
  await fixture.publishNextRevision();

  const input = { revisionId: ids.revision1, previousSubmissionId: first.id, comments: [
    { line: 3, body: "First new note." }, { line: 3, body: "Second new note." },
  ] };
  const stale = { ...input, revisionId: ids.revision2 };
  await rejected(await post(ids.c1, stale), 409, "VERSION_CONFLICT");
  expect(await direct(ids.c1, stale)).toMatchObject({ data: { status: "version_conflict" }, error: null });
  expect(await direct(ids.c1, { ...input, comments: [{ line: 999, body: "Outside the pinned code." }] }))
    .toMatchObject({ data: { status: "invalid", invalidCommentIndex: 0 }, error: null });
  const keys = [randomUUID(), randomUUID()];
  const results = await Promise.all(keys.map(key => post(ids.c1, input, key)));
  expect(results.map(result => result.status).sort()).toEqual([201, 409]);
  const winner = results.findIndex(result => result.status === 201);
  const retry = await created(results[winner]);
  const loss = await rejected(results[1 - winner], 409, "ATTEMPT_LIMIT");
  expect(retry).toMatchObject({
    attemptNumber: 2, previousSubmissionId: first.id, revisionId: ids.revision1,
    challenge: { revisionId: ids.revision1, code: { before: "", after: checkout.flawedCode } },
  });
  expect(retry.comments).toEqual(input.comments.map((comment, ordinal) => ({
    ...comment, ordinal, id: expect.stringMatching(/^[\da-f-]{36}$/),
  })));
  expect(new Set([...first.comments, ...retry.comments].map(({ id }) => id)).size).toBe(4);
  expect((await actors.learnerA.client.from("submission_comments").update({ body: "Forged edit" })
    .eq("id", retry.comments[0].id)).error?.code).toBe("42501");
  expect(await comments(first.id)).toEqual(first.comments);
  expect(await comments(retry.id)).toEqual(retry.comments);
  expect((await h.db.query("select id from public.submissions where previous_submission_id = $1", [first.id])).rows)
    .toEqual([{ id: retry.id }]);
  expect(await eligibility(first.id)).toMatchObject({
    error: null, data: { status: "ok", published: true, secondSubmissionId: retry.id },
  });

  await h.db.query("update public.challenges set status = 'archived' where id = $1", [ids.c1]);
  expect(await created(await post(ids.c1, {
    ...input, previousSubmissionId: input.previousSubmissionId.toUpperCase(),
  }, keys[winner]))).toEqual(retry);
  expect(await rejected(await post(ids.c1, input, keys[1 - winner]), 409, "ATTEMPT_LIMIT")).toEqual(loss);
  await rejected(await post(ids.c1, { ...input, previousSubmissionId: ids.missing }, keys[winner]), 409, "IDEMPOTENCY_CONFLICT");
  expect(await created(await post(ids.c1, firstInput, firstKey))).toEqual(first);
  expect(await fingerprint()).toEqual([{ legacy: true }]);
  expect((await h.db.query("select id from public.grading_runs where submission_id = $1", [retry.id])).rows).toEqual([]);
  expect((await h.db.query("select id from private.llm_operations where account_id = $1", [actors.learnerA.id])).rows).toEqual([]);
});

it("LRN-06.7 serializes with unpublish and replays a recorded lifecycle rejection after publication resumes", async () => {
  const { ids, h } = fixture;
  const first = await seedSubmission(ids.unpublished, ids.unpublishedRevision, "learnerA");
  await seedGrade(first);
  const payload = { revisionId: ids.unpublishedRevision, previousSubmissionId: first, comments: [] };
  const key = randomUUID();
  await h.db.query("update public.challenges set status = 'published' where id = $1", [ids.unpublished]);
  await h.db.query("begin");
  let locked = true;
  let request: PromiseLike<Awaited<ReturnType<typeof direct>>> | undefined;
  try {
    await h.db.query("update public.challenges set status = 'unpublished' where id = $1", [ids.unpublished]);
    let returnedBeforeLock: string | undefined;
    request = direct(ids.unpublished, payload, key).then(result => {
      returnedBeforeLock = JSON.stringify(result.data ?? result.error);
      return result;
    });
    await expect.poll(async () => {
      if (returnedBeforeLock !== undefined) return "returned";
      const { rows } = await h.db.query<{ blocked: boolean }>(`select exists (
        select 1 from pg_locks where not granted and pg_backend_pid() = any(pg_blocking_pids(pid))
      ) as blocked`);
      return rows[0].blocked ? "blocked" : "waiting";
    }, { timeout: 5_000 }).not.toBe("waiting");
    expect(returnedBeforeLock, "Retry returned without taking the challenge row lock").toBeUndefined();
    await h.db.query("commit");
    locked = false;
  } finally {
    if (locked) await h.db.query("rollback");
    await request;
  }
  expect(await request).toMatchObject({ error: null, data: { status: "lifecycle_unavailable" } });
  expect((await h.db.query("select id from public.submissions where previous_submission_id = $1", [first])).rows).toEqual([]);
  await h.db.query("update public.challenges set status = 'published' where id = $1", [ids.unpublished]);
  await rejected(await post(ids.unpublished, payload, key), 409, "INVALID_STATE", submissionErrorMessages.lifecycleUnavailable);
  expect(await created(await post(ids.unpublished, payload))).toMatchObject({ attemptNumber: 2, previousSubmissionId: first });
});
