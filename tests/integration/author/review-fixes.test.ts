// @vitest-environment node
/// <reference types="vite/client" />
// Fix round 1 supplemental tests for T-20 review findings REV-01, REV-02/SEC-REV-01, REV-05 and SEC-REV-02.
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
type Context = { params: Promise<{ id: string }> };
type CollectionRoute = { POST: (request: Request) => Promise<Response> };
type ItemRoute = { PATCH: (request: Request, context: Context) => Promise<Response> };

const collectionPath = "/src/app/api/v1/author/challenges/route.ts";
const itemPath = "/src/app/api/v1/author/challenges/[id]/route.ts";
const collections = import.meta.glob<CollectionRoute>("/src/app/api/v1/author/challenges/route.ts");
const items = import.meta.glob<ItemRoute>("/src/app/api/v1/author/challenges/*/route.ts");
const appRoles = ["anon", "authenticated", "service_role"];

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

function input(title = `Draft ${randomUUID()}`) {
  return {
    title,
    description: "Review the basket total helper.",
    language: "typescript",
    difficulty: "medium",
    workingCode: "export const total = (items: number[]) => items.length;\n",
    flawCount: 2,
    categories: ["edge_case", "performance"],
  };
}

async function post(client: SupabaseClient, body: unknown) {
  if (!collections[collectionPath]) throw new Error(`Missing T-20 Route Handler: ${collectionPath}`);
  const { POST } = await collections[collectionPath]();
  requestContext.client = client;
  return POST(new NextRequest("http://localhost/api/v1/author/challenges", {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID() }, body: JSON.stringify(body),
  }));
}

async function patch(client: SupabaseClient, id: string, body: unknown) {
  if (!items[itemPath]) throw new Error(`Missing T-20 Route Handler: ${itemPath}`);
  const { PATCH } = await items[itemPath]();
  requestContext.client = client;
  return PATCH(new NextRequest(`http://localhost/api/v1/author/challenges/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const payload = await response.json();
  expect(payload).toEqual({ error: expect.objectContaining({ code, message: expect.stringMatching(/\S/) }) });
  return payload.error as { fieldErrors?: Record<string, string[]> };
}

async function stored(challengeId: string) {
  const { rows: [row] } = await fixture.h.db.query(`
    select c.author_id, c.status, c.row_version, c.published_revision_id, d.title, d.description, d.working_code,
      d.flaw_count, d.categories::text[] as categories, d.difficulty::text as difficulty, d.generation_id, d.draft_version
    from public.challenges c join public.challenge_drafts d on d.challenge_id = c.id where c.id = $1
  `, [challengeId]);
  return row;
}

async function authorRowCount() {
  const { rows: [row] } = await fixture.h.db.query<{ count: string }>(`
    select count(*) from public.challenges where author_id = any($1::uuid[])
  `, [Object.values(fixture.actors).map(actor => actor.id)]);
  return Number(row.count);
}

describe("private Author surfaces", () => {
  it("SYS-10.1 REV-02 SEC-REV-01 the create-request ledger has RLS on and no privilege for PUBLIC or any app role", async () => {
    const { rows: [ledger] } = await fixture.h.db.query(`
      select c.relrowsecurity as rls,
        exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl where acl.grantee = 0) as public,
        exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
          where acl.grantee = any(select oid from pg_roles where rolname = any($1::text[]))) as table_acl,
        exists (select 1 from pg_attribute a, aclexplode(a.attacl) acl
          where a.attrelid = c.oid and a.attacl is not null
            and (acl.grantee = 0 or acl.grantee = any(select oid from pg_roles where rolname = any($1::text[])))) as column_acl,
        exists (select 1 from unnest($1::text[]) as app_role(name)
          where has_table_privilege(app_role.name, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            or has_any_column_privilege(app_role.name, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')) as privileged
      from pg_class c where c.oid = to_regclass('private.author_challenge_create_requests')
    `, [appRoles]);
    expect(ledger).toEqual({ rls: true, public: false, table_acl: false, column_acl: false, privileged: false });
  });

  it("SYS-10.1 REV-02 SEC-REV-01 the private draft validator is executable by no app role or PUBLIC", async () => {
    const { rows: [validator] } = await fixture.h.db.query(`
      select p.oid is not null as present,
        exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as public,
        exists (select 1 from unnest($1::text[]) as app_role(name)
          where has_function_privilege(app_role.name, p.oid, 'execute')) as executable
      from (select to_regprocedure('private.valid_author_draft_fields(jsonb)') as oid) as signature
      left join pg_proc p on p.oid = signature.oid
    `, [appRoles]);
    expect(validator).toEqual({ present: true, public: false, executable: false });
  });
});

describe("direct edit calls", () => {
  it("SYS-12.1 SEC-REV-02 a TA's direct edit is refused and changes nothing", async () => {
    const before = await stored(fixture.ids.draft);
    const result = await fixture.actors.taA.client.rpc("update_author_draft" as never, {
      p_challenge_id: fixture.ids.draft,
      p_payload: { expectedRowVersion: before.row_version, expectedDraftVersion: before.draft_version, title: "Taken over" },
    } as never);
    expect(result.data).toEqual({ status: "forbidden" });
    expect(await stored(fixture.ids.draft)).toEqual(before);
  });

  it("SYS-12.1 SEC-REV-02 an anonymous direct edit errors and changes nothing", async () => {
    const before = await stored(fixture.ids.draft);
    const result = await anon.rpc("update_author_draft" as never, {
      p_challenge_id: fixture.ids.draft,
      p_payload: { expectedRowVersion: before.row_version, expectedDraftVersion: before.draft_version, title: "Taken over" },
    } as never);
    expect(result.error).not.toBeNull();
    expect(await stored(fixture.ids.draft)).toEqual(before);
  });

  it.each([
    ["row", (row: { row_version: number; draft_version: number }) => ({ expectedRowVersion: row.row_version + 1, expectedDraftVersion: row.draft_version })],
    ["draft", (row: { row_version: number; draft_version: number }) => ({ expectedRowVersion: row.row_version, expectedDraftVersion: row.draft_version + 1 })],
  ])("AUT-02.5 SEC-REV-02 the owner's direct edit with a stale %s version conflicts and changes nothing", async (_case, stale) => {
    const before = await stored(fixture.ids.draft);
    const result = await fixture.actors.authorA.client.rpc("update_author_draft" as never, {
      p_challenge_id: fixture.ids.draft, p_payload: { ...stale(before), title: "Overwrite" },
    } as never);
    expect(result.data).toEqual({ status: "version_conflict" });
    expect(await stored(fixture.ids.draft)).toEqual(before);
  });
});

describe("version bounds", () => {
  it.each(["expectedRowVersion", "expectedDraftVersion"])(
    "AUT-02.5 REV-05 an HTTP edit with a 10-digit %s within the contract bound is a version conflict, not invalid", async (field) => {
      const before = await stored(fixture.ids.draft);
      const body = {
        expectedRowVersion: before.row_version, expectedDraftVersion: before.draft_version, [field]: 1_000_000_000, title: "Overwrite",
      };
      await expectError(await patch(fixture.actors.authorA.client, fixture.ids.draft, body), 409, "VERSION_CONFLICT");
      expect(await stored(fixture.ids.draft)).toEqual(before);
    });
});

describe("U+0000", () => {
  it.each(["title", "description", "workingCode"])(
    "AUT-01.2 SYS-02.1 REV-01 a direct create with U+0000 in %s errors and creates nothing", async (field) => {
      const before = await authorRowCount();
      const payload = { ...input(), [field]: `before\u0000after` };
      const result = await fixture.actors.authorA.client.rpc("create_author_challenge" as never, {
        p_idempotency_key: randomUUID(), p_payload: payload,
      } as never);
      // jsonb cannot carry U+0000, so the request fails before the function body runs.
      expect(result.error).not.toBeNull();
      expect(await authorRowCount()).toBe(before);
    });

  it.each([
    ["title", "Enter a title."],
    ["description", "Enter a description."],
    ["workingCode", "Working code contains invalid characters."],
  ])("AUT-01.2 SYS-02.1 REV-01 an HTTP create with U+0000 in %s is a validation error and creates nothing", async (field, message) => {
    const before = await authorRowCount();
    const error = await expectError(await post(fixture.actors.authorA.client, { ...input(), [field]: "before\u0000after" }),
      400, "VALIDATION_ERROR");
    expect(error.fieldErrors).toEqual({ [field]: [message] });
    expect(await authorRowCount()).toBe(before);
  });

  it("AUT-02.5 SYS-02.1 REV-01 an HTTP edit with U+0000 in working code is a validation error and changes nothing", async () => {
    const before = await stored(fixture.ids.draft);
    const error = await expectError(await patch(fixture.actors.authorA.client, fixture.ids.draft, {
      expectedRowVersion: before.row_version, expectedDraftVersion: before.draft_version, workingCode: "const a = 1;\u0000\n",
    }), 400, "VALIDATION_ERROR");
    expect(error.fieldErrors).toEqual({ workingCode: ["Working code contains invalid characters."] });
    expect(await stored(fixture.ids.draft)).toEqual(before);
  });
});
