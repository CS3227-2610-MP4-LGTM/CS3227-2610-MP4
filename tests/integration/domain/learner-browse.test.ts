// @vitest-environment node
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
  createAdminClient: () => { throw new Error("Learner reads must use a user-scoped client"); },
}));
vi.mock("@/server/llm/boundary", () => ({
  createLlmBoundary: () => { throw new Error("Learner reads do not call a model"); },
}));

const route = "http://localhost/api/v1/challenges";
const filters = "language=javascript&difficulty=easy&category=logic_bug";
const wrongRoles = ["authorA", "authorB", "taA", "taB"] as const;
type Fixture = Awaited<ReturnType<typeof createLearnerBrowseFixture>>;
type Caller = keyof Fixture["actors"] | "anon";
type Page = { items: { id: string }[]; nextCursor: string | null };

let fixture: Fixture;
let anon: SupabaseClient;

beforeAll(async () => {
  fixture = await createLearnerBrowseFixture({ scope: "integration" });
  anon = fixture.h.client();
});

afterAll(async () => {
  requestContext.client = null;
  await fixture?.dispose();
});

function callerClient(caller: Caller) {
  return caller === "anon" ? anon : fixture.actors[caller].client;
}

async function list(caller: Caller, query = "") {
  const { GET } = await import("@/app/api/v1/challenges/route");
  requestContext.client = callerClient(caller);
  return GET(new NextRequest(query ? `${route}?${query}` : route));
}

async function detail(caller: Caller, id: string, query = "") {
  const { GET } = await import("@/app/api/v1/challenges/[id]/route");
  requestContext.client = callerClient(caller);
  return GET(new NextRequest(`${route}/${id}${query ? `?${query}` : ""}`), { params: Promise.resolve({ id }) });
}

async function firstAttempt(caller: Caller, challengeId: string) {
  const { readFirstAttempt } = await import("@/server/learner/challenges");
  requestContext.client = callerClient(caller);
  return readFirstAttempt(challengeId);
}

async function challenge(caller: Caller, challengeId: string) {
  const { readChallenge } = await import("@/server/learner/challenges");
  requestContext.client = callerClient(caller);
  return readChallenge(challengeId);
}

async function errorResponse(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json();
  expect(body).toEqual({
    error: expect.objectContaining({ code, message: expect.stringMatching(/\S/) }),
  });
  expect(Object.keys(body.error).filter(key => !["code", "message", "fieldErrors"].includes(key))).toEqual([]);
}

async function page(response: Response): Promise<Page> {
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json();
  expect(body).toEqual({ data: { items: expect.any(Array), nextCursor: body.data?.nextCursor } });
  if (body.data.nextCursor !== null) expect(body.data.nextCursor).toEqual(expect.any(String));
  return body.data;
}

function expectedCard(challengeId: string, revisionId: string,
  publication: Fixture["checkout"], categories: string[]) {
  const { title, description, language, difficulty } = publication;
  return {
    id: challengeId, revisionId, title, description, language, difficulty, categories,
    publishedAt: expect.stringMatching(/^2026-01-01T00:00:0[01](?:\.0+)?(?:Z|\+00:00)$/),
  };
}

async function expectDetail(
  caller: Caller, id: string, revisionId: string, publication: Fixture["checkout"], categories: string[],
  publishedAt = fixture.createdAt,
) {
  const response = await detail(caller, id);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json();
  const { flawedCode, language } = publication;
  const lines = flawedCode.replace(/\n$/, "").split("\n");
  expect(body).toEqual({
    data: {
      ...expectedCard(id, revisionId, publication, categories),
      code: {
        path: language === "javascript" ? "challenge.js" : "challenge.py",
        before: "", after: flawedCode,
        hunks: [{
          oldStart: 0, oldCount: 0, newStart: 1, newCount: lines.length,
          lines: lines.map((text, index) => ({ kind: "added", text, oldLine: null, newLine: index + 1 })),
        }],
      },
    },
  });
  expect(Date.parse(body.data.publishedAt)).toBe(Date.parse(publishedAt));
}

async function asCaller<T>(caller: Caller, read: () => Promise<T>) {
  const { db } = fixture.h;
  await db.query("begin read only");
  try {
    await db.query(caller === "anon" ? "set local role anon" : "set local role authenticated");
    const id = caller === "anon" ? "" : fixture.actors[caller].id;
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
    return await read();
  } finally {
    await db.query("rollback");
  }
}

it("SYS-08.1 rejects a request without a verified user even when getSession reports a Learner", async () => {
  const session = await fixture.actors.learnerA.client.auth.getSession();
  const unverified = vi.spyOn(anon.auth, "getSession").mockResolvedValue(session);
  try {
    await errorResponse(await list("anon"), 401, "UNAUTHENTICATED");
    await errorResponse(await detail("anon", fixture.ids.c1), 401, "UNAUTHENTICATED");
    expect(await challenge("anon", fixture.ids.c1)).toEqual({ status: "unauthenticated" });
    expect(await firstAttempt("anon", fixture.ids.c1)).toEqual({ status: "unauthenticated" });
  } finally {
    unverified.mockRestore();
  }
});

it.each(wrongRoles)("SYS-08.2 rejects stored %s role at both handlers and the first-attempt read", async caller => {
  await errorResponse(await list(caller), 403, "FORBIDDEN");
  await errorResponse(await detail(caller, fixture.ids.c1), 403, "FORBIDDEN");
  expect(await challenge(caller, fixture.ids.c1)).toEqual({ status: "forbidden" });
  expect(await firstAttempt(caller, fixture.ids.c1)).toEqual({ status: "forbidden" });
});

it("SYS-11.2 rejects a verified identity with no stored profile and creates no replacement", async () => {
  const { actors, h, ids } = fixture;
  const { client, id } = actors.taB;
  expect((await client.auth.getUser()).data.user?.id).toBe(id);
  const removed = await h.db.query<{ display_name: string; role: string }>(
    "delete from public.profiles where id = $1 returning display_name, role", [id],
  );
  expect(removed.rowCount).toBe(1);
  const { display_name, role } = removed.rows[0];
  try {
    await errorResponse(await list("taB"), 403, "FORBIDDEN");
    await errorResponse(await detail("taB", ids.c1), 403, "FORBIDDEN");
    expect(await firstAttempt("taB", ids.c1)).toEqual({ status: "forbidden" });
    const profile = await h.db.query("select id from public.profiles where id = $1", [id]);
    expect(profile.rows).toEqual([]);
  } finally {
    await h.db.query(`with restored as (
      insert into public.profiles (id, display_name, role) values ($1, $2, $3) returning id, role
    ) insert into private.profile_roles (id, role) select id, role from restored`, [id, display_name, role]);
  }
});

it("SYS-11.3 editable role metadata cannot grant Learner access", async () => {
  const { client } = fixture.actors.authorB;
  const edited = await client.auth.updateUser({ data: { role: "learner" } });
  expect(edited.error).toBeNull();
  const refreshed = await client.auth.refreshSession();
  expect(refreshed.error).toBeNull();
  expect(refreshed.data.user?.user_metadata.role).toBe("learner");
  await errorResponse(await list("authorB"), 403, "FORBIDDEN");
  await errorResponse(await detail("authorB", fixture.ids.c2), 403, "FORBIDDEN");
  expect(await learnerProjection("authorB", fixture.ids.c2)).toEqual({ status: "forbidden" });
});

it.each(["auth", "profile"] as const)("SYS-11.4 both handlers fail closed during a %s outage after a successful request", async service => {
  const { client } = fixture.actors.learnerA;
  expect((await list("learnerA", "limit=1")).status).toBe(200);
  expect((await detail("learnerA", fixture.ids.c1)).status).toBe(200);
  const outage = service === "auth"
    ? vi.spyOn(client.auth, "getUser").mockRejectedValue(new Error("Fixture Auth outage"))
    : vi.spyOn(client, "from").mockImplementation(() => { throw new Error("Fixture profile outage"); });
  try {
    await errorResponse(await list("learnerA"), 503, "SERVICE_UNAVAILABLE");
    await errorResponse(await detail("learnerA", fixture.ids.c1), 503, "SERVICE_UNAVAILABLE");
    expect(await firstAttempt("learnerA", fixture.ids.c1)).toEqual({ status: "unavailable" });
  } finally {
    outage.mockRestore();
  }
});

it.each(["language=ruby", "language=python&language=javascript", "limit=0", "limit=51", "learnerId=forged", "cursor=malformed"])(
  "SYS-02.1 rejects catalogue query %s", async query => {
    await errorResponse(await list("learnerA", query), 400, "VALIDATION_ERROR");
  },
);

it("SYS-02.1 rejects invalid detail IDs and unsupported query fields", async () => {
  await errorResponse(await detail("learnerA", "not-a-uuid"), 400, "VALIDATION_ERROR");
  await errorResponse(await detail("learnerA", fixture.ids.c1, "revisionId=forged"), 400, "VALIDATION_ERROR");
});

it("LRN-01.2 returns exact live catalogue cards in published-time and challenge-ID order", async () => {
  const { ids, checkout, quotient } = fixture;
  const response = await list("learnerA", "limit=50");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json();
  expect(body).toEqual({ data: { items: expect.any(Array), nextCursor: null } });
  expect(body.data.items.map(({ id }: { id: string }) => id)).toEqual([
    ids.differentLanguage, ids.differentDifficulty, ids.differentCategory, ids.c1, ids.c2, ...ids.practice,
  ]);
  expect(body.data.items[3]).toEqual(expectedCard(ids.c1, ids.revision1, checkout, ["edge_case", "logic_bug"]));
  expect(body.data.items[4]).toEqual(expectedCard(ids.c2, ids.quotientRevision, quotient, ["error_handling"]));
});

it("LRN-01.3 applies all three filters before the limit, including a flaw category", async () => {
  const { ids } = fixture;
  const filtered = await page(await list("learnerA", `${filters}&limit=2`));
  expect(filtered.items.map(({ id }) => id)).toEqual([ids.c1, ids.practice[0]]);
  expect(filtered.nextCursor).toEqual(expect.any(String));
  const none = await list("learnerA", "language=java&difficulty=easy&category=logic_bug");
  expect(none.status).toBe(200);
  expect(await none.json()).toEqual({ data: { items: [], nextCursor: null } });
});

it("LRN-01.4 uses the default limit and walks tied timestamps without skips or duplicates", async () => {
  const { ids } = fixture;
  const expected = [ids.c1, ...ids.practice];
  const first = await page(await list("learnerA", filters));
  expect(first.items.map(({ id }) => id)).toEqual(expected.slice(0, 20));
  expect(first.nextCursor).toEqual(expect.stringMatching(/^.{1,512}$/));
  const cursor = encodeURIComponent(first.nextCursor!);
  const response = await list("learnerA", `${filters}&cursor=${cursor}`);
  expect(response.status).toBe(200);
  const last = await response.json();
  expect(last.data.items.map(({ id }: { id: string }) => id)).toEqual(expected.slice(20));
  expect(last.data.nextCursor).toBeNull();
  await errorResponse(await list("learnerA", `${filters.replace("logic_bug", "edge_case")}&cursor=${cursor}`),
    400, "VALIDATION_ERROR");
});

it("LRN-02.2 returns only the exact new-file source projection with and without a trailing LF", async () => {
  const { ids, checkout, quotient, longPublication } = fixture;
  await expectDetail("learnerA", ids.c1, ids.revision1, checkout, ["edge_case", "logic_bug"]);
  await expectDetail("learnerA", ids.c2, ids.quotientRevision, quotient, ["error_handling"]);
  await expectDetail("learnerA", ids.longSource, longPublication.revisionId, longPublication, ["logic_bug"]);
});

it("LRN-02.4 opening challenge and first-attempt reads leave a new reviewer without a submission", async () => {
  const { ids, actors, h } = fixture;
  const attempts = () => h.db.query("select id from public.submissions where learner_id = $1 and challenge_id = $2",
    [actors.learnerA.id, ids.c2]);
  expect((await attempts()).rows).toEqual([]);
  expect((await detail("learnerA", ids.c2)).status).toBe(200);
  expect(await firstAttempt("learnerA", ids.c2)).toEqual({ status: "ok", submissionId: null });
  expect((await attempts()).rows).toEqual([]);
});

it("LRN-02.5 returns the owned first attempt with a retry, pending grade, or failed grade", async () => {
  const { ids } = fixture;
  expect(await firstAttempt("learnerA", ids.c1)).toEqual({ status: "ok", submissionId: ids.firstA });
  expect(await firstAttempt("learnerB", ids.c1)).toEqual({ status: "ok", submissionId: ids.firstB });
  expect(await firstAttempt("learnerB", ids.c2)).toEqual({ status: "ok", submissionId: ids.failedB });
  expect(await firstAttempt("learnerA", ids.c2)).toEqual({ status: "ok", submissionId: null });
});

it("LRN-02.7 distinguishes absent and non-live detail when neither Learner owns a related attempt", async () => {
  const { ids } = fixture;
  for (const caller of ["learnerA", "learnerB"] as const) {
    await errorResponse(await detail(caller, ids.missing), 404, "NOT_FOUND");
    expect(await challenge(caller, ids.missing)).toEqual({ status: "not_found" });
    expect(await firstAttempt(caller, ids.missing)).toEqual({ status: "not_found" });
    for (const unavailable of [ids.draft, ids.unpublished, ids.archived]) {
      await errorResponse(await detail(caller, unavailable), 403, "FORBIDDEN");
      expect(await challenge(caller, unavailable)).toEqual({ status: "forbidden" });
      expect(await firstAttempt(caller, unavailable)).toEqual({ status: "forbidden" });
    }
  }
});

it("SYS-10.1 grants the narrow public read RPC only to authenticated sessions", async () => {
  const grants = await fixture.h.db.query(`
    select has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
      has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('service_role', p.oid, 'execute') as service_role
    from pg_proc p
    where p.oid = to_regprocedure('public.read_learner_challenge(uuid)')
  `);
  expect(grants.rows).toEqual([{ authenticated: true, anon: false, service_role: false }]);
  const denied = await anon.rpc("read_learner_challenge", { p_challenge_id: fixture.ids.c1 });
  expect(denied.data).toBeNull();
  expect(denied.error).not.toBeNull();
});

async function learnerProjection(caller: Caller, id: string) {
  const result = await callerClient(caller).rpc("read_learner_challenge", { p_challenge_id: id });
  expect(result.error).toBeNull();
  return result.data;
}

it("SYS-10.2 scopes direct RPC reads by stored role, live pointer and minimal classification", async () => {
  const { ids } = fixture;
  for (const caller of wrongRoles) {
    expect(await learnerProjection(caller, ids.c1)).toEqual({ status: "forbidden" });
    expect(await learnerProjection(caller, ids.missing)).toEqual({ status: "forbidden" });
  }
  for (const caller of ["learnerA", "learnerB"] as const) {
    expect(await learnerProjection(caller, ids.c1)).toEqual({
      status: "ok", revisionId: ids.revision1, categories: ["edge_case", "logic_bug"],
    });
    expect(await learnerProjection(caller, ids.unpublished)).toEqual({ status: "forbidden" });
    expect(await learnerProjection(caller, ids.archived)).toEqual({ status: "forbidden" });
    expect(await learnerProjection(caller, ids.draft)).toEqual({ status: "forbidden" });
    expect(await learnerProjection(caller, ids.missing)).toEqual({ status: "not_found" });
    expect(await learnerProjection(caller, ids.revision1)).toEqual({ status: "not_found" });
  }
});

it.each(["learnerA", "learnerB", "authorA", "authorB", "taA", "taB"] as const)(
  "SYS-12.1 direct scoped submissions restrict attempts for %s", async caller => {
    const { ids } = fixture;
    const result = await callerClient(caller).from("submissions").select("id")
      .in("id", [ids.firstA, ids.secondA, ids.firstB, ids.failedB]).order("id");
    expect(result.error).toBeNull();
    const expected = {
      learnerA: [ids.firstA, ids.secondA],
      learnerB: [ids.firstB, ids.failedB],
      authorA: [], authorB: [],
      taA: [ids.firstA, ids.secondA, ids.firstB, ids.failedB],
      taB: [ids.firstA, ids.secondA, ids.firstB, ids.failedB],
    };
    expect(result.data?.map(({ id }) => id)).toEqual(expected[caller]);
  },
);

it("SYS-12.1 direct Learner reads deny private tables, answer columns and joins from a readable revision", async () => {
  const { ids, h } = fixture;
  for (const caller of ["learnerA", "learnerB"] as const) {
    const client = callerClient(caller);
    const { data, error } = await client.from("challenge_revisions").select("*").eq("id", ids.revision1).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: ids.revision1, flawed_code: fixture.checkout.flawedCode });
    expect(data).not.toHaveProperty("working_code");
    expect(data).not.toHaveProperty("real_diff");
    for (const table of ["revision_answers", "revision_flaws", "flaw_hints"]) {
      const denied = await client.from(table).select("*").eq("revision_id", ids.revision1);
      expect(denied.data ?? []).toEqual([]);
    }
    const privateColumns = await client.from("revision_answers").select("working_code,real_diff").eq("revision_id", ids.revision1);
    expect(privateColumns.data ?? []).toEqual([]);
    const joined = await asCaller(caller, () => h.db.query(`
      select revision.id, answer.working_code, answer.real_diff, flaw.fix, hint.text
      from public.challenge_revisions revision
      left join public.revision_answers answer on answer.revision_id = revision.id
      left join public.revision_flaws flaw on flaw.revision_id = revision.id
      left join public.flaw_hints hint on hint.flaw_id = flaw.id
      where revision.id = $1
    `, [ids.revision1]));
    expect(joined.rows).toEqual([{ id: ids.revision1, working_code: null, real_diff: null, fix: null, text: null }]);
    const archived = await client.from("challenge_revisions").select("id").eq("id", ids.archivedRevision);
    expect(archived.data ?? []).toEqual([]);
  }
});

it("LRN-02.4 fresh reads follow the live pointer while owned first attempts retain the older revision", async () => {
  const { ids, nextCheckout, newerAt } = fixture;
  await expectDetail("learnerA", ids.c1, ids.revision1, fixture.checkout, ["edge_case", "logic_bug"]);
  await fixture.publishNextRevision();
  await expectDetail("learnerA", ids.c1, ids.revision2, nextCheckout, ["performance"], newerAt);
  expect(await learnerProjection("learnerA", ids.c1)).toEqual({
    status: "ok", revisionId: ids.revision2, categories: ["performance"],
  });
  const filtered = await page(await list("learnerA", `${filters}&limit=1`));
  expect(filtered.items.map(({ id }) => id)).toEqual([ids.practice[0]]);
  const performance = await list("learnerA", "category=performance");
  expect(performance.status).toBe(200);
  expect(await performance.json()).toEqual({
    data: { items: [expectedCard(ids.c1, ids.revision2, nextCheckout, ["performance"])], nextCursor: null },
  });
  expect(await firstAttempt("learnerA", ids.c1)).toEqual({ status: "ok", submissionId: ids.firstA });
  expect(await firstAttempt("learnerB", ids.c1)).toEqual({ status: "ok", submissionId: ids.firstB });
  const pinned = await callerClient("learnerA").from("submissions").select("revision_id").eq("id", ids.firstA).single();
  expect(pinned.error).toBeNull();
  expect(pinned.data).toEqual({ revision_id: ids.revision1 });
  const history = await callerClient("learnerA").from("challenge_revisions").select("id,flawed_code")
    .eq("id", ids.revision1).single();
  expect(history.error).toBeNull();
  expect(history.data).toEqual({ id: ids.revision1, flawed_code: fixture.checkout.flawedCode });
  const historicalAnswers = await callerClient("learnerA").from("revision_answers")
    .select("working_code,real_diff").eq("revision_id", ids.revision1);
  expect(historicalAnswers.data ?? []).toEqual([]);
});
