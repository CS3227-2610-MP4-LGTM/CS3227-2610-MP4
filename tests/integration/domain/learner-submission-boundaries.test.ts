// @vitest-environment node

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/challenges/[id]/submissions/route";
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
  createAdminClient: () => { throw new Error("Submission requests must use a user-scoped client"); },
}));

type Fixture = Awaited<ReturnType<typeof createLearnerBrowseFixture>>;
type Learner = "learnerA" | "learnerB";
type Input = { revisionId: string; comments: { line: number; body: string }[] };
const accountHeader = "X-LGTM-Workspace-Account-Id";
const origin = "http://localhost";
const descending = [{ line: 3, body: "Third line." }, { line: 1, body: "First line." }];
const sameLine = [{ line: 3, body: "First note." }, { line: 3, body: "Second note." }];
const noWrites = { submissions: 0, comments: 0, grading_runs: 0, ledger: 0 };

let fixture: Fixture;

beforeAll(async () => {
  fixture = await createLearnerBrowseFixture({ scope: "submission", pageSize: 0 });
});

afterAll(async () => {
  requestContext.client = null;
  await fixture?.dispose();
});

async function submit(caller: Learner, challengeId: string, input: Input, key: string, workspaceAccount?: string) {
  requestContext.client = fixture.actors[caller].client;
  const headers = new Headers({ "Content-Type": "application/json", "Idempotency-Key": key });
  if (workspaceAccount !== undefined) {
    headers.set("Origin", origin);
    headers.set(accountHeader, workspaceAccount);
  }
  const response = await POST(new Request(`${origin}/api/v1/challenges/${challengeId}/submissions`, {
    method: "POST", headers, body: JSON.stringify(input),
  }), { params: Promise.resolve({ id: challengeId }) });
  return { status: response.status, body: await response.json() };
}

function directCreate(caller: Learner, challengeId: string, input: Input, key: string) {
  return fixture.actors[caller].client.rpc("create_learner_submission", {
    p_challenge_id: challengeId, p_idempotency_key: key, p_payload: input,
  });
}

async function writesFor(challengeId: string) {
  const { rows } = await fixture.h.db.query<typeof noWrites>(`
    select
      (select count(*)::int from public.submissions where challenge_id = $1) as submissions,
      (select count(*)::int from public.submission_comments comment
        join public.submissions submission on submission.id = comment.submission_id
        where submission.challenge_id = $1) as comments,
      (select count(*)::int from public.grading_runs run
        join public.submissions submission on submission.id = run.submission_id
        where submission.challenge_id = $1) as grading_runs,
      (select count(*)::int from private.submission_create_requests where challenge_id = $1) as ledger
  `, [challengeId]);
  return rows[0];
}

it("LRN-03.5 REV-02 rejects descending comment lines through HTTP without ledger or domain writes", async () => {
  const { ids } = fixture;
  const result = await submit("learnerA", ids.c1, { revisionId: ids.revision1, comments: descending }, randomUUID());
  const writes = await writesFor(ids.c1);
  expect.soft(result).toMatchObject({ status: 400, body: { error: { code: "VALIDATION_ERROR" } } });
  expect(writes).toEqual(noWrites);
});

it("LRN-03.5 REV-02 rejects descending comment lines through the direct RPC without ledger or domain writes", async () => {
  const { ids } = fixture;
  const result = await directCreate("learnerA", ids.reviewChallenge, {
    revisionId: ids.reviewRevision, comments: descending,
  }, randomUUID());
  const writes = await writesFor(ids.reviewChallenge);
  expect.soft(result).toMatchObject({ status: 400, error: { code: "VALIDATION_ERROR" } });
  expect(writes).toEqual(noWrites);
});

it("LRN-03.5 REV-02 preserves same-line input order through HTTP and the direct RPC", async () => {
  const { ids, actors } = fixture;
  const http = await submit("learnerB", ids.c1, { revisionId: ids.revision1, comments: sameLine }, randomUUID(),
    actors.learnerB.id);
  const direct = await directCreate("learnerB", ids.reviewChallenge, {
    revisionId: ids.reviewRevision, comments: sameLine,
  }, randomUUID());
  const expected = sameLine.map((comment, ordinal) => expect.objectContaining({ ...comment, ordinal }));
  expect(http).toMatchObject({ status: 201, body: { data: { comments: expected } } });
  expect(direct).toMatchObject({ error: null, data: { status: "ok", submission: { comments: expected } } });
});

it("LRN-04.4 LRN-04.5 REV-03 SEC-REV-03 records an out-of-revision line, replays it after unpublish and conflicts on payload changes", async () => {
  const { ids, h } = fixture;
  const key = randomUUID();
  const invalid = { revisionId: ids.quotientRevision, comments: [{ line: 99, body: "Outside the pinned code." }] };
  const first = await submit("learnerA", ids.c2, invalid, key);
  const afterFirst = await writesFor(ids.c2);
  const replay = await submit("learnerA", ids.c2, invalid, key);
  const corrected = await submit("learnerA", ids.c2, {
    ...invalid, comments: [{ line: 1, body: invalid.comments[0].body }],
  }, key);

  await h.db.query("update public.challenges set status = 'unpublished' where id = $1", [ids.c2]);
  const afterUnpublish = await submit("learnerA", ids.c2, invalid, key);
  const afterReplay = await writesFor(ids.c2);

  expect(first).toMatchObject({
    status: 400,
    body: { error: { code: "VALIDATION_ERROR", fieldErrors: { "comments.0.line": [expect.any(String)] } } },
  });
  expect.soft(afterFirst).toEqual({ ...noWrites, ledger: 1 });
  expect.soft(replay).toEqual(first);
  expect.soft(corrected).toMatchObject({ status: 409, body: { error: { code: "IDEMPOTENCY_CONFLICT" } } });
  expect.soft(afterUnpublish).toEqual(first);
  expect(afterReplay).toEqual({ ...noWrites, ledger: 1 });
});

it.each(["mismatched", "malformed"] as const)(
  "SYS-09.3 SYS-12.1 SEC-REV-02 rejects a %s workspace account header without ledger or domain writes",
  async (kind) => {
    const { actors, ids } = fixture;
    const [challengeId, revisionId, workspaceAccount] = kind === "mismatched"
      ? [ids.differentLanguage, ids.differentLanguageRevision, actors.learnerA.id]
      : [ids.differentDifficulty, ids.differentDifficultyRevision, "not-a-uuid"];
    const result = await submit("learnerB", challengeId, {
      revisionId, comments: [{ line: 1, body: "Draft from the old workspace." }],
    }, randomUUID(), workspaceAccount);
    const writes = await writesFor(challengeId);

    expect.soft(result).toMatchObject({ status: 403, body: { error: { code: "FORBIDDEN" } } });
    expect(writes).toEqual(noWrites);
  },
);

it("SYS-10.1 SEC-REV-05 explicitly grants result RPC execution only to authenticated application callers", async () => {
  const { rows } = await fixture.h.db.query(`
    select has_function_privilege('authenticated', proc.oid, 'execute') as authenticated,
      has_function_privilege('anon', proc.oid, 'execute') as anon,
      has_function_privilege('service_role', proc.oid, 'execute') as service_role,
      exists (select 1 from aclexplode(proc.proacl) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as public,
      exists (select 1 from aclexplode(proc.proacl) acl
        where acl.grantee = 'authenticated'::regrole and acl.privilege_type = 'EXECUTE') as explicit_authenticated
    from pg_proc proc where proc.oid = to_regprocedure('public.read_learner_submission(uuid)')
  `);
  expect(rows).toEqual([{
    authenticated: true, anon: false, service_role: false, public: false, explicit_authenticated: true,
  }]);
});

it("SYS-12.1 SEC-REV-05 distinguishes owner, foreign Learner, both Authors, both TAs, anonymous and absent ID at the direct read RPC", async () => {
  const { ids, actors, h } = fixture;
  const created = await submit("learnerA", ids.differentCategory, {
    revisionId: ids.differentCategoryRevision, comments: [{ line: 1, body: "Owner-only comment." }],
  }, randomUUID());
  expect(created.status).toBe(201);
  const submissionId: string = created.body.data.id;
  const read = (client: SupabaseClient, id = submissionId) =>
    client.rpc("read_learner_submission", { p_submission_id: id });

  expect(await read(actors.learnerA.client)).toMatchObject({
    error: null,
    data: { status: "ok", submission: {
      id: submissionId,
      learner: { id: actors.learnerA.id },
      comments: [expect.objectContaining({ line: 1, body: "Owner-only comment." })],
    } },
  });
  for (const caller of ["learnerB", "authorA", "authorB", "taA", "taB"] as const) {
    const result = await read(actors[caller].client);
    expect(result.error, caller).toBeNull();
    expect(result.data, caller).toEqual({ status: "forbidden" });
  }
  const anonymous = await read(h.client());
  expect(anonymous.error).not.toBeNull();
  expect(anonymous.data).toBeNull();
  expect(await read(actors.learnerA.client, ids.missing)).toMatchObject({
    error: null, data: { status: "not_found" },
  });
});
