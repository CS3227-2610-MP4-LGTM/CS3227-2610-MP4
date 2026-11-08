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

const filters = "language=javascript&difficulty=easy&category=logic_bug";
const learners = ["learnerA", "learnerB"] as const;
const wrongRoles = ["authorA", "authorB", "taA", "taB"] as const;
let fixture: Awaited<ReturnType<typeof createLearnerBrowseFixture>>;

beforeAll(async () => {
  // Together with C1 this gives 51 matching cards, so limit=50 must paginate.
  fixture = await createLearnerBrowseFixture({ scope: "integration", pageSize: 50 });
});

afterAll(async () => {
  requestContext.client = null;
  await fixture?.dispose();
});

async function list(query: string) {
  const { GET } = await import("@/app/api/v1/challenges/route");
  requestContext.client = fixture.actors.learnerA.client;
  return GET(new NextRequest(`http://localhost/api/v1/challenges?${query}`));
}

async function expectInvalid(response: Response) {
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({
    error: expect.objectContaining({ code: "VALIDATION_ERROR", message: expect.stringMatching(/\S/) }),
  });
}

it("SYS-10.1 grants catalogue RPC execution to authenticated and denies a direct anonymous call", async () => {
  const { h } = fixture;
  const grants = await h.db.query(`
    select has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
      has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('service_role', p.oid, 'execute') as service_role
    from pg_proc p
    where p.oid = to_regprocedure(
      'public.list_learner_challenges(integer, public.challenge_language, public.challenge_difficulty, public.flaw_category, timestamptz, uuid)'
    )
  `);
  expect(grants.rows).toEqual([{ authenticated: true, anon: false, service_role: false }]);

  const result = await h.client().rpc("list_learner_challenges", { p_limit: 1 });
  expect(result.data).toBeNull();
  expect(result.error).not.toBeNull();
});

it.each(wrongRoles)("SYS-10.2 SYS-12.1 denies the direct catalogue RPC to %s", async (caller) => {
  const result = await fixture.actors[caller].client.rpc("list_learner_challenges", { p_limit: 1 });
  expect(result.error).toBeNull();
  expect(result.data).toEqual({ status: "forbidden" });
});

it.each(learners)("LRN-01.2 SYS-12.1 exposes exactly the live card fields to %s through the catalogue RPC", async (caller) => {
  const { actors, ids, checkout, quotient, createdAt } = fixture;
  const cases = [
    { id: ids.c1, revisionId: ids.revision1, publication: checkout, filter: "logic_bug", categories: ["edge_case", "logic_bug"] },
    { id: ids.c2, revisionId: ids.quotientRevision, publication: quotient, filter: "error_handling", categories: ["error_handling"] },
  ];

  for (const { id, revisionId, publication, filter, categories } of cases) {
    const { title, description, language, difficulty } = publication;
    const { data, error } = await actors[caller].client.rpc("list_learner_challenges", {
      p_limit: 1,
      p_language: language,
      p_difficulty: difficulty,
      p_category: filter,
    });
    expect(error).toBeNull();
    expect(data).toEqual({ status: "ok", items: expect.any(Array) });
    expect(data.items[0]).toEqual({
      id, revisionId, title, description, language, difficulty, categories,
      publishedAt: expect.stringMatching(/^2026-01-01T00:00:00(?:\.0+)?(?:Z|\+00:00)$/),
    });
    expect(Date.parse(data.items[0].publishedAt)).toBe(Date.parse(createdAt));
  }
});

it.each([0, 51])("SYS-02.1 LRN-01.4 rejects limit=%s through both the catalogue handler and direct RPC", async (limit) => {
  await expectInvalid(await list(`limit=${limit}`));
  const { data, error } = await fixture.actors.learnerA.client.rpc("list_learner_challenges", { p_limit: limit });
  expect(error).toBeNull();
  expect(data).toEqual({ status: "invalid" });
});

it("LRN-01.4 accepts page sizes 1 and 50 and bounds the response when more cards match", async () => {
  const expected = [fixture.ids.c1, ...fixture.ids.practice];
  for (const limit of [1, 50]) {
    const response = await list(`${filters}&limit=${limit}`);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.items.map(({ id }: { id: string }) => id)).toEqual(expected.slice(0, limit));
    expect(data.nextCursor).toEqual(expect.stringMatching(/^.{1,512}$/));
  }
});

it("LRN-01.7 REV-01 rejects a cursor after its anchor stops matching the live catalogue", async () => {
  const query = `${filters}&limit=1`;
  const first = await list(query);
  expect(first.status).toBe(200);
  const { data } = await first.json();
  expect(data.items).toEqual([expect.objectContaining({ id: fixture.ids.c1, revisionId: fixture.ids.revision1 })]);
  expect(data.nextCursor).toEqual(expect.stringMatching(/^.{1,512}$/));
  const cursorQuery = `${query}&cursor=${encodeURIComponent(data.nextCursor)}`;

  const before = await list(cursorQuery);
  expect(before.status).toBe(200);
  expect((await before.json()).data.items).toEqual([expect.objectContaining({ id: fixture.ids.practice[0] })]);

  await fixture.publishNextRevision();

  const fresh = await list(query);
  expect(fresh.status).toBe(200);
  expect((await fresh.json()).data.items).toEqual([expect.objectContaining({ id: fixture.ids.practice[0] })]);
  await expectInvalid(await list(cursorQuery));
});
