// @vitest-environment node
/// <reference types="vite/client" />
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createChallenge } from "@/app/api/v1/author/challenges/route";
import { GET as readChallenge, PATCH as editChallenge } from "@/app/api/v1/author/challenges/[id]/route";
import { POST as generateProposals } from "@/app/api/v1/author/challenges/[id]/proposals/route";
import { PATCH as decideProposal } from "@/app/api/v1/author/challenges/[id]/proposals/[proposalId]/route";
import { POST as publishChallenge } from "@/app/api/v1/author/challenges/[id]/publish/route";
import { GET as learnerChallenge } from "@/app/api/v1/challenges/[id]/route";
import { POST as submitReview } from "@/app/api/v1/challenges/[id]/submissions/route";
import { GET as learnerSubmission } from "@/app/api/v1/submissions/[id]/route";
import { GET as taSubmission } from "@/app/api/v1/ta/submissions/[id]/route";
import type { Provider } from "@/server/llm/provider";
import { envelope, proposals as fakeProposals } from "../../unit/server/llm/fixtures";
import { insert } from "../domain/fixture";
import { createAuthorFixture } from "./fixture";

const mocks = vi.hoisted(() => ({
  user: null as SupabaseClient | null, admin: vi.fn(), execute: vi.fn<Provider["execute"]>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({
  createClient: async () => { if (!mocks.user) throw new Error("Missing local caller"); return mocks.user; },
}));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/llm/provider", async original => ({
  ...await original<typeof import("@/server/llm/provider")>(), createFakeProvider: () => ({ execute: mocks.execute }),
}));

/**
 * T-23 interfaces: `POST /api/v1/author/challenges/[id]/unpublish` and `POST .../[id]/archive`, each taking
 * exactly `{ expectedRowVersion }` with an `Idempotency-Key` and returning 200 `{ data: { id, status, rowVersion } }`.
 * Lifecycle changes persist through user-scoped database functions only (SECURITY DEFINER, empty search path,
 * executable only by `authenticated`; never the admin client) and record requests in the private ledger
 * `private.author_lifecycle_requests` (RLS on, no grants, keyed by an `actor_id` column).
 */
type Fixture = Awaited<ReturnType<typeof createAuthorFixture>>;
type Caller = keyof Fixture["actors"] | "anon";
type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Action = "unpublish" | "archive";
type AuthorDraft = {
  id: string; status: string; rowVersion: number; publishedRevisionId: string | null; draftVersion: number;
  generationId: string | null; proposals: { id: string }[];
};
type Lifecycle = { id: string; status: string; rowVersion: number };
type Reply = { status: number; body: { data?: unknown; error?: { code?: string; message?: string } } };

const handlers = import.meta.glob<{ POST: Handler }>("/src/app/api/v1/author/challenges/*/{unpublish,archive}/route.ts");
const base = "http://localhost/api/v1/author/challenges";
const headers = (extra: Record<string, string> = {}) => ({ Origin: "http://localhost", "Content-Type": "application/json", ...extra });
const ledger = "private.author_lifecycle_requests";
const missing = "81a00000-0000-4000-8000-000000009997";
const hintText: Record<string, string> = {
  logic_bug: "Consider what the returned value represents at the extremes of a discount.",
  edge_case: "Consider the smallest possible basket.",
};

let f: Fixture;
let anon: SupabaseClient;
let actorIds: string[];
const created: string[] = [];

beforeAll(async () => {
  f = await createAuthorFixture("author");
  anon = f.h.client();
  actorIds = Object.values(f.actors).map(actor => actor.id);
});

beforeEach(async () => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("AI_PROVIDER", "fake");
  await clearAccounting();
  mocks.admin.mockReset().mockReturnValue(f.h.admin);
  mocks.execute.mockReset().mockImplementation(async request => {
    const usage = { inputTokens: 100, outputTokens: 50, verified: true };
    if (request.data.operation !== "generate_hints") return { output: envelope("inject_flaws", { proposals: fakeProposals }), usage };
    const flaws = request.data.payload.flaws as { key: string; category: string }[];
    return { output: envelope("generate_hints", { hints: flaws.map(flaw => ({ key: flaw.key, text: hintText[flaw.category] })) }), usage };
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

afterAll(async () => {
  mocks.user = null;
  try {
    if (f) {
      await clearAccounting();
      await removeCreatedAttempts();
    }
  } finally {
    await f?.dispose();
  }
});

async function clearAccounting() {
  await f.h.db.query("begin");
  try {
    await f.h.db.query("set local session_replication_role = replica");
    for (const table of ["llm_usage_events", "ai_usage_records", "llm_operations"]) {
      await f.h.db.query(`delete from private.${table} where account_id = any($1::uuid[])`, [actorIds]);
    }
    await f.h.db.query("commit");
  } catch (error) {
    await f.h.db.query("rollback");
    throw error;
  }
}

/** Learner attempts made on this file's challenges; the Author fixture removes the challenges themselves. */
async function removeCreatedAttempts() {
  if (!created.length) return;
  await f.h.db.query("begin");
  try {
    await f.h.db.query("set local session_replication_role = replica");
    const submissions = "select id from public.submissions where challenge_id = any($1::uuid[])";
    for (const table of ["ai_grade_assessments", "ai_grade_comment_results", "ai_grade_eligible_hints"]) {
      await f.h.db.query(`delete from public.${table} where grade_id in
        (select id from public.ai_grades where submission_id in (${submissions}))`, [created]);
    }
    await f.h.db.query(`delete from public.ai_grade_evidence where grade_id in
      (select id from public.ai_grades where submission_id in (${submissions}))`, [created]);
    for (const table of ["ai_grades", "grading_runs", "submission_comments", "review_flags"]) {
      await f.h.db.query(`delete from public.${table} where submission_id in (${submissions})`, [created]);
    }
    const { rows } = await f.h.db.query<{ table_name: string }>(`select table_name from information_schema.columns
      where table_schema = 'private' and column_name = 'challenge_id' and table_name like 'submission%'`);
    for (const { table_name } of rows) {
      await f.h.db.query(`delete from private.${JSON.stringify(table_name)} where challenge_id = any($1::uuid[])`, [created]);
    }
    await f.h.db.query("delete from public.submissions where challenge_id = any($1::uuid[])", [created]);
    await f.h.db.query("commit");
  } catch (error) {
    await f.h.db.query("rollback");
    throw error;
  }
}

function clientFor(caller: Caller) {
  return caller === "anon" ? anon : f.actors[caller].client;
}

async function respond(response: Response): Promise<Reply> {
  expect(response.headers.get("cache-control")).toContain("no-store");
  return { status: response.status, body: await response.json() };
}

async function lifecycle(caller: Caller, action: Action, id: string, body: unknown, key = randomUUID()) {
  const path = `/src/app/api/v1/author/challenges/[id]/${action}/route.ts`;
  if (!handlers[path]) throw new Error(`Missing T-23 Route Handler: ${path}`);
  const { POST } = await handlers[path]();
  mocks.user = clientFor(caller);
  return respond(await POST(new Request(`${base}/${id}/${action}`, {
    method: "POST", headers: headers({ "Idempotency-Key": key }), body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) }));
}

/** A lifecycle request with a raw body; an empty header value omits that header. */
async function rawLifecycle(caller: Caller, action: Action, id: string, body: string, extra: Record<string, string> = {}) {
  const path = `/src/app/api/v1/author/challenges/[id]/${action}/route.ts`;
  if (!handlers[path]) throw new Error(`Missing T-23 Route Handler: ${path}`);
  const { POST } = await handlers[path]();
  mocks.user = clientFor(caller);
  const all = Object.fromEntries(Object.entries(headers({ "Idempotency-Key": randomUUID(), ...extra })).filter(([, value]) => value !== ""));
  return respond(await POST(new Request(`${base}/${id}/${action}`, { method: "POST", headers: all, body }),
    { params: Promise.resolve({ id }) }));
}

/** Ledger rows for one challenge, optionally for one key. */
async function ledgerRows(challengeId: string, key?: string) {
  const { rows: [row] } = await f.h.db.query<{ count: number }>(`select count(*)::int as count from ${ledger}
    where challenge_id = $1 and ($2::uuid is null or idempotency_key = $2::uuid)`, [challengeId, key ?? null]);
  return row.count;
}

async function read(id: string): Promise<AuthorDraft> {
  mocks.user = clientFor("authorA");
  const response = await readChallenge(new Request(`${base}/${id}`), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(200);
  return (await response.json()).data;
}

async function authorCall(handler: Handler, url: string, params: Record<string, string>, method: string, body: unknown) {
  mocks.user = clientFor("authorA");
  const extra: Record<string, string> = method === "POST" ? { "Idempotency-Key": randomUUID() } : {};
  return respond(await handler(new Request(url, { method, headers: headers(extra), body: JSON.stringify(body) }),
    { params: Promise.resolve(params) }));
}

const versionsOf = (draft: Pick<AuthorDraft, "rowVersion" | "draftVersion">) =>
  ({ expectedRowVersion: draft.rowVersion, expectedDraftVersion: draft.draftVersion });

function ok<T>(reply: Reply, statuses = [200, 201]): T {
  // The body names the failure code, so an unexpected status is diagnosable from CI logs alone.
  expect(statuses, JSON.stringify(reply.body)).toContain(reply.status);
  expect(Object.keys(reply.body)).toEqual(["data"]);
  return reply.body.data as T;
}

function failed(reply: Reply, status: number, code: string | string[]) {
  expect(reply.status).toBe(status);
  expect(Object.keys(reply.body)).toEqual(["error"]);
  expect(Array.isArray(code) ? code : [code]).toContain(reply.body.error?.code);
  expect(reply.body.error?.message).toMatch(/\S/);
  expect(JSON.stringify(reply.body)).not.toMatch(/working_code|return prices\.reduce|SENTINEL|prompt/);
}

/** A fresh Author A draft created through the T-20 route. */
async function freshDraft(): Promise<AuthorDraft> {
  const reply = await authorCall(createChallenge as unknown as Handler, base, {}, "POST", {
    title: `Lifecycle draft ${randomUUID()}`, description: f.checkout.description, language: "javascript",
    difficulty: "easy", workingCode: f.checkout.source, flawCount: 2, categories: ["logic_bug", "edge_case"],
  });
  const draft = ok<AuthorDraft>(reply, [201]);
  created.push(draft.id);
  return draft;
}

/** A fresh Author A challenge published once through T-21 and T-22, with no AI usage left on the account. */
async function livePublished(): Promise<AuthorDraft> {
  let current = await freshDraft();
  current = ok<AuthorDraft>(await authorCall(generateProposals as unknown as Handler, `${base}/${current.id}/proposals`,
    { id: current.id }, "POST", versionsOf(current)));
  for (const [index, decision] of (["rejected", "approved"] as const).entries()) {
    const proposalId = current.proposals[index].id;
    current = ok<AuthorDraft>(await authorCall(decideProposal as unknown as Handler, `${base}/${current.id}/proposals/${proposalId}`,
      { id: current.id, proposalId }, "PATCH", { ...versionsOf(current), decision }));
  }
  ok(await authorCall(publishChallenge as unknown as Handler, `${base}/${current.id}/publish`, { id: current.id }, "POST",
    versionsOf(current)));
  await clearAccounting();
  return read(current.id);
}

async function unpublishedChallenge() {
  const current = await livePublished();
  ok(await lifecycle("authorA", "unpublish", current.id, { expectedRowVersion: current.rowVersion }));
  return read(current.id);
}

/** Database facts for one challenge, read through the superuser harness. */
async function stored(challengeId: string) {
  const { rows: [row] } = await f.h.db.query(`
    select c.status::text, c.row_version, c.published_revision_id, d.generation_id, d.draft_version,
      to_jsonb(d) - 'updated_at' as draft,
      (select count(*)::int from public.challenge_revisions r where r.challenge_id = c.id) as revisions,
      (select count(*)::int from public.proposal_sets s where s.challenge_id = c.id) as sets,
      (select count(*)::int from public.submissions s where s.challenge_id = c.id) as submissions
    from public.challenges c join public.challenge_drafts d on d.challenge_id = c.id where c.id = $1`, [challengeId]);
  return row as {
    status: string; row_version: number; published_revision_id: string | null; generation_id: string | null;
    draft_version: number; draft: Record<string, unknown>; revisions: number; sets: number; submissions: number;
  };
}

/** Every stored value of one revision and its pinned attempts. */
async function revisionRecord(revisionId: string) {
  const { rows: [row] } = await f.h.db.query(`select
    (select to_jsonb(r) from public.challenge_revisions r where r.id = $1) as revision,
    (select to_jsonb(a) from public.revision_answers a where a.revision_id = $1) as answers,
    (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.revision_flaws x where x.revision_id = $1) as flaws,
    (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.flaw_hints x where x.revision_id = $1) as hints,
    (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.submissions s where s.revision_id = $1) as submissions,
    (select coalesce(jsonb_agg(to_jsonb(g) order by g.id), '[]'::jsonb) from public.ai_grades g
      join public.submissions s on s.id = g.submission_id where s.revision_id = $1) as grades`, [revisionId]);
  return row as Record<string, unknown>;
}

async function submit(caller: Caller, challengeId: string, revisionId: string, previousSubmissionId?: string) {
  mocks.user = clientFor(caller);
  const payload = { revisionId, comments: [{ line: 1, body: "This line looks suspicious." }],
    ...(previousSubmissionId && { previousSubmissionId }) };
  return respond(await submitReview(new NextRequest(`http://localhost/api/v1/challenges/${challengeId}/submissions`, {
    method: "POST", headers: headers({ "Idempotency-Key": randomUUID() }), body: JSON.stringify(payload),
  }), { params: Promise.resolve({ id: challengeId }) }));
}

/** Records a completed original grade for an attempt, as grading would, so a retry becomes eligible. */
async function completeGrade(submissionId: string) {
  const runId = randomUUID();
  const gradeId = randomUUID();
  await insert(f.h.db, "public.grading_runs", {
    id: runId, submission_id: submissionId, run_number: 1, state: "completed", failure_code: null, finished_at: new Date().toISOString(),
  });
  await insert(f.h.db, "public.ai_grades", {
    id: gradeId, submission_id: submissionId, score: 25, passed: false, identification_points: 0, explanation_points: 15, fix_points: 10,
  });
  await insert(f.h.db, "public.ai_grade_evidence", { grade_id: gradeId, grading_run_id: runId, provider_output_retried: false });
  // A completed grade also records every comment's result and every flaw's assessment (INTEGRATION-SPEC §5).
  const { rows: comments } = await f.h.db.query<{ id: string }>("select id from public.submission_comments where submission_id = $1", [submissionId]);
  for (const { id } of comments) {
    await insert(f.h.db, "public.ai_grade_comment_results", { grade_id: gradeId, comment_id: id, kind: "unmatched" });
  }
  const { rows: flaws } = await f.h.db.query<{ id: string }>(`select x.id from public.revision_flaws x
    join public.submissions s on s.revision_id = x.revision_id where s.id = $1`, [submissionId]);
  for (const { id } of flaws) {
    await insert(f.h.db, "public.ai_grade_assessments", { grade_id: gradeId, flaw_id: id, comment_id: null, distance: null });
  }
}

async function learnerDetail(id: string) {
  mocks.user = clientFor("learnerB");
  const response = await learnerChallenge(new NextRequest(`http://localhost/api/v1/challenges/${id}`), { params: Promise.resolve({ id }) });
  return response.status;
}

async function submissionRead(caller: Caller, submissionId: string, ta = false) {
  mocks.user = clientFor(caller);
  const handler = (ta ? taSubmission : learnerSubmission) as unknown as Handler;
  const url = ta ? `http://localhost/api/v1/ta/submissions/${submissionId}` : `http://localhost/api/v1/submissions/${submissionId}`;
  const response = await handler(new NextRequest(url), { params: Promise.resolve({ id: submissionId }) });
  return { status: response.status, body: await response.json() };
}

async function functionGrants(name: string) {
  const { rows } = await f.h.db.query<{ signature: string; prosecdef: boolean; proconfig: string[] | null }>(`
    select p.oid::regprocedure::text as signature, p.prosecdef, p.proconfig from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [name]);
  expect(rows.length).toBeGreaterThan(0);
  return Promise.all(rows.map(async row => {
    const allowed: Record<string, boolean> = {};
    for (const role of ["service_role", "authenticated", "anon"]) {
      allowed[role] = (await f.h.db.query("select has_function_privilege($1, $2, 'EXECUTE') as allowed", [role, row.signature])).rows[0].allowed;
    }
    allowed.PUBLIC = (await f.h.db.query(`select exists(select 1 from pg_proc p cross join lateral
      aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = to_regprocedure($1)
      and a.grantee = 0 and a.privilege_type = 'EXECUTE') as allowed`, [row.signature])).rows[0].allowed;
    return { ...row, allowed };
  }));
}

describe("lifecycle transitions", () => {
  it("AUT-06.4 unpublishes a published challenge once, keeping its pointer, draft, proposals and history", async () => {
    const current = await livePublished();
    const before = await stored(current.id);
    const history = await revisionRecord(current.publishedRevisionId!);
    const result = ok<Lifecycle>(await lifecycle("authorA", "unpublish", current.id, { expectedRowVersion: current.rowVersion }), [200]);
    expect(Object.keys(result).sort()).toEqual(["id", "rowVersion", "status"]);
    expect(result).toEqual({ id: current.id, status: "unpublished", rowVersion: current.rowVersion + 1 });
    expect(await stored(current.id)).toEqual({ ...before, status: "unpublished", row_version: before.row_version + 1 });
    expect(await revisionRecord(current.publishedRevisionId!)).toEqual(history);
    expect(await read(current.id)).toMatchObject({ status: "unpublished", publishedRevisionId: current.publishedRevisionId });
  });

  it.each([
    ["a draft", async () => freshDraft()],
    ["a published challenge", async () => livePublished()],
    ["an unpublished challenge", async () => unpublishedChallenge()],
  ] as const)("AUT-06.5 archives %s once, retaining its draft, proposals and revisions", async (_case, arrange) => {
    const current = await arrange();
    const before = await stored(current.id);
    const history = current.publishedRevisionId ? await revisionRecord(current.publishedRevisionId) : null;
    const result = ok<Lifecycle>(await lifecycle("authorA", "archive", current.id, { expectedRowVersion: current.rowVersion }), [200]);
    expect(result).toEqual({ id: current.id, status: "archived", rowVersion: current.rowVersion + 1 });
    expect(await stored(current.id)).toEqual({ ...before, status: "archived", row_version: before.row_version + 1 });
    if (history) expect(await revisionRecord(current.publishedRevisionId!)).toEqual(history);
  });

  it.each([
    ["unpublish a draft", "unpublish", async () => freshDraft()],
    ["unpublish an unpublished challenge", "unpublish", async () => unpublishedChallenge()],
    ["unpublish an archived challenge", "unpublish", async () => {
      const current = await livePublished();
      ok(await lifecycle("authorA", "archive", current.id, { expectedRowVersion: current.rowVersion }));
      return read(current.id);
    }],
    ["archive an archived challenge with a new key", "archive", async () => {
      const current = await freshDraft();
      ok(await lifecycle("authorA", "archive", current.id, { expectedRowVersion: current.rowVersion }));
      return read(current.id);
    }],
  ] as const)("AUT-06.4 AUT-06.5 refuses to %s with 409 INVALID_STATE and no change", async (_case, action, arrange) => {
    const current = await arrange();
    const before = await stored(current.id);
    failed(await lifecycle("authorA", action, current.id, { expectedRowVersion: current.rowVersion }), 409, "INVALID_STATE");
    expect(await stored(current.id)).toEqual(before);
  });

  it.each(["unpublish", "archive"] as const)("AUT-06.6 a stale expected row version on %s conflicts without overwriting newer state", async action => {
    const current = await livePublished();
    const before = await stored(current.id);
    failed(await lifecycle("authorA", action, current.id, { expectedRowVersion: current.rowVersion - 1 }), 409, "VERSION_CONFLICT");
    expect(await stored(current.id)).toEqual(before);
  });

  it.each([
    ["authorB", 403, "FORBIDDEN"],
    ["learnerA", 403, "FORBIDDEN"],
    ["taA", 403, "FORBIDDEN"],
    ["anon", 401, "UNAUTHENTICATED"],
  ] as const)("SYS-08.2 SYS-12.1 %s cannot change Author A's challenge lifecycle", async (caller, status, code) => {
    const current = await livePublished();
    const before = await stored(current.id);
    for (const action of ["unpublish", "archive"] as const) {
      failed(await lifecycle(caller, action, current.id, { expectedRowVersion: current.rowVersion }), status, code);
    }
    expect(await stored(current.id)).toEqual(before);
  });

  it("SYS-12.1 a missing challenge returns 404 for both actions", async () => {
    for (const action of ["unpublish", "archive"] as const) {
      failed(await lifecycle("authorA", action, missing, { expectedRowVersion: 1 }), 404, "NOT_FOUND");
    }
  });
});

describe("idempotency", () => {
  it.each(["unpublish", "archive"] as const)("AUT-06.6 a replayed %s returns the recorded result and changes state once", async action => {
    const current = await livePublished();
    const key = randomUUID();
    const body = { expectedRowVersion: current.rowVersion };
    const first = ok<Lifecycle>(await lifecycle("authorA", action, current.id, body, key), [200]);
    const replay = ok<Lifecycle>(await lifecycle("authorA", action, current.id, body, key), [200]);
    expect(replay).toEqual(first);
    expect((await stored(current.id)).row_version).toBe(current.rowVersion + 1);
  });

  it("AUT-06.6 a reused key with a different body returns 409 IDEMPOTENCY_CONFLICT without a change", async () => {
    const current = await livePublished();
    const key = randomUUID();
    ok(await lifecycle("authorA", "unpublish", current.id, { expectedRowVersion: current.rowVersion }, key));
    const before = await stored(current.id);
    failed(await lifecycle("authorA", "unpublish", current.id, { expectedRowVersion: current.rowVersion + 1 }, key), 409,
      "IDEMPOTENCY_CONFLICT");
    expect(await stored(current.id)).toEqual(before);
  });

  it("AUT-06.6 concurrent duplicates execute once", async () => {
    const current = await livePublished();
    const key = randomUUID();
    const body = { expectedRowVersion: current.rowVersion };
    const replies = await Promise.all([1, 2, 3].map(() => lifecycle("authorA", "archive", current.id, body, key)));
    for (const reply of replies) {
      if (reply.status === 200) expect(reply.body.data).toEqual({ id: current.id, status: "archived", rowVersion: current.rowVersion + 1 });
      else failed(reply, 409, "INVALID_STATE");
    }
    expect(replies.some(reply => reply.status === 200)).toBe(true);
    expect(await stored(current.id)).toMatchObject({ status: "archived", row_version: current.rowVersion + 1 });
  });

  it("AUT-06.6 a replay after a confirmed failure returns the same failure; a new key with current values succeeds", async () => {
    const current = await livePublished();
    const key = randomUUID();
    const stale = { expectedRowVersion: current.rowVersion - 1 };
    failed(await lifecycle("authorA", "unpublish", current.id, stale, key), 409, "VERSION_CONFLICT");
    failed(await lifecycle("authorA", "unpublish", current.id, stale, key), 409, "VERSION_CONFLICT");
    ok(await lifecycle("authorA", "unpublish", current.id, { expectedRowVersion: current.rowVersion }));
    expect((await stored(current.id)).status).toBe("unpublished");
  });

  // INTEGRATION-SPEC §3: failed operations record failure, so a replay returns it instead of re-evaluating.
  it("AUT-06.6 a replayed INVALID_STATE stays INVALID_STATE after the challenge moves on, and is recorded", async () => {
    const current = await unpublishedChallenge();
    const key = randomUUID();
    const body = { expectedRowVersion: current.rowVersion };
    failed(await lifecycle("authorA", "unpublish", current.id, body, key), 409, "INVALID_STATE");
    expect(await ledgerRows(current.id, key)).toBe(1);
    ok(await lifecycle("authorA", "archive", current.id, body));
    const before = await stored(current.id);
    failed(await lifecycle("authorA", "unpublish", current.id, body, key), 409, "INVALID_STATE");
    expect(await stored(current.id)).toEqual(before);
  });

  it("AUT-06.6 a replayed VERSION_CONFLICT never applies once the row version catches up", async () => {
    const current = await livePublished();
    const key = randomUUID();
    const ahead = { expectedRowVersion: current.rowVersion + 1 };
    failed(await lifecycle("authorA", "archive", current.id, ahead, key), 409, "VERSION_CONFLICT");
    expect(await ledgerRows(current.id, key)).toBe(1);
    // A separate unpublish moves the challenge to exactly the version the failed request expected.
    ok(await lifecycle("authorA", "unpublish", current.id, { expectedRowVersion: current.rowVersion }));
    const before = await stored(current.id);
    expect(before).toMatchObject({ status: "unpublished", row_version: current.rowVersion + 1 });
    failed(await lifecycle("authorA", "archive", current.id, ahead, key), 409, "VERSION_CONFLICT");
    failed(await lifecycle("authorA", "archive", current.id, { expectedRowVersion: current.rowVersion + 2 }, key), 409,
      "IDEMPOTENCY_CONFLICT");
    expect(await stored(current.id)).toEqual(before);
  });
});

describe("request validation", () => {
  const invalidRequests: [string, (rowVersion: number) => { body: string; extra: Record<string, string> }, number, string][] = [
    ["an unknown field", rv => ({ body: JSON.stringify({ expectedRowVersion: rv, note: "x" }), extra: {} }), 400, "VALIDATION_ERROR"],
    ["a client-supplied status", rv => ({ body: JSON.stringify({ expectedRowVersion: rv, status: "archived" }), extra: {} }), 400, "VALIDATION_ERROR"],
    ["an expectedDraftVersion", rv => ({ body: JSON.stringify({ expectedRowVersion: rv, expectedDraftVersion: 1 }), extra: {} }), 400, "VALIDATION_ERROR"],
    ["a string row version", rv => ({ body: JSON.stringify({ expectedRowVersion: String(rv) }), extra: {} }), 400, "VALIDATION_ERROR"],
    ["a zero row version", () => ({ body: JSON.stringify({ expectedRowVersion: 0 }), extra: {} }), 400, "VALIDATION_ERROR"],
    ["malformed JSON", () => ({ body: "{\"expectedRowVersion\":", extra: {} }), 400, "VALIDATION_ERROR"],
    ["a missing Idempotency-Key", rv => ({ body: JSON.stringify({ expectedRowVersion: rv }), extra: { "Idempotency-Key": "" } }), 400, "VALIDATION_ERROR"],
    ["a malformed Idempotency-Key", rv => ({ body: JSON.stringify({ expectedRowVersion: rv }), extra: { "Idempotency-Key": "not-a-uuid" } }), 400, "VALIDATION_ERROR"],
    ["a body over 128 KiB", rv => ({ body: JSON.stringify({ expectedRowVersion: rv, padding: "a".repeat(128 * 1024) }), extra: {} }), 413, "PAYLOAD_TOO_LARGE"],
  ];

  // Every case must leave it untouched, so one published challenge serves them all.
  let shared: Promise<AuthorDraft> | undefined;
  for (const action of ["unpublish", "archive"] as const) {
    it.each(invalidRequests)(`SYS-02.1 AUT-06.6 ${action} with %s is rejected through the route without a change`, async (_case, build, status, code) => {
      const current = await (shared ??= livePublished());
      const { body, extra } = build(current.rowVersion);
      const before = await stored(current.id);
      failed(await rawLifecycle("authorA", action, current.id, body, extra), status, code);
      expect(await stored(current.id)).toEqual(before);
      expect(await ledgerRows(current.id)).toBe(0);
    });
  }
});

describe("learners and history", () => {
  it.each(["unpublish", "archive"] as const)("AUT-06.7 SYS-12.1 after %s no attempt starts, while committed attempts keep their evidence", async action => {
    const current = await livePublished();
    const revisionId = current.publishedRevisionId!;
    expect(await learnerDetail(current.id)).toBe(200);
    const first = ok<{ id: string }>(await submit("learnerA", current.id, revisionId), [201]);
    await completeGrade(first.id);
    const history = await revisionRecord(revisionId);

    ok(await lifecycle("authorA", action, current.id, { expectedRowVersion: current.rowVersion }));

    expect(await learnerDetail(current.id)).not.toBe(200);
    failed(await submit("learnerB", current.id, revisionId), 409, "INVALID_STATE");
    failed(await submit("learnerA", current.id, revisionId, first.id), 409, "INVALID_STATE");
    expect((await stored(current.id)).submissions).toBe(1);
    expect(await revisionRecord(revisionId)).toEqual(history);

    // The committed attempt stays readable by its Learner and TAs, pinned to its revision.
    const own = await submissionRead("learnerA", first.id);
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({ id: first.id, revisionId });
    expect((await submissionRead("taA", first.id, true)).status).toBe(200);
    // Authors gain no access to learner submissions or grades.
    expect((await submissionRead("authorA", first.id)).status).toBeGreaterThanOrEqual(400);
    expect((await submissionRead("authorA", first.id, true)).status).toBeGreaterThanOrEqual(400);
    const { data } = await f.actors.authorA.client.from("submissions").select("id").eq("id", first.id);
    expect(data ?? []).toEqual([]);
  });

  it("AUT-06.7 an unpublish racing a first attempt has one committed order", async () => {
    const current = await livePublished();
    const revisionId = current.publishedRevisionId!;
    const [attempt, change] = await Promise.all([
      submit("learnerB", current.id, revisionId),
      lifecycle("authorA", "unpublish", current.id, { expectedRowVersion: current.rowVersion }),
    ]);
    ok(change, [200]);
    const after = await stored(current.id);
    if (attempt.status === 201) {
      // The attempt committed first: it is kept and pinned to the live revision.
      expect(after.submissions).toBe(1);
      expect((attempt.body.data as { revisionId: string }).revisionId).toBe(revisionId);
    } else {
      failed(attempt, 409, "INVALID_STATE");
      expect(after.submissions).toBe(0);
    }
    // Once the unpublish has committed, no further attempt starts.
    failed(await submit("learnerA", current.id, revisionId), 409, "INVALID_STATE");
  });
});

describe("after a lifecycle change", () => {
  it("AUT-06.4 AUT-05.7 an unpublished challenge can be edited and published as a new live revision", async () => {
    const current = await unpublishedChallenge();
    const first = current.publishedRevisionId!;
    let draft = ok<AuthorDraft>(await authorCall(editChallenge as unknown as Handler, `${base}/${current.id}`, { id: current.id }, "PATCH",
      { ...versionsOf(current), title: "Edited after unpublishing" }));
    draft = ok<AuthorDraft>(await authorCall(generateProposals as unknown as Handler, `${base}/${draft.id}/proposals`,
      { id: draft.id }, "POST", versionsOf(draft)));
    for (const [index, decision] of (["approved", "rejected"] as const).entries()) {
      const proposalId = draft.proposals[index].id;
      draft = ok<AuthorDraft>(await authorCall(decideProposal as unknown as Handler, `${base}/${draft.id}/proposals/${proposalId}`,
        { id: draft.id, proposalId }, "PATCH", { ...versionsOf(draft), decision }));
    }
    ok(await authorCall(publishChallenge as unknown as Handler, `${base}/${draft.id}/publish`, { id: draft.id }, "POST", versionsOf(draft)));
    const after = await stored(current.id);
    expect(after).toMatchObject({ status: "published", revisions: 2 });
    expect(after.published_revision_id).not.toBe(first);
    expect(await learnerDetail(current.id)).toBe(200);
  });

  it("AUT-06.5 AUT-05.7 an archived challenge refuses edits, generation, decisions and publication", async () => {
    const current = await livePublished();
    ok(await lifecycle("authorA", "archive", current.id, { expectedRowVersion: current.rowVersion }));
    const archived = await read(current.id);
    const before = await stored(current.id);
    failed(await authorCall(editChallenge as unknown as Handler, `${base}/${archived.id}`, { id: archived.id }, "PATCH",
      { ...versionsOf(archived), title: "Edited after archiving" }), 409, "INVALID_STATE");
    failed(await authorCall(generateProposals as unknown as Handler, `${base}/${archived.id}/proposals`, { id: archived.id }, "POST",
      versionsOf(archived)), 409, "INVALID_STATE");
    const proposalId = archived.proposals[0]?.id ?? randomUUID();
    failed(await authorCall(decideProposal as unknown as Handler, `${base}/${archived.id}/proposals/${proposalId}`,
      { id: archived.id, proposalId }, "PATCH", { ...versionsOf(archived), decision: "approved" }), 409, "INVALID_STATE");
    failed(await authorCall(publishChallenge as unknown as Handler, `${base}/${archived.id}/publish`, { id: archived.id }, "POST",
      versionsOf(archived)), 409, "INVALID_STATE");
    expect(await stored(current.id)).toEqual(before);
    expect(mocks.execute).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ operation: "generate_hints" }) }));
  });
});

describe("database boundary", () => {
  it("SYS-10.1 SYS-10.2 lifecycle changes use only user-scoped functions, never the admin client", async () => {
    const current = await livePublished();
    mocks.admin.mockClear();
    const rpc = vi.spyOn(f.actors.authorA.client, "rpc");
    ok(await lifecycle("authorA", "unpublish", current.id, { expectedRowVersion: current.rowVersion }));
    ok(await lifecycle("authorA", "archive", current.id, { expectedRowVersion: current.rowVersion + 1 }));
    expect(mocks.admin).not.toHaveBeenCalled();
    const names = [...new Set(rpc.mock.calls.map(([name]) => name as string))];
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      for (const fn of await functionGrants(name)) {
        expect(fn.prosecdef).toBe(true);
        expect(fn.proconfig).toEqual(expect.arrayContaining(['search_path=""']));
        expect(fn.allowed).toEqual({ service_role: false, authenticated: true, anon: false, PUBLIC: false });
      }
    }
  });

  it("SYS-10.2 SYS-12.1 another Author or a Learner calling the lifecycle function directly cannot change the challenge", async () => {
    const current = await livePublished();
    const rpc = vi.spyOn(f.actors.authorA.client, "rpc");
    const probe = await livePublished();
    ok(await lifecycle("authorA", "unpublish", probe.id, { expectedRowVersion: probe.rowVersion }));
    const [name, args] = rpc.mock.calls.find(([, called]) => JSON.stringify(called).includes(probe.id))!;
    // The same call Author A's route made, pointed at another of Author A's challenges.
    const forged = JSON.parse(JSON.stringify(args).replaceAll(probe.id, current.id));
    const before = await stored(current.id);
    for (const caller of ["authorB", "learnerA", "taA"] as const) {
      const result = await f.actors[caller].client.rpc(name as never, forged as never);
      expect(result.error !== null || (result.data as { status?: string })?.status !== "ok").toBe(true);
    }
    expect((await anon.rpc(name as never, forged as never)).error).not.toBeNull();
    expect(await stored(current.id)).toEqual(before);
  });

  it("SYS-10.2 SYS-02.1 the owning Author calling the lifecycle function directly with an invalid payload changes nothing", async () => {
    const probe = await livePublished();
    const rpc = vi.spyOn(f.actors.authorA.client, "rpc");
    ok(await lifecycle("authorA", "unpublish", probe.id, { expectedRowVersion: probe.rowVersion }));
    const [name, args] = rpc.mock.calls.find(([, called]) => JSON.stringify(called).includes(probe.id))!;
    const entries = Object.entries(args as Record<string, unknown>);
    const argFor = (match: (value: unknown) => boolean) => entries.find(([, value]) => match(value))![0];
    const idArg = argFor(value => value === probe.id);
    const actionArg = argFor(value => value === "unpublish");
    const payloadArg = argFor(value => typeof value === "object" && value !== null);
    const keyArg = entries.find(([arg]) => ![idArg, actionArg, payloadArg].includes(arg))![0];

    const current = await livePublished();
    const rv = current.rowVersion;
    const cases: [string, Record<string, unknown>][] = [
      ["an empty payload", { [payloadArg]: {} }],
      ["an extra key", { [payloadArg]: { expectedRowVersion: rv, status: "archived" } }],
      ["an expectedDraftVersion", { [payloadArg]: { expectedRowVersion: rv, expectedDraftVersion: 1 } }],
      ["a string row version", { [payloadArg]: { expectedRowVersion: String(rv) } }],
      ["a null row version", { [payloadArg]: { expectedRowVersion: null } }],
      ["a zero row version", { [payloadArg]: { expectedRowVersion: 0 } }],
      ["a negative row version", { [payloadArg]: { expectedRowVersion: -rv } }],
      ["a fractional row version", { [payloadArg]: { expectedRowVersion: rv + 0.5 } }],
      ["an out-of-range row version", { [payloadArg]: { expectedRowVersion: 2_147_483_648 } }],
      ["an array payload", { [payloadArg]: [rv] }],
      ["a null payload", { [payloadArg]: null }],
      ["an unknown action", { [actionArg]: "delete" }],
      ["a null action", { [actionArg]: null }],
      ["a null key", { [keyArg]: null }],
    ];
    const before = await stored(current.id);
    for (const [label, change] of cases) {
      const call = { [idArg]: current.id, [actionArg]: "unpublish", [keyArg]: randomUUID(), [payloadArg]: { expectedRowVersion: rv }, ...change };
      const result = await f.actors.authorA.client.rpc(name as never, call as never);
      expect({ label, rejected: result.error !== null || (result.data as { status?: string })?.status === "invalid" })
        .toEqual({ label, rejected: true });
    }
    expect(await stored(current.id)).toEqual(before);
    expect(await ledgerRows(current.id)).toBe(0);
  });

  it("SYS-10.1 the private lifecycle request ledger is unreachable by every API role", async () => {
    const { rows: [table] } = await f.h.db.query("select c.relrowsecurity from pg_class c where c.oid = to_regclass($1)", [ledger]);
    expect(table?.relrowsecurity).toBe(true);
    const { rows: columns } = await f.h.db.query(`select column_name from information_schema.columns
      where table_schema = 'private' and table_name = 'author_lifecycle_requests' and column_name = 'actor_id'`);
    expect(columns).toHaveLength(1);
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
        const { rows: [row] } = await f.h.db.query("select has_table_privilege($1, $2, $3) as allowed", [role, ledger, privilege]);
        expect({ role, privilege, allowed: row.allowed }).toEqual({ role, privilege, allowed: false });
      }
    }
  });

  it("SYS-10.2 SYS-12.1 Authors still cannot write lifecycle fields directly", async () => {
    const current = await livePublished();
    const before = await stored(current.id);
    const client = f.actors.authorA.client;
    await client.from("challenges").update({ status: "archived" }).eq("id", current.id);
    await client.from("challenges").update({ status: "unpublished", row_version: current.rowVersion + 5 }).eq("id", current.id);
    await client.from("challenges").update({ published_revision_id: null }).eq("id", current.id);
    expect(await stored(current.id)).toEqual(before);
  });
});
