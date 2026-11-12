// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { SubmissionView } from "@/lib/learner/submissions";
import { submissionViewSchema } from "@/lib/learner/submissions";
import { createLearnerHistoryFixture } from "./learner-history-fixture";

const mocks = vi.hoisted(() => ({ client: null as SupabaseClient | null, admin: vi.fn(), provider: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => mocks.client }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/llm/provider", () => ({ createFakeProvider: mocks.provider }));
type Fixture = Awaited<ReturnType<typeof createLearnerHistoryFixture>>;
type Actor = keyof Fixture["actors"] | "anon";
type Card = { id: string; challengeId: string; revisionId: string; title: string; learner: { id: string; displayName: string }; attemptNumber: number; submittedAt: string; gradingState: string; effectiveScore: number | null; openFlagCount: number };
const routeModule = "../../../src/app/api/v1/submissions/route.ts";
const readerModule = "../../../src/server/learner/history.ts";
const detailModule = "../../../src/server/learner/submissions.ts";
let fixture: Fixture;
beforeAll(async () => { fixture = await createLearnerHistoryFixture(); });
afterAll(async () => { await fixture?.dispose(); });
function client(actor: Actor = "learnerA") { return actor === "anon" ? fixture.h.client() : fixture.actors[actor].client; }
async function get(search = "", actor: Actor = "learnerA") {
  mocks.client = client(actor);
  const { GET } = await import(routeModule) as { GET: (request: Request) => Promise<Response> };
  return GET(new Request(`http://localhost/api/v1/submissions${search ? `?${search}` : ""}`));
}
async function list(search = "", actor: Actor = "learnerA") {
  const result = await get(search, actor);
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toMatch(/no-store/);
  const body = await result.json();
  expect(Object.keys(body)).toEqual(["data"]);
  expect(Object.keys(body.data).sort()).toEqual(["items", "nextCursor"]);
  return body.data as { items: Card[]; nextCursor: string | null };
}
async function direct(actor: Actor = "learnerA", args: Record<string, unknown> = {}) {
  // New public RPC acceptance signature: p_limit int=20, p_challenge_id uuid=null,
  // p_before timestamptz=null, p_after_id uuid=null. Owner is never an argument.
  return (client(actor).rpc as (name: string, args: Record<string, unknown>) => ReturnType<SupabaseClient["rpc"]>)("list_learner_submissions", args);
}
async function detail(id: string, actor: Actor = "learnerA") {
  mocks.client = client(actor);
  const { readLearnerSubmission } = await import(detailModule) as { readLearnerSubmission: (id: string) => Promise<{ status: string; submission?: SubmissionView }> };
  return readLearnerSubmission(id);
}
it("LRN-08.1 SYS-08 SYS-12.1 limits GET, application reader and direct RPC to self across two users per role", async () => {
  for (const owner of ["learnerA", "learnerB"] as const) {
    const http = await list("limit=50", owner);
    expect(http.items.length).toBeGreaterThan(0);
    expect(http.items.every(card => card.learner.id === fixture.actors[owner].id)).toBe(true);
    const rpc = await direct(owner, { p_limit: 50 });
    expect(rpc.error).toBeNull();
    expect(rpc.data).toMatchObject({ status: "ok", items: expect.any(Array) });
    const raw = rpc.data as unknown as { items: Card[] };
    expect(raw.items.every(card => card.learner.id === fixture.actors[owner].id)).toBe(true);
    mocks.client = client(owner);
    const { readSubmissionPage } = await import(readerModule) as { readSubmissionPage: (query: URLSearchParams) => Promise<{ status: string; page: { items: Card[] } }> };
    const read = await readSubmissionPage(new URLSearchParams("limit=50"));
    expect(read.status).toBe("ok");
    expect(read.page.items).toEqual(http.items);
  }
  for (const actor of ["authorA", "authorB", "taA", "taB", "anon"] as const) {
    const response = await get("", actor);
    expect(response.status).toBe(actor === "anon" ? 401 : 403);
    expect((await response.json()).error.code).toBe(actor === "anon" ? "UNAUTHENTICATED" : "FORBIDDEN");
    const { readSubmissionPage } = await import(readerModule) as { readSubmissionPage: (query: URLSearchParams) => Promise<{ status: string; page?: unknown }> };
    const application = await readSubmissionPage(new URLSearchParams());
    expect(application.status).not.toBe("ok");
    expect(application.page).toBeUndefined();
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
    const rpc = await direct(actor);
    if (actor === "anon") expect(rpc.error?.code).toBe("42501");
    else expect(rpc).toMatchObject({ data: { status: "forbidden" }, error: null });
  }
});
it("LRN-08.1 SYS-10 rejects forged owner/role RPC fields and does not broaden table access", async () => {
  const { actors, ids } = fixture;
  expect((await actors.authorA.client.auth.updateUser({ data: { role: "learner" } })).error).toBeNull();
  expect((await get("", "authorA")).status).toBe(403);
  expect(await direct("authorA")).toMatchObject({ data: { status: "forbidden" }, error: null });
  for (const forgery of [{ p_learner_id: actors.learnerB.id }, { p_role: "learner" }, { learnerId: actors.learnerB.id }]) expect((await direct("learnerA", forgery)).error).not.toBeNull();
  const filtered = await list(`challengeId=${ids.c2}`);
  expect(filtered.items).toEqual([]);
  expect((await get(`learnerId=${actors.learnerB.id}`)).status).toBe(400);
  for (const actor of ["learnerA", "learnerB"] as const) {
    for (const table of ["revision_answers", "revision_flaws"] as const) {
      const response = await actors[actor].client.from(table).select("*");
      expect(response.error !== null || response.data?.length === 0).toBe(true);
    }
    const cross = await actors[actor].client.from("submissions").select("id, learner_id").eq("learner_id", actors[actor === "learnerA" ? "learnerB" : "learnerA"].id);
    expect(cross.error !== null || cross.data?.length === 0).toBe(true);
  }
});
it("LRN-08.3 SYS-10.1 asserts explicit list/helper grants, security-definer configuration and denied private-helper calls", async () => {
  const { rows } = await fixture.h.db.query<{ schema: string; name: string; identity: string; definer: boolean; config: string[]; acl: { role: string; privilege: string }[] }>(`
    select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as identity,
      p.prosecdef as definer, p.proconfig as config,
      (select jsonb_agg(jsonb_build_object('role', coalesce(r.rolname, 'PUBLIC'), 'privilege', a.privilege_type))
       from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       left join pg_roles r on r.oid = a.grantee) as acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname = 'list_learner_submissions')
       or (n.nspname = 'private' and p.proname = 'learner_submission_card')`);
  expect(rows).toHaveLength(2);
  const list = rows.find(row => row.schema === "public")!;
  const helper = rows.find(row => row.schema === "private")!;
  expect(list.definer).toBe(true);
  for (const fn of rows) {
    if (fn.definer) expect(fn.config).toContain('search_path=""');
    const publicRoles = fn.acl.filter(entry => ["PUBLIC", "anon", "authenticated", "service_role"].includes(entry.role));
    expect(publicRoles).toEqual(fn.schema === "public" ? [{ role: "authenticated", privilege: "EXECUTE" }] : []);
  }
  expect(helper.identity).toContain("uuid");
  for (const role of ["anon", "authenticated", "service_role"]) {
    await fixture.h.db.query("begin");
    try {
      await fixture.h.db.query(`set local role ${role}`);
      await expect(fixture.h.db.query("select private.learner_submission_card($1::uuid)", [fixture.first])).rejects.toMatchObject({ code: "42501" });
    } finally { await fixture.h.db.query("rollback"); }
  }
  for (const role of ["anon", "service_role"]) {
    await fixture.h.db.query("begin");
    try {
      await fixture.h.db.query(`set local role ${role}`);
      await expect(fixture.h.db.query("select public.list_learner_submissions()")).rejects.toMatchObject({ code: "42501" });
    } finally { await fixture.h.db.query("rollback"); }
  }
});
it("LRN-08.3 uses default and maximum bounds and lossless submittedAt-descending/id-ascending pagination across timestamp ties", async () => {
  const first = await list();
  expect(first.items).toHaveLength(20);
  expect(first.nextCursor).not.toBeNull();
  const rawDefault = await direct();
  expect(rawDefault.error).toBeNull();
  const defaultCandidates = (rawDefault.data as unknown as { items: Card[] }).items;
  expect(defaultCandidates).toHaveLength(21);
  expect(defaultCandidates.map(card => card.id)).toEqual([...defaultCandidates].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || a.id.localeCompare(b.id)).map(card => card.id));
  const rawMax = await direct("learnerA", { p_limit: 50 });
  expect(rawMax.error).toBeNull();
  expect((rawMax.data as unknown as { items: Card[] }).items).toHaveLength(51);
  const rawTail = await direct("learnerA", { p_limit: 7, p_before: defaultCandidates[6].submittedAt, p_after_id: defaultCandidates[6].id });
  expect(rawTail.error).toBeNull();
  expect((rawTail.data as unknown as { items: Card[] }).items.map(card => card.id)).toEqual(defaultCandidates.slice(7, 15).map(card => card.id));
  for (const halfCursor of [{ p_before: fixture.time }, { p_after_id: fixture.first }]) {
    const raw = await direct("learnerA", halfCursor);
    expect(raw.error !== null || (raw.data as { status?: string })?.status === "invalid").toBe(true);
  }
  const max = await list("limit=50");
  expect(max.items).toHaveLength(50);
  expect(max.nextCursor).not.toBeNull();
  const collected: Card[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 12; page++) {
    const next = await list(`limit=7${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    expect(next.items.length).toBeLessThanOrEqual(7);
    collected.push(...next.items);
    cursor = next.nextCursor;
    if (!cursor) break;
  }
  expect(cursor).toBeNull();
  const expected = (await fixture.h.db.query<{ id: string }>("select id from public.submissions where learner_id = $1 order by submitted_at desc, id asc", [fixture.actors.learnerA.id])).rows.map(row => row.id);
  expect(collected.map(card => card.id)).toEqual(expected);
  expect(new Set(collected.map(card => card.id)).size).toBe(expected.length);
  for (const input of ["limit=0", "limit=51", "limit=1.5", "cursor=bad", "limit=1&limit=2", "unknown=x"]) expect((await get(input)).status).toBe(400);
  for (const p_limit of [0, 51, -1]) {
    const result = await direct("learnerA", { p_limit });
    expect(result.error !== null || (result.data as { status?: string })?.status === "invalid").toBe(true);
  }
});
it("LRN-08.3 preserves challenge binding on issued cursors", async () => {
  const first = await list(`limit=1&challengeId=${fixture.ids.c1}`);
  expect(first.items.map(card => card.id)).toEqual([fixture.first]);
  expect(first.nextCursor).not.toBeNull();
  const query = `cursor=${encodeURIComponent(first.nextCursor!)}`;
  expect((await get(query)).status).toBe(400);
  expect((await get(`${query}&challengeId=${fixture.ids.c2}`)).status).toBe(400);
  expect((await list(`${query}&challengeId=${fixture.ids.c1}`)).items.map(card => card.id)).toEqual([fixture.second]);
});
it("LRN-08.2 LRN-08.4 LRN-08.6 LRN-08.7 makes list and detail agree for every state, zero and latest audit-ordered moderation", async () => {
  const all = (await list("limit=50")).items;
  for (const state of ["pending", "running", "failed", "completed"]) {
    const card = all.find(card => card.gradingState === state && (state !== "completed" || card.effectiveScore === 0))!;
    expect(card).toBeDefined();
    const result = await detail(card.id);
    expect(result.status).toBe("ok");
    expect(result.submission?.grading.state).toBe(state);
    expect(card.effectiveScore).toBe(result.submission?.grading.effective?.score ?? null);
  }
  const first = all.find(card => card.id === fixture.first)!;
  expect(first).toMatchObject({ effectiveScore: 70, openFlagCount: 3, attemptNumber: 1 });
  expect(all.find(card => card.id === fixture.second)).toMatchObject({ effectiveScore: 100, attemptNumber: 2 });
  const result = (await detail(fixture.first)).submission!;
  expect(result.grading.original?.score).toBe(25);
  expect(result.grading.overrides.map(row => [row.auditOrder, row.score])).toEqual([[1, 90], [3, 70]]);
  expect(result.flags).toHaveLength(4);
  expect(result.flags.find(flag => flag.kind === "learner_report")?.resolutions.map(row => [row.auditOrder, row.disposition])).toEqual([[2, "upheld"], [4, "dismissed"]]);
});
it("LRN-08.8 SYS-12.4 preserves pinned history, original/hints/moderation and exact safe projections across republish/unpublish/archive", async () => {
  const original = (await detail(fixture.first)).submission!;
  expect(submissionViewSchema.safeParse(original).success).toBe(true);
  expect(original.challenge.code.before).toBe("");
  expect(original.challenge.code.after).toBe(fixture.checkout.flawedCode);
  const hint = original.grading.original!.eligibleHints[0].hintId;
  await fixture.publishNextRevision();
  for (const status of ["published", "unpublished", "archived"]) {
    await fixture.h.db.query("update public.challenges set status = $2 where id = $1", [fixture.ids.c1, status]);
    const cards = (await list(`challengeId=${fixture.ids.c1}`)).items;
    expect(cards.map(card => card.id)).toEqual([fixture.first, fixture.second]);
    expect(cards[0]).toMatchObject({ title: "Checkout totals", revisionId: fixture.ids.revision1, effectiveScore: 70, openFlagCount: 3 });
    expect((await detail(fixture.first)).submission).toEqual(original);
    const cached = await fixture.actors.learnerA.client.rpc("read_learner_submission_hint", { p_submission_id: fixture.first, p_hint_id: hint });
    expect(cached).toMatchObject({ error: null, data: { status: "ok", hint: { hintId: hint, text: "Consider the smallest possible basket." } } });
    for (const card of cards) expect(Object.keys(card).sort()).toEqual(["id", "challengeId", "revisionId", "title", "learner", "attemptNumber", "submittedAt", "gradingState", "effectiveScore", "openFlagCount"].sort());
    const json = JSON.stringify({ cards, original });
    for (const secret of [fixture.actors.learnerA.email, "workingCode", "realDiff", "answerKey", "Multiply price by one minus fraction."]) expect(json).not.toContain(secret);
  }
  expect(await detail(fixture.first, "learnerB")).toEqual({ status: "forbidden" });
  expect(await detail(fixture.ids.missing)).toEqual({ status: "not_found" });
});
it("LRN-08.8 SYS-10.4 keeps all history/list reads free of database writes, admin/provider calls and usage reservations", async () => {
  async function snapshot() {
    const result: Record<string, unknown> = {};
    for (const table of ["submissions", "submission_comments", "grading_runs", "ai_grades", "grade_overrides", "review_flags", "flag_resolutions"]) result[table] = (await fixture.h.db.query(`select to_jsonb(t) as row from public.${table} t order by to_jsonb(t)::text`)).rows;
    for (const table of ["llm_operations", "ai_usage_records", "llm_usage_events"]) result[table] = (await fixture.h.db.query(`select to_jsonb(t) as row from private.${table} t order by to_jsonb(t)::text`)).rows;
    return result;
  }
  const before = await snapshot();
  mocks.admin.mockClear(); mocks.provider.mockClear();
  await list(); await direct(); await detail(fixture.first);
  expect(await snapshot()).toEqual(before);
  expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
});
