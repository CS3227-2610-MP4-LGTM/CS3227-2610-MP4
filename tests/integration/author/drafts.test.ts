// @vitest-environment node
/// <reference types="vite/client" />
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthorFixture } from "./fixture";

const requestContext = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({
  createClient: async () => {
    if (!requestContext.client) throw new Error("Missing test request context");
    return requestContext.client;
  },
}));
vi.mock("@/server/supabase/admin", () => ({
  createAdminClient: () => { throw new Error("Author drafts must use a user-scoped client"); },
}));
vi.mock("@/server/llm/boundary", () => ({
  createLlmBoundary: () => { throw new Error("Author drafts make no LLM request"); },
}));

type Fixture = Awaited<ReturnType<typeof createAuthorFixture>>;
type Caller = keyof Fixture["actors"] | "anon";
type Context = { params: Promise<{ id: string }> };
type CollectionRoute = { GET: (request: Request) => Promise<Response>; POST: (request: Request) => Promise<Response> };
type ItemRoute = {
  GET: (request: Request, context: Context) => Promise<Response>;
  PATCH: (request: Request, context: Context) => Promise<Response>;
};
type AuthorDraft = {
  id: string; status: string; rowVersion: number; publishedRevisionId: string | null; draftVersion: number;
  title: string; description: string; language: string; difficulty: string; workingCode: string;
  flawCount: number; categories: string[]; generationId: string | null;
  proposals: { id: string; decision: string; category: string }[];
};
type Card = { id: string; status: string; title: string; language: string; difficulty: string; createdAt: string };

const collectionPath = "/src/app/api/v1/author/challenges/route.ts";
const itemPath = "/src/app/api/v1/author/challenges/[id]/route.ts";
const collections = import.meta.glob<CollectionRoute>("/src/app/api/v1/author/challenges/route.ts");
const items = import.meta.glob<ItemRoute>("/src/app/api/v1/author/challenges/*/route.ts");
const draftKeys = [
  "categories", "description", "difficulty", "draftVersion", "flawCount", "generationId", "id", "language",
  "proposals", "publishedRevisionId", "rowVersion", "status", "title", "workingCode",
];
const cardKeys = ["createdAt", "difficulty", "id", "language", "status", "title"];
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const missing = "81a00000-0000-4000-8000-000000009999";

let fixture: Fixture;
let anon: SupabaseClient;

beforeAll(async () => {
  fixture = await createAuthorFixture("author");
  anon = fixture.h.client();
});

afterAll(async () => {
  requestContext.client = null;
  await fixture?.dispose();
});

function clientFor(caller: Caller) {
  return caller === "anon" ? anon : fixture.actors[caller].client;
}

function input(title = `Draft ${randomUUID()}`) {
  return {
    title,
    description: "Review the basket total helper.",
    language: "typescript",
    difficulty: "medium",
    workingCode: "export function total(items: number[]) {\r\n  return items.reduce((sum, item) => sum + item, 0);\r\n}\r\n",
    flawCount: 2,
    categories: ["edge_case", "performance"],
  };
}

async function collection() {
  if (!collections[collectionPath]) throw new Error(`Missing T-20 Route Handler: ${collectionPath}`);
  return collections[collectionPath]();
}

async function item() {
  if (!items[itemPath]) throw new Error(`Missing T-20 Route Handler: ${itemPath}`);
  return items[itemPath]();
}

async function post(caller: Caller, body: unknown, key: string = randomUUID()) {
  const { POST } = await collection();
  requestContext.client = clientFor(caller);
  return POST(new NextRequest("http://localhost/api/v1/author/challenges", {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body),
  }));
}

async function getList(caller: Caller, query = "") {
  const { GET } = await collection();
  requestContext.client = clientFor(caller);
  return GET(new NextRequest(`http://localhost/api/v1/author/challenges${query}`));
}

async function getDraft(caller: Caller, id: string) {
  const { GET } = await item();
  requestContext.client = clientFor(caller);
  return GET(new NextRequest(`http://localhost/api/v1/author/challenges/${id}`), { params: Promise.resolve({ id }) });
}

async function patch(caller: Caller, id: string, body: unknown) {
  const { PATCH } = await item();
  requestContext.client = clientFor(caller);
  return PATCH(new NextRequest(`http://localhost/api/v1/author/challenges/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

async function data<T>(response: Response, status = 200): Promise<T> {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const payload = await response.json();
  expect(Object.keys(payload)).toEqual(["data"]);
  return payload.data;
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const payload = await response.json();
  expect(payload).toEqual({ error: expect.objectContaining({ code, message: expect.stringMatching(/\S/) }) });
  // Errors never echo stored or submitted code or database column names.
  expect(JSON.stringify(payload)).not.toMatch(/working_code|function total|const a = 1/);
}

async function created(caller: Caller, title?: string) {
  return data<AuthorDraft>(await post(caller, input(title)), 201);
}

async function stored(challengeId: string) {
  const { rows: [row] } = await fixture.h.db.query(`
    select c.author_id, c.status, c.row_version, c.published_revision_id, d.title, d.description, d.working_code,
      d.flaw_count, d.categories::text[] as categories, d.difficulty::text as difficulty, d.generation_id, d.draft_version
    from public.challenges c join public.challenge_drafts d on d.challenge_id = c.id where c.id = $1
  `, [challengeId]);
  return row;
}

async function challengesTitled(title: string) {
  return (await fixture.h.db.query<{ id: string; author_id: string }>(`
    select c.id, c.author_id from public.challenges c join public.challenge_drafts d on d.challenge_id = c.id
    where d.title = $1 order by c.id
  `, [title])).rows;
}

async function authorRowCount() {
  const { rows: [row] } = await fixture.h.db.query<{ count: string }>(`
    select count(*) from public.challenges where author_id = any($1::uuid[])
  `, [Object.values(fixture.actors).map(actor => actor.id)]);
  return Number(row.count);
}

describe("database boundary", () => {
  it("SYS-10.1 SYS-10.2 grants Author write functions only to authenticated callers and keeps Author tables free of direct writes", async () => {
    const functions = await fixture.h.db.query(`
      select signature,
        p.oid is not null as present,
        coalesce(has_function_privilege('authenticated', p.oid, 'execute'), false) as authenticated,
        coalesce(has_function_privilege('anon', p.oid, 'execute'), false) as anon,
        coalesce(has_function_privilege('service_role', p.oid, 'execute'), false) as service_role,
        exists (select 1 from aclexplode(p.proacl) acl where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as public,
        exists (select 1 from aclexplode(p.proacl) acl where acl.grantee = 'authenticated'::regrole
          and acl.privilege_type = 'EXECUTE') as explicit_authenticated
      from unnest(array['public.create_author_challenge(uuid,jsonb)', 'public.update_author_draft(uuid,jsonb)']) as signature
      left join pg_proc p on p.oid = to_regprocedure(signature)
      order by signature
    `);
    expect(functions.rows).toEqual(["public.create_author_challenge(uuid,jsonb)", "public.update_author_draft(uuid,jsonb)"].map(signature => ({
      signature, present: true, authenticated: true, anon: false, service_role: false, public: false, explicit_authenticated: true,
    })));
    const tables = await fixture.h.db.query(`
      select relname,
        exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) as app_role(name)
          where has_table_privilege(app_role.name, c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE')
            or has_any_column_privilege(app_role.name, c.oid, 'INSERT, UPDATE')) as writable
      from pg_class c
      where c.oid in ('public.challenges'::regclass, 'public.challenge_drafts'::regclass, 'public.proposal_sets'::regclass,
        'public.proposals'::regclass, 'public.proposal_decisions'::regclass)
      order by relname
    `);
    expect(tables.rows.map(row => [row.relname, row.writable])).toEqual([
      ["challenge_drafts", false], ["challenges", false], ["proposal_decisions", false], ["proposal_sets", false], ["proposals", false],
    ]);
  });

  it("SYS-12.1 SYS-10.2 direct user-scoped table writes cannot create or change Author material", async () => {
    const { authorA } = fixture.actors;
    const before = await stored(fixture.ids.draft);
    const forgedId = randomUUID();
    expect((await authorA.client.from("challenges").insert({ id: forgedId, author_id: authorA.id } as never)).error).not.toBeNull();
    expect((await authorA.client.from("challenge_drafts").update({ title: "Forged" } as never)
      .eq("challenge_id", fixture.ids.draft)).error).not.toBeNull();
    expect((await authorA.client.from("challenges").update({ status: "published" } as never)
      .eq("id", fixture.ids.draft)).error).not.toBeNull();
    expect((await authorA.client.from("challenge_drafts").delete().eq("challenge_id", fixture.ids.draft)).error).not.toBeNull();
    expect(await stored(fixture.ids.draft)).toEqual(before);
    expect((await fixture.h.db.query("select 1 from public.challenges where id = $1", [forgedId])).rowCount).toBe(0);
  });

  it("SYS-12.1 other Authors, Learners, TAs and anonymous callers cannot read an Author's drafts or proposals directly", async () => {
    await fixture.activateProposalSet(fixture.ids.differentCategory);
    for (const caller of ["authorB", "learnerA", "taA", "anon"] as const) {
      const drafts = await clientFor(caller).from("challenge_drafts").select("challenge_id, working_code")
        .in("challenge_id", [fixture.ids.draft, fixture.ids.differentCategory, fixture.ids.archivedA]);
      expect(drafts.data ?? []).toEqual([]);
      const sets = await clientFor(caller).from("proposal_sets").select("id").eq("challenge_id", fixture.ids.differentCategory);
      expect(sets.data ?? []).toEqual([]);
    }
    const own = await fixture.actors.authorA.client.from("challenge_drafts").select("challenge_id").eq("challenge_id", fixture.ids.draft);
    expect(own.data).toEqual([{ challenge_id: fixture.ids.draft }]);
  });

  it("SYS-10.1 SYS-02.1 direct create calls enforce every bound and role without writing", async () => {
    const valid = { ...input(), workingCode: "const a = 1;\n" };
    const cases: [string, unknown][] = [
      ["title 121", { ...valid, title: "t".repeat(121) }],
      ["blank title", { ...valid, title: "   " }],
      ["description 4001", { ...valid, description: "d".repeat(4001) }],
      ["language", { ...valid, language: "ruby" }],
      ["difficulty", { ...valid, difficulty: "expert" }],
      ["code 20001 bytes", { ...valid, workingCode: "a".repeat(20_001) }],
      ["blank code", { ...valid, workingCode: " \n " }],
      ["count 0", { ...valid, flawCount: 0 }],
      ["count 6", { ...valid, flawCount: 6 }],
      ["count 2.5", { ...valid, flawCount: 2.5 }],
      ["no categories", { ...valid, categories: [] }],
      ["duplicate categories", { ...valid, categories: ["security", "security"] }],
      ["unknown category", { ...valid, categories: ["style"] }],
      ["unknown field", { ...valid, status: "published" }],
      ["forged author", { ...valid, authorId: fixture.actors.authorB.id }],
      ["missing field", { ...valid, title: undefined }],
      ["not an object", ["title"]],
    ];
    const before = await authorRowCount();
    for (const [, payload] of cases) {
      await fixture.actors.authorA.client.rpc("create_author_challenge" as never, { p_idempotency_key: randomUUID(), p_payload: payload } as never);
    }
    for (const caller of ["learnerA", "taA", "anon"] as const) {
      const result = await clientFor(caller).rpc("create_author_challenge" as never, { p_idempotency_key: randomUUID(), p_payload: valid } as never);
      if (caller === "anon") expect(result.error).not.toBeNull();
    }
    expect(await authorRowCount()).toBe(before);

    const title = `Direct ${randomUUID()}`;
    const multibyte = { ...valid, title, workingCode: "é".repeat(10_000) };
    await fixture.actors.authorA.client.rpc("create_author_challenge" as never, { p_idempotency_key: randomUUID(), p_payload: multibyte } as never);
    const rows = await challengesTitled(title);
    expect(rows).toEqual([{ id: expect.stringMatching(uuid), author_id: fixture.actors.authorA.id }]);
  });

  it("SYS-10.1 SYS-12.1 direct edit calls cannot change another Author's draft or bypass versions", async () => {
    const before = await stored(fixture.ids.draft);
    await fixture.actors.authorB.client.rpc("update_author_draft" as never, {
      p_challenge_id: fixture.ids.draft,
      p_payload: { expectedRowVersion: before.row_version, expectedDraftVersion: before.draft_version, title: "Taken over" },
    } as never);
    await fixture.actors.learnerA.client.rpc("update_author_draft" as never, {
      p_challenge_id: fixture.ids.draft,
      p_payload: { expectedRowVersion: before.row_version, expectedDraftVersion: before.draft_version, title: "Taken over" },
    } as never);
    await fixture.actors.authorA.client.rpc("update_author_draft" as never, {
      p_challenge_id: fixture.ids.draft, p_payload: { title: "No versions" },
    } as never);
    await fixture.actors.authorA.client.rpc("update_author_draft" as never, {
      p_challenge_id: fixture.ids.draft,
      p_payload: { expectedRowVersion: before.row_version, expectedDraftVersion: before.draft_version, title: "t".repeat(121) },
    } as never);
    await fixture.actors.authorA.client.rpc("update_author_draft" as never, {
      p_challenge_id: fixture.ids.draft,
      p_payload: { expectedRowVersion: before.row_version, expectedDraftVersion: before.draft_version, status: "published" },
    } as never);
    expect(await stored(fixture.ids.draft)).toEqual(before);
  });
});

describe("HTTP contract", () => {
  it("AUT-01.3 SYS-08.2 creates one private draft with initial versions and no proposal, revision or publication", async () => {
    const body = input();
    const draft = await data<AuthorDraft>(await post("authorA", body), 201);
    expect(Object.keys(draft).sort()).toEqual(draftKeys);
    expect(draft).toEqual({
      ...body,
      workingCode: body.workingCode.replace(/\r\n/g, "\n"),
      categories: expect.arrayContaining(body.categories),
      id: expect.stringMatching(uuid), status: "draft", rowVersion: 1, draftVersion: 1,
      publishedRevisionId: null, generationId: null, proposals: [],
    });
    const row = await stored(draft.id);
    expect(row).toMatchObject({
      author_id: fixture.actors.authorA.id, status: "draft", row_version: 1, draft_version: 1,
      published_revision_id: null, generation_id: null, working_code: body.workingCode.replace(/\r\n/g, "\n"),
    });
    const related = await fixture.h.db.query(`
      select (select count(*) from public.proposal_sets where challenge_id = $1)::int as sets,
        (select count(*) from public.challenge_revisions where challenge_id = $1)::int as revisions
    `, [draft.id]);
    expect(related.rows).toEqual([{ sets: 0, revisions: 0 }]);
  });

  it("AUT-01.3 AUT-01.5 replaying the same save returns the recorded draft and a changed payload conflicts", async () => {
    const key = randomUUID();
    const body = input();
    const first = await data<AuthorDraft>(await post("authorA", body, key), 201);
    const replay = await data<AuthorDraft>(await post("authorA", body, key), 201);
    expect(replay.id).toBe(first.id);
    expect(await challengesTitled(body.title)).toHaveLength(1);
    await expectError(await post("authorA", { ...body, description: "Changed description." }, key), 409, "IDEMPOTENCY_CONFLICT");
    expect(await challengesTitled(body.title)).toHaveLength(1);
  });

  it("AUT-01.3 concurrent duplicate saves execute once", async () => {
    const key = randomUUID();
    const body = input();
    const responses = await Promise.all([post("authorA", body, key), post("authorA", body, key), post("authorA", body, key)]);
    const ids = new Set<string>();
    for (const response of responses) {
      if (response.status === 201) ids.add((await data<AuthorDraft>(response, 201)).id);
      else await expectError(response, 409, "INVALID_STATE");
    }
    expect(ids.size).toBe(1);
    expect(await challengesTitled(body.title)).toEqual([{ id: [...ids][0], author_id: fixture.actors.authorA.id }]);
  });

  it("AUT-01.3 idempotency keys are isolated per actor", async () => {
    const key = randomUUID();
    const body = input();
    const mine = await data<AuthorDraft>(await post("authorA", body, key), 201);
    const theirs = await data<AuthorDraft>(await post("authorB", body, key), 201);
    expect(theirs.id).not.toBe(mine.id);
    expect((await challengesTitled(body.title)).map(row => row.author_id).sort())
      .toEqual([fixture.actors.authorA.id, fixture.actors.authorB.id].sort());
  });

  it("AUT-01.2 SYS-02.1 rejects invalid drafts with field errors and creates nothing", async () => {
    const before = await authorRowCount();
    const response = await post("authorA", { ...input(), title: " ", workingCode: "a".repeat(20_001) });
    await expect(response.clone().json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: { title: ["Enter a title."], workingCode: ["Working code exceeds the size limit."] },
      },
    });
    await expectError(response, 400, "VALIDATION_ERROR");
    expect(await authorRowCount()).toBe(before);
  });

  it.each([
    ["learnerA", 403, "FORBIDDEN"],
    ["taA", 403, "FORBIDDEN"],
    ["anon", 401, "UNAUTHENTICATED"],
  ] as const)("SYS-08.3 SYS-11 denies %s Author create, list and read with %i and no write", async (caller, status, code) => {
    const before = await authorRowCount();
    await expectError(await post(caller, input()), status, code);
    await expectError(await getList(caller), status, code);
    await expectError(await getDraft(caller, fixture.ids.draft), status, code);
    await expectError(await patch(caller, fixture.ids.draft, { expectedRowVersion: 1, expectedDraftVersion: 1, title: "X" }), status, code);
    expect(await authorRowCount()).toBe(before);
  });

  it("AUT-01.4 SYS-12.1 another Author is denied an existing draft with 403 and an absent one gets 404", async () => {
    const before = await stored(fixture.ids.draft);
    await expectError(await getDraft("authorB", fixture.ids.draft), 403, "FORBIDDEN");
    await expectError(await patch("authorB", fixture.ids.draft, {
      expectedRowVersion: before.row_version, expectedDraftVersion: before.draft_version, title: "Taken over",
    }), 403, "FORBIDDEN");
    expect(await stored(fixture.ids.draft)).toEqual(before);
    await expectError(await getDraft("authorA", missing), 404, "NOT_FOUND");
    await expectError(await patch("authorA", missing, { expectedRowVersion: 1, expectedDraftVersion: 1, title: "X" }), 404, "NOT_FOUND");
  });

  it("AUT-06.2 returns the owner's AuthorDraft with exact fields, its working draft and the live revision pointer", async () => {
    const draft = await data<AuthorDraft>(await getDraft("authorA", fixture.ids.c1));
    expect(Object.keys(draft).sort()).toEqual(draftKeys);
    const row = await stored(fixture.ids.c1);
    expect(draft).toEqual({
      id: fixture.ids.c1, status: "published", rowVersion: row.row_version, draftVersion: row.draft_version,
      publishedRevisionId: fixture.ids.revision1, title: "Checkout totals working draft",
      description: fixture.checkout.description, language: "javascript", difficulty: "easy",
      workingCode: fixture.checkout.source, flawCount: 2, categories: expect.arrayContaining(["logic_bug", "edge_case"]),
      generationId: null, proposals: [],
    });
  });

  it("AUT-06.2 returns the active proposal set with decisions", async () => {
    const challenge = await created("authorA");
    const { setId, proposalId } = await fixture.activateProposalSet(challenge.id);
    const draft = await data<AuthorDraft>(await getDraft("authorA", challenge.id));
    expect(draft.generationId).toBe(setId);
    expect(draft.proposals).toEqual([expect.objectContaining({ id: proposalId, decision: "pending" })]);
  });
});

describe("draft edits", () => {
  it("AUT-02.3 AUT-06.3 saves changed fields and advances both versions", async () => {
    const draft = await created("authorA");
    const saved = await data<AuthorDraft>(await patch("authorA", draft.id, {
      expectedRowVersion: 1, expectedDraftVersion: 1, flawCount: 3, categories: ["security"], difficulty: "hard",
    }));
    expect(saved).toMatchObject({
      id: draft.id, rowVersion: 2, draftVersion: 2, flawCount: 3, categories: ["security"], difficulty: "hard",
      title: draft.title, status: "draft",
    });
    expect(await stored(draft.id)).toMatchObject({ row_version: 2, draft_version: 2, flaw_count: 3, difficulty: "hard" });
    const renamed = await data<AuthorDraft>(await patch("authorA", draft.id, {
      expectedRowVersion: 2, expectedDraftVersion: 2, title: "Renamed draft", workingCode: "const b = 2;\r\n",
    }));
    expect(renamed).toMatchObject({ rowVersion: 3, draftVersion: 3, title: "Renamed draft", workingCode: "const b = 2;\n" });
  });

  it.each([
    ["row", { expectedRowVersion: 9, expectedDraftVersion: 1 }],
    ["draft", { expectedRowVersion: 1, expectedDraftVersion: 9 }],
  ])("AUT-02.5 a stale %s version returns 409 VERSION_CONFLICT without changes", async (_case, stale) => {
    const draft = await created("authorA");
    const before = await stored(draft.id);
    await expectError(await patch("authorA", draft.id, { ...stale, title: "Overwrite" }), 409, "VERSION_CONFLICT");
    expect(await stored(draft.id)).toEqual(before);
  });

  it("AUT-02.5 SYS-02.1 invalid edits return field errors without changes", async () => {
    const draft = await created("authorA");
    const before = await stored(draft.id);
    const response = await patch("authorA", draft.id, {
      expectedRowVersion: 1, expectedDraftVersion: 1, categories: ["security", "security"],
    });
    await expect(response.clone().json()).resolves.toMatchObject({
      error: { fieldErrors: { categories: ["Choose supported flaw categories without duplicates."] } },
    });
    await expectError(response, 400, "VALIDATION_ERROR");
    expect(await stored(draft.id)).toEqual(before);
  });

  it("AUT-02.4 AUT-06.3 an edit over an active proposal set clears it from the draft but keeps the historical set", async () => {
    const draft = await created("authorA");
    const { setId } = await fixture.activateProposalSet(draft.id);
    const current = await stored(draft.id);
    const saved = await data<AuthorDraft>(await patch("authorA", draft.id, {
      expectedRowVersion: current.row_version, expectedDraftVersion: current.draft_version, title: "Invalidates proposals",
    }));
    expect(saved).toMatchObject({ generationId: null, proposals: [], title: "Invalidates proposals" });
    expect((await stored(draft.id)).generation_id).toBeNull();
    expect((await fixture.h.db.query("select id from public.proposal_sets where id = $1", [setId])).rows).toEqual([{ id: setId }]);
  });

  it("AUT-02.6 archived challenges cannot be edited", async () => {
    const before = await stored(fixture.ids.archivedA);
    const read = await data<AuthorDraft>(await getDraft("authorA", fixture.ids.archivedA));
    expect(read.status).toBe("archived");
    await expectError(await patch("authorA", fixture.ids.archivedA, {
      expectedRowVersion: before.row_version, expectedDraftVersion: before.draft_version, title: "Revived",
    }), 409, "INVALID_STATE");
    expect(await stored(fixture.ids.archivedA)).toEqual(before);
  });

  it("AUT-06.3 SYS-12.4 editing a published challenge changes only its working draft", async () => {
    const before = await stored(fixture.ids.unpublished);
    const revisions = async () => (await fixture.h.db.query(
      "select id, title, description, flawed_code from public.challenge_revisions where challenge_id = $1 order by id",
      [fixture.ids.differentDifficulty],
    )).rows;
    const pinned = await revisions();
    const published = await stored(fixture.ids.differentDifficulty);
    const saved = await data<AuthorDraft>(await patch("authorA", fixture.ids.differentDifficulty, {
      expectedRowVersion: published.row_version, expectedDraftVersion: published.draft_version, description: "Edited after publication.",
    }));
    expect(saved).toMatchObject({
      status: "published", publishedRevisionId: published.published_revision_id, description: "Edited after publication.",
    });
    expect(await stored(fixture.ids.differentDifficulty)).toMatchObject({
      status: "published", published_revision_id: published.published_revision_id,
    });
    expect(await revisions()).toEqual(pinned);
    expect(await stored(fixture.ids.unpublished)).toEqual(before);
  });
});

describe("My challenges list", () => {
  async function allPages(caller: Caller, query: Record<string, string> = {}) {
    const items: Card[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 50; page++) {
      const params: URLSearchParams = new URLSearchParams({ ...query, limit: "2", ...(cursor ? { cursor } : {}) });
      const result: { items: Card[]; nextCursor: string | null } = await data(await getList(caller, `?${params}`));
      expect(result.items.length).toBeLessThanOrEqual(2);
      items.push(...result.items);
      cursor = result.nextCursor;
      if (!cursor) return items;
    }
    throw new Error("Pagination did not terminate");
  }

  it("AUT-06.1 lists only own challenges as exact AuthorChallengeCard rows, newest first then by ID", async () => {
    const items = await allPages("authorA");
    for (const card of items) expect(Object.keys(card).sort()).toEqual(cardKeys);
    const { rows } = await fixture.h.db.query<{ id: string }>(`
      select id from public.challenges where author_id = $1 order by created_at desc, id asc
    `, [fixture.actors.authorA.id]);
    expect(items.map(card => card.id)).toEqual(rows.map(row => row.id));
    expect(new Set(items.map(card => card.id)).size).toBe(items.length);
    expect(items.map(card => card.id)).not.toContain(fixture.ids.c2);
    expect(items.find(card => card.id === fixture.ids.c1)).toEqual({
      id: fixture.ids.c1, status: "published", title: "Checkout totals working draft",
      language: "javascript", difficulty: "easy", createdAt: expect.any(String),
    });
    expect(new Date(items.find(card => card.id === fixture.ids.c1)!.createdAt).toISOString()).toBe(fixture.createdAt.replace("Z", ".000Z"));
  });

  it.each(["draft", "published", "unpublished", "archived"])("AUT-06.1 filters own challenges by %s status", async (status) => {
    const items = await allPages("authorA", { status });
    const { rows } = await fixture.h.db.query<{ id: string }>(`
      select id from public.challenges where author_id = $1 and status = $2 order by created_at desc, id asc
    `, [fixture.actors.authorA.id, status]);
    expect(rows.length).toBeGreaterThan(0);
    expect(items.map(card => card.id)).toEqual(rows.map(row => row.id));
    for (const card of items) expect(card.status).toBe(status);
  });

  it("AUT-06.1 a cursor is bound to its filter and invalid cursors fail validation", async () => {
    const first = await data<{ items: Card[]; nextCursor: string | null }>(await getList("authorA", "?limit=1&status=published"));
    expect(first.nextCursor).toEqual(expect.any(String));
    await expectError(await getList("authorA", `?limit=1&status=draft&cursor=${encodeURIComponent(first.nextCursor!)}`),
      400, "VALIDATION_ERROR");
    await expectError(await getList("authorA", "?cursor=not-a-real-cursor"), 400, "VALIDATION_ERROR");
  });

  it("AUT-06.1 SYS-12.1 another Author's list never contains the first Author's challenges", async () => {
    const items = await allPages("authorB");
    const owners = await fixture.h.db.query<{ author_id: string }>(
      "select distinct author_id from public.challenges where id = any($1::uuid[])", [items.map(card => card.id)],
    );
    expect(owners.rows).toEqual([{ author_id: fixture.actors.authorB.id }]);
  });
});
