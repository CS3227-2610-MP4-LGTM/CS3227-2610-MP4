// @vitest-environment node
/// <reference types="vite/client" />
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createLearnerBrowseFixture } from "./learner-browse-fixture";

const requestContext = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({
  createClient: async () => {
    if (!requestContext.client) throw new Error("Missing test request context");
    return requestContext.client;
  },
}));
vi.mock("@/server/supabase/admin", () => ({
  createAdminClient: () => { throw new Error("Submission creation must use a user-scoped client"); },
}));
vi.mock("@/server/llm/boundary", () => ({
  createLlmBoundary: () => { throw new Error("Submission creation does not grade the attempt"); },
}));

type Fixture = Awaited<ReturnType<typeof createLearnerBrowseFixture>>;
type Caller = keyof Fixture["actors"] | "anon";
type CommentInput = { line: number; body: string };
type SubmissionResponse = { id: string; comments: (CommentInput & { id: string; ordinal: number })[] };
type SubmissionRoute = { POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> };
type SubmissionReader = { readLearnerSubmission: (id: string) => Promise<{ status: string }> };
const wrongRoles = ["authorA", "authorB", "taA", "taB"] as const;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const lifecycleMessage = "This challenge is no longer available for submission.";
const inProgressMessage = "Submission is still being confirmed. Check again.";
const pendingGrade = { state: "pending", failureCode: null, original: null, effective: null, overrides: [] };
const routePath = "/src/app/api/v1/challenges/[id]/submissions/route.ts";
const readerPath = "/src/server/learner/submissions.ts";
const routes = import.meta.glob<SubmissionRoute>("/src/app/api/v1/challenges/*/submissions/route.ts");
const readers = import.meta.glob<SubmissionReader>("/src/server/learner/submissions.ts");

let fixture: Fixture;
let anon: SupabaseClient;

beforeAll(async () => {
  fixture = await createLearnerBrowseFixture({ scope: "submission", pageSize: 0 });
  anon = fixture.h.client();
});

afterAll(async () => {
  requestContext.client = null;
  await fixture?.dispose();
});

function clientFor(caller: Caller) {
  return caller === "anon" ? anon : fixture.actors[caller].client;
}

async function post(caller: Caller, challengeId: string, payload: unknown, key: string | null = randomUUID()) {
  const { POST } = await loadPostRoute();
  requestContext.client = clientFor(caller);
  const headers = new Headers({ "Content-Type": "application/json" });
  if (key !== null) headers.set("Idempotency-Key", key);
  const request = new NextRequest(`http://localhost/api/v1/challenges/${challengeId}/submissions`, {
    method: "POST", headers, body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
  return POST(request, { params: Promise.resolve({ id: challengeId }) });
}

function loadPostRoute() {
  if (!routes[routePath]) throw new Error(`Missing T-11 Route Handler: ${routePath}`);
  return routes[routePath]();
}

async function readResult(caller: Caller, submissionId: string) {
  if (!readers[readerPath]) throw new Error(`Missing T-11 submission result reader: ${readerPath}`);
  const { readLearnerSubmission } = await readers[readerPath]();
  requestContext.client = clientFor(caller);
  return readLearnerSubmission(submissionId);
}

function directCreate(caller: Caller, challengeId: string, payload: unknown, key: string = randomUUID()) {
  return clientFor(caller).rpc("create_learner_submission", {
    p_challenge_id: challengeId, p_idempotency_key: key, p_payload: payload,
  });
}

async function expectError(response: Response, status: number, code: string, message = expect.stringMatching(/\S/)) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const payload = await response.json();
  expect(payload).toEqual({ error: expect.objectContaining({ code, message }) });
  expect(Object.keys(payload.error).filter(key => !["code", "message", "fieldErrors"].includes(key))).toEqual([]);
  return payload;
}

async function created(response: Response): Promise<SubmissionResponse> {
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const payload = await response.json();
  expect(payload).toEqual({ data: expect.objectContaining({ id: expect.stringMatching(uuid), grading: pendingGrade }) });
  return payload.data;
}

async function attempts(challengeId: string) {
  return (await fixture.h.db.query(
    "select id, learner_id, revision_id, attempt_number, previous_submission_id from public.submissions where challenge_id = $1 order by id",
    [challengeId],
  )).rows;
}

async function storedComments(submissionId: string) {
  return (await fixture.h.db.query(
    "select id, ordinal, line, body from public.submission_comments where submission_id = $1 order by ordinal",
    [submissionId],
  )).rows;
}

it("SYS-10.1 explicitly grants only authenticated RPC execution and denies direct table writes or ledger access", async () => {
  const { h } = fixture;
  const grants = await h.db.query(`
    select has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
      has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('service_role', p.oid, 'execute') as service_role,
      exists (select 1 from aclexplode(p.proacl) acl where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as public,
      exists (select 1 from aclexplode(p.proacl) acl where acl.grantee = 'authenticated'::regrole
        and acl.privilege_type = 'EXECUTE') as explicit_authenticated
    from pg_proc p
    where p.oid = to_regprocedure('public.create_learner_submission(uuid,uuid,jsonb)')
  `);
  expect(grants.rows).toEqual([{
    authenticated: true, anon: false, service_role: false, public: false, explicit_authenticated: true,
  }]);
  const access = await h.db.query(`
    select c.relrowsecurity as rls,
      exists (select 1 from aclexplode(c.relacl) acl where acl.grantee = 0) as public_access,
      exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) as app_role(name)
        where has_table_privilege(app_role.name, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
        or has_any_column_privilege(app_role.name, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')) as role_access
    from pg_class c where c.oid = to_regclass('private.submission_create_requests')
  `);
  expect(access.rows).toEqual([{ rls: true, public_access: false, role_access: false }]);
  const writes = await h.db.query(`
    select c.relname, app_role.name from pg_class c
    cross join unnest(array['anon', 'authenticated', 'service_role']) as app_role(name)
    where c.oid in ('public.submissions'::regclass, 'public.submission_comments'::regclass)
      and (has_table_privilege(app_role.name, c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE')
        or has_any_column_privilege(app_role.name, c.oid, 'INSERT, UPDATE'))
  `);
  expect(writes.rows).toEqual([]);
});

it("SYS-08.3 denies anonymous and wrong-role submission calls at both entry points", async () => {
  const { ids } = fixture;
  const original = await attempts(ids.reviewChallenge);
  const body = { revisionId: ids.reviewRevision, comments: [] };
  for (const caller of ["anon", ...wrongRoles] as const) {
    const direct = await directCreate(caller, ids.reviewChallenge, body);
    if (caller !== "anon") expect(direct.error?.code).not.toBe("PGRST202");
    expect(direct.error || direct.data?.status === "forbidden").toBeTruthy();
  }
  await expectError(await post("anon", ids.reviewChallenge, body), 401, "UNAUTHENTICATED");
  for (const caller of wrongRoles) {
    await expectError(await post(caller, ids.reviewChallenge, body), 403, "FORBIDDEN");
  }
  expect(await attempts(ids.reviewChallenge)).toEqual(original);
});

it("LRN-04.5 rejects malformed, forged, oversized and out-of-revision requests without writing a submission", async () => {
  const { ids, actors, checkout } = fixture;
  const original = await attempts(ids.reviewChallenge);
  const valid = { revisionId: ids.reviewRevision, comments: [] };
  const lastLine = checkout.flawedCode.trimEnd().split("\n").length;
  const invalidBodies = [
    { ...valid, previousSubmissionId: "not-a-submission" },
    { ...valid, learnerId: actors.learnerA.id, submittedAt: fixture.createdAt, grade: 100 },
    { ...valid, fingerprint: "caller-supplied" },
    { ...valid, revisionId: "invalid" },
    { ...valid, comments: [{ line: 3, body: "forged", id: ids.firstA, ordinal: 1 }] },
    { ...valid, comments: [{ line: 3, body: "wrong location", path: "challenge.js", side: "before" }] },
    { ...valid, comments: [{ line: lastLine + 1, body: "past trailing LF" }] },
    { ...valid, comments: [{ line: 1.5, body: "fractional line" }] },
    { ...valid, comments: [{ line: 0, body: "nonpositive line" }] },
    { ...valid, comments: [{ line: 3, body: "\n\t " }] },
    { ...valid, comments: [{ line: 3, body: "😀".repeat(2001) }] },
    { ...valid, comments: Array.from({ length: 51 }, () => ({ line: 3, body: "Too many" })) },
  ];
  for (const body of invalidBodies) {
    const direct = await directCreate("learnerB", ids.reviewChallenge, body);
    expect(direct.error?.code).not.toBe("PGRST202");
    expect(direct.error || direct.data?.status === "invalid").toBeTruthy();
    await expectError(await post("learnerB", ids.reviewChallenge, body), 400, "VALIDATION_ERROR");
  }
  const badDirectKey = await directCreate("learnerB", ids.reviewChallenge, valid, "invalid");
  expect(badDirectKey.error || badDirectKey.data?.status === "invalid").toBeTruthy();
  await expectError(await post("learnerB", ids.reviewChallenge, valid, null), 400, "VALIDATION_ERROR");
  await expectError(await post("learnerB", ids.reviewChallenge, valid, "invalid"), 400, "VALIDATION_ERROR");
  await expectError(await post("learnerB", ids.reviewChallenge, "{"), 400, "VALIDATION_ERROR");
  const oversized = { ...valid, comments: Array.from({ length: 50 }, () => ({ line: 3, body: "😀".repeat(2000) })) };
  await expectError(await post("learnerB", ids.reviewChallenge, oversized), 413, "PAYLOAD_TOO_LARGE");
  expect(await attempts(ids.reviewChallenge)).toEqual(original);
});

it("LRN-03.5 commits one owned first attempt with ordered immutable comments and no grading run", async () => {
  const { actors, ids, checkout, h } = fixture;
  const inputs = [{ line: 3, body: "  first  " }, { line: 3, body: "second" }, { line: 10, body: "last" }];
  const response = await post("learnerA", ids.reviewChallenge, { revisionId: ids.reviewRevision, comments: inputs });
  const submission = await created(response);
  const comments = inputs.map(({ line, body }, ordinal) => ({ id: expect.stringMatching(uuid), ordinal, line, body: body.trim() }));
  const lines = checkout.flawedCode.replace(/\n$/, "").split("\n");
  expect(submission).toEqual({
    id: submission.id, challengeId: ids.reviewChallenge, revisionId: ids.reviewRevision,
    learner: { id: actors.learnerA.id, displayName: "Learner A" },
    attemptNumber: 1, previousSubmissionId: null, submittedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    challenge: {
      id: ids.reviewChallenge, revisionId: ids.reviewRevision, title: checkout.title, description: checkout.description,
      language: checkout.language, difficulty: checkout.difficulty, categories: ["edge_case", "logic_bug"],
      publishedAt: expect.stringMatching(/^2026-01-01T00:00:00(?:\.0+)?(?:Z|\+00:00)$/),
      code: { path: "challenge.js", before: "", after: checkout.flawedCode, hunks: [{
        oldStart: 0, oldCount: 0, newStart: 1, newCount: lines.length,
        lines: lines.map((text, index) => ({ kind: "added", oldLine: null, newLine: index + 1, text })),
      }] },
    },
    comments, grading: pendingGrade, flags: [],
  });
  expect(new Set(submission.comments.map(comment => comment.id)).size).toBe(inputs.length);
  expect(await attempts(ids.reviewChallenge)).toEqual([{
    id: submission.id, learner_id: actors.learnerA.id, revision_id: ids.reviewRevision,
    attempt_number: 1, previous_submission_id: null,
  }]);
  expect(await storedComments(submission.id)).toEqual(submission.comments);
  const runs = await h.db.query("select id from public.grading_runs where submission_id = $1", [submission.id]);
  expect(runs.rows).toEqual([]);
  const lateComment = await clientFor("learnerA").from("submission_comments")
    .insert({ submission_id: submission.id, ordinal: 3, line: 3, body: "late" });
  const edit = await clientFor("learnerA").from("submission_comments")
    .update({ body: "altered" }).eq("id", submission.comments[0].id);
  const remove = await clientFor("learnerA").from("submissions").delete().eq("id", submission.id);
  expect(lateComment.error?.code).toBe("42501");
  expect(edit.error?.code).toBe("42501");
  expect(remove.error?.code).toBe("42501");
  expect(await storedComments(submission.id)).toEqual(submission.comments);
});

it("SYS-12.4 limits result reads to the owning Learner and retains the submitted revision through lifecycle changes", async () => {
  const { ids, checkout, h } = fixture;
  const payload = { revisionId: ids.revision1, comments: [{ line: 3, body: "Owner's pinned note" }] };
  const key = randomUUID();
  const submission = await created(await post("learnerB", ids.c1, payload, key));
  for (const caller of ["anon", "learnerA", ...wrongRoles] as const) {
    const denied = await readResult(caller, submission.id);
    expect(denied.status).not.toBe("ok");
    expect(denied).not.toHaveProperty("submission");
    expect(denied).toEqual({ status: caller === "anon" ? "unauthenticated" : "forbidden" });
    const direct = await clientFor(caller).from("submission_comments").select("id,body").eq("submission_id", submission.id);
    expect(direct.data ?? []).toEqual(caller.startsWith("ta") ? [{ id: submission.comments[0].id, body: payload.comments[0].body }] : []);
  }
  await fixture.publishNextRevision();
  await expectError(await post("learnerA", ids.c1, payload), 409, "VERSION_CONFLICT");
  await expectError(await post("learnerB", ids.c1, { ...payload, revisionId: ids.revision2 }), 409, "ATTEMPT_LIMIT");
  const assertPinned = async () => {
    const owned = await readResult("learnerB", submission.id);
    expect(owned).toMatchObject({ status: "ok", submission: {
      id: submission.id, revisionId: ids.revision1, comments: submission.comments,
      challenge: { revisionId: ids.revision1, code: { before: "", after: checkout.flawedCode } }, grading: { state: "pending" },
    } });
    expect(JSON.stringify(owned)).not.toContain(checkout.changes[0].fix);
    const replay = await created(await post("learnerB", ids.c1, payload, key));
    expect(replay).toEqual(submission);
  };
  await assertPinned();
  for (const status of ["unpublished", "archived"]) {
    await h.db.query("update public.challenges set status = $2 where id = $1", [ids.c1, status]);
    await assertPinned();
  }
});

it("SYS-12.4 returns not_found for a missing submission ID", async () => {
  expect(await readResult("learnerA", fixture.ids.missing)).toEqual({ status: "not_found" });
});

it("LRN-04.4 replays canonical requests while isolating the same key by actor and challenge", async () => {
  const { ids, actors } = fixture;
  const key = randomUUID();
  const payload = { revisionId: ids.quotientRevision, comments: [{ line: 1, body: "  Same note  " }] };
  const responses = await Promise.all([post("learnerA", ids.c2, payload, key), post("learnerA", ids.c2, payload, key)]);
  expect(responses.map(response => response.status)).toContain(201);
  const first = await created(responses.find(response => response.status === 201)!);
  for (const response of responses.filter(response => !response.bodyUsed)) {
    if (response.status === 201) expect(await created(response)).toEqual(first);
    else await expectError(response, 409, "INVALID_STATE", inProgressMessage);
  }
  const canonical = { comments: [{ body: "Same note", line: 1 }], revisionId: ids.quotientRevision };
  expect(await created(await post("learnerA", ids.c2, canonical, key))).toEqual(first);
  await expectError(await post("learnerA", ids.c2, { ...payload, comments: [] }, key), 409, "IDEMPOTENCY_CONFLICT");
  const otherActor = await created(await post("learnerB", ids.c2, { ...payload, comments: [] }, key));
  const otherResource = await created(await post("learnerA", ids.differentCategory, {
    revisionId: ids.differentCategoryRevision, comments: [],
  }, key));
  expect(new Set([first.id, otherActor.id, otherResource.id]).size).toBe(3);
  expect((await attempts(ids.c2)).map(row => row.learner_id).sort()).toEqual([actors.learnerA.id, actors.learnerB.id]);
  expect(await storedComments(otherActor.id)).toEqual([]);
});

it("LRN-04.2 concurrent distinct keys admit one attempt and record the losing key's outcome", async () => {
  const { ids } = fixture;
  const body = { revisionId: ids.differentDifficultyRevision, comments: [{ line: 3, body: "One attempt" }] };
  const keys = [randomUUID(), randomUUID()];
  const responses = await Promise.all(keys.map(key => post("learnerA", ids.differentDifficulty, body, key)));
  expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
  const winner = responses.findIndex(response => response.status === 201);
  const success = await created(responses[winner]);
  const rejection = await expectError(responses[1 - winner], 409, "ATTEMPT_LIMIT");
  expect(await storedComments(success.id)).toHaveLength(1);
  expect(await attempts(ids.differentDifficulty)).toHaveLength(1);
  const replay = await post("learnerA", ids.differentDifficulty, body, keys[1 - winner]);
  expect(replay.status).toBe(409);
  expect(await replay.json()).toEqual(rejection);
});

it("LRN-04.5 serializes with lifecycle changes, records rejection and permits a new explicit key", async () => {
  const { ids, h } = fixture;
  const key = randomUUID();
  const payload = { revisionId: ids.unpublishedRevision, comments: [{ line: 1, body: "Preserve my draft" }] };
  await loadPostRoute();
  await h.db.query("update public.challenges set status = 'published' where id = $1", [ids.unpublished]);
  // Hold the actual challenge row during a concurrent lifecycle transition.
  await h.db.query("begin");
  let locked = true;
  let request: Promise<{ response: Response } | { error: unknown }> | undefined;
  try {
    await h.db.query("update public.challenges set status = 'unpublished' where id = $1", [ids.unpublished]);
    request = post("learnerA", ids.unpublished, payload, key).then(response => ({ response }), error => ({ error }));
    await expect.poll(async () => (await h.db.query(`
      select exists (
        select 1 from pg_locks where not granted and pg_backend_pid() = any(pg_blocking_pids(pid))
      ) as blocked
    `)).rows[0].blocked, { timeout: 5_000 }).toBe(true);
    await h.db.query("commit");
    locked = false;
  } finally {
    if (locked) await h.db.query("rollback");
    // Ensure no request is still using the fixture when this assertion fails.
    await request;
  }
  const completed = await request;
  if (!completed) throw new Error("Submission request did not start");
  if ("error" in completed) throw completed.error;
  const rejected = await expectError(completed.response, 409, "INVALID_STATE", lifecycleMessage);
  expect(await attempts(ids.unpublished)).toEqual([]);
  await h.db.query("update public.challenges set status = 'published' where id = $1", [ids.unpublished]);
  const replay = await post("learnerA", ids.unpublished, payload, key);
  expect(replay.status).toBe(409);
  expect(await replay.json()).toEqual(rejected);
  await expectError(await post("learnerA", ids.unpublished, { ...payload, comments: [] }, key), 409, "IDEMPOTENCY_CONFLICT");
  expect(await attempts(ids.unpublished)).toEqual([]);
  await created(await post("learnerA", ids.unpublished, payload));
});

it("LRN-04.5 rejects a first attempt on an archived challenge without writing a submission", async () => {
  const { ids } = fixture;
  const response = await post("learnerA", ids.archived, {
    revisionId: ids.archivedRevision, comments: [{ line: 1, body: "Review note" }],
  });
  await expectError(response, 409, "INVALID_STATE", lifecycleMessage);
  expect(await attempts(ids.archived)).toEqual([]);
});

it("LRN-03.3 accepts 50 directly validated Unicode boundary comments without the HTTP envelope cap", async () => {
  const { ids } = fixture;
  const key = randomUUID();
  const body = "😀".repeat(2000);
  const payload = { revisionId: ids.differentLanguageRevision,
    comments: Array.from({ length: 50 }, () => ({ line: 1, body: ` ${body} ` })) };
  const result = await directCreate("learnerA", ids.differentLanguage, payload, key);
  expect(result.error).toBeNull();
  const saved = await attempts(ids.differentLanguage);
  expect(saved).toHaveLength(1);
  const comments = await storedComments(saved[0].id);
  expect(comments.map(({ ordinal, line, body }) => ({ ordinal, line, body })))
    .toEqual(Array.from({ length: 50 }, (_, ordinal) => ({ ordinal, line: 1, body })));
  const replay = await directCreate("learnerA", ids.differentLanguage, {
    comments: payload.comments.map(({ line }) => ({ body, line })), revisionId: payload.revisionId,
  }, key);
  expect(replay.error).toBeNull();
  expect(replay.data).toEqual(result.data);
  expect(await attempts(ids.differentLanguage)).toEqual(saved);
  expect(await storedComments(saved[0].id)).toEqual(comments);
});
