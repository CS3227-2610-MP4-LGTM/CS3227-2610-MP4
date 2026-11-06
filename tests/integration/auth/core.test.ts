// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { localHarness } from "./local";

const requestContext = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => {
  if (!requestContext.client) throw new Error("Missing test request context");
  return requestContext.client;
} }));

const identities = [
  { suffix: "000000000001", role: "author", name: "Author A" },
  { suffix: "000000000002", role: "author", name: "Author B" },
  { suffix: "000000000011", role: "learner", name: "Learner A" },
  { suffix: "000000000012", role: "learner", name: "Learner B" },
  { suffix: "000000000021", role: "ta", name: "TA A" },
  { suffix: "000000000022", role: "ta", name: "TA B" },
].map((entry) => ({ ...entry, id: `00000000-0000-4000-8000-${entry.suffix}`, email: `auth-core-${entry.suffix}@example.test` }));
const password = " a b c ";
type Harness = ReturnType<typeof localHarness>;
let h: Harness;
const clients = new Map<string, SupabaseClient>();
const created = new Set<string>();
let nonce: string;

// Per run: six fixture sign-ins + three new sign-ups + six invalid sign-ups +
// rollback + duplicate + two credential failures + two device sessions = twenty-one attempts.
// No test exhausts the rate limiter; throttling is injected in unit tests.
describe("local Auth and profile enforcement", () => {
  beforeAll(async () => {
    h = localHarness();
    nonce = Date.now().toString(36);
    await h.db.connect();
    for (const identity of identities) {
      const previous = await h.admin.auth.admin.getUserById(identity.id);
      if (previous.data.user) {
        if (previous.data.user.email !== identity.email) throw new Error("Fixture ID belongs to an unrelated account");
        const removed = await h.admin.auth.admin.deleteUser(identity.id);
        if (removed.error) throw new Error("Unable to remove prior auth test fixture");
      }
      const result = await h.admin.auth.admin.createUser({ id: identity.id, email: identity.email, password,
        email_confirm: true, user_metadata: { display_name: identity.name, role: identity.role } });
      if (result.error || !result.data.user) throw new Error("Local Auth fixture creation failed (inspect provisioning separately)");
      created.add(result.data.user.id);
      const client = h.client();
      const login = await client.auth.signInWithPassword({ email: identity.email, password });
      if (login.error || !login.data.session) throw new Error("Local Auth fixture sign-in failed");
      clients.set(identity.id, client);
    }
  });

  afterAll(async () => {
    if (!h) return;
    let cleanupFailed = false;
    for (const id of created) {
      try {
        const result = await h.admin.auth.admin.deleteUser(id);
        if (result.error) cleanupFailed = true;
      } catch { cleanupFailed = true; }
    }
    await h.db.end();
    requestContext.client = null;
    vi.unstubAllEnvs();
    if (cleanupFailed) throw new Error("Unable to clean up one or more local Auth fixtures");
  });

  it.each(["learner", "author", "ta"])("SYS-05.1 direct %s sign-up creates a session and exactly one normalized profile atomically", async (role) => {
    const result = await h.client().auth.signUp({ email: `auth-core-${nonce}-${role}@example.test`, password,
      options: { data: { display_name: " New account ", role } } });
    if (result.data.user) created.add(result.data.user.id);
    expect(result.error).toBeNull();
    expect(result.data.session).not.toBeNull();
    expect(result.data.user).not.toBeNull();
    const rows = await h.db.query("select id, display_name, role from public.profiles where id = $1", [result.data.user!.id]);
    expect(rows.rows).toEqual([{ id: result.data.user!.id, display_name: "New account", role }]);
    const fields = await h.db.query("select column_name from information_schema.columns where table_schema='public' and table_name='profiles'");
    expect(fields.rows.map((r) => r.column_name)).not.toContain("password");
  });

  it.each([
    {}, { role: "learner" }, { display_name: "Name" },
    { role: "admin", display_name: "Name" }, { role: "learner", display_name: " " },
    { role: "learner", display_name: "x".repeat(81) }, { role: "learner", display_name: "\t\n" },
  ])("SYS-06.2 direct Auth rejects invalid provisioning metadata without orphan accounts %#", async (data) => {
    const email = `auth-core-${nonce}-invalid-${Object.keys(data).join("-")}-${JSON.stringify(data).length}@example.test`;
    const result = await h.client().auth.signUp({ email, password, options: { data } });
    if (result.data.user) created.add(result.data.user.id);
    expect(result.error).not.toBeNull();
    expect(result.data.session).toBeNull();
    const rows = await h.db.query("select id from auth.users where email=$1", [email]);
    expect(rows.rows).toEqual([]);
  });

  it("SYS-06.1 database provisioning failure rolls back Auth creation as well as the profile", async () => {
    const relation = await h.db.query("select to_regclass('public.profiles') as relation");
    expect(relation.rows[0].relation, "T-01 must create profiles before rollback can be exercised").not.toBeNull();
    // Reject only this fixture, leaving other sessions unaffected. Cleanup is mandatory.
    await h.db.query(`create function private.auth_core_test_reject() returns trigger language plpgsql as $$
      begin if new.display_name = '__auth_core_rollback__' then raise exception 'test provisioning failure'; end if; return new; end $$`);
    try {
      await h.db.query("create trigger auth_core_test_reject before insert on public.profiles for each row execute function private.auth_core_test_reject()");
      const email = `auth-core-${nonce}-rollback@example.test`;
      const result = await h.client().auth.signUp({ email, password,
        options: { data: { role: "learner", display_name: "__auth_core_rollback__" } } });
      if (result.data.user) created.add(result.data.user.id);
      expect(result.error).not.toBeNull();
      expect((await h.db.query("select id from auth.users where email=$1", [email])).rows).toEqual([]);
    } finally {
      await h.db.query("drop trigger if exists auth_core_test_reject on public.profiles");
      await h.db.query("drop function if exists private.auth_core_test_reject()");
    }
  });

  it("SYS-06.4 duplicate sign-up and editable metadata cannot change a stored role", async () => {
    const identity = identities[2];
    const duplicate = await h.client().auth.signUp({ email: identity.email, password,
      options: { data: { role: "ta", display_name: "Changed" } } });
    expect(duplicate.data.session).toBeNull();
    await clients.get(identity.id)!.auth.updateUser({ data: { role: "ta", display_name: "Changed" } });
    const profile = await h.db.query("select role, display_name from public.profiles where id=$1", [identity.id]);
    expect(profile.rows).toEqual([{ role: "learner", display_name: "Learner A" }]);
  });

  it("SYS-05.3 invalid credentials establish no session without distinguishing unknown account", async () => {
    for (const email of [identities[0].email, `auth-core-${nonce}-unknown@example.test`]) {
      const result = await h.client().auth.signInWithPassword({ email, password: "wrong-password" });
      expect(result.data.session).toBeNull();
      expect(result.error?.code).toBe("invalid_credentials");
    }
  });

  it.each(identities)("SYS-12.1 $name has only own profile reads, plus learner names for TAs, through direct user-scoped API", async (actor) => {
    const result = await clients.get(actor.id)!.from("profiles").select("id,display_name").in("id", identities.map((entry) => entry.id));
    expect(result.error).toBeNull();
    const allowed = identities.filter((target) => target.id === actor.id || (actor.role === "ta" && target.role === "learner"));
    expect(result.data?.map((row) => row.id).sort()).toEqual(allowed.map((row) => row.id).sort());
    expect((await h.client().from("profiles").select("*")).data ?? []).toEqual([]);
  });

  it.each(identities)("SYS-12.1 $name is checked at the server read boundary independently of navigation", async (actor) => {
    requestContext.client = clients.get(actor.id)!;
    const { readProfile } = await import("@/server/auth/account");
    for (const target of identities) {
      const result = await readProfile(target.id);
      const allowed = actor.id === target.id || (actor.role === "ta" && target.role === "learner");
      if (!allowed) expect(result).toEqual({ status: "forbidden" });
      else if (actor.id === target.id) expect(result).toEqual({ status: "ok", profile: { id: target.id, displayName: target.name, role: target.role } });
      else expect(result).toEqual({ status: "ok", profile: { id: target.id, displayName: target.name } });
    }
    requestContext.client = h.client();
    expect(await readProfile(actor.id)).toEqual({ status: "unauthenticated" });
  });

  it("SYS-06.4 user-scoped database mutations cannot insert, delete, replace identity or change profile role", async () => {
    const actor = identities[2];
    const client = clients.get(actor.id)!;
    const before = await h.db.query("select * from public.profiles order by id");
    for (const operation of [
      () => client.from("profiles").update({ role: "ta" }).eq("id", actor.id),
      () => client.from("profiles").update({ display_name: "Edited" }).eq("id", actor.id),
      () => client.from("profiles").update({ id: identities[3].id }).eq("id", actor.id),
      () => client.from("profiles").delete().eq("id", actor.id),
      () => client.from("profiles").insert({ id: "00000000-0000-4000-8000-999999999999", display_name: "Forged", role: "ta" }),
      () => client.from("profiles").upsert({ id: actor.id, display_name: "Replaced", role: "ta" }),
    ]) {
      await operation(); // RLS may deny via error or an empty affected-row set.
      expect((await h.db.query("select * from public.profiles order by id")).rows).toEqual(before.rows);
    }
  });

  it("SYS-12.2 TA profile queries cannot expose learner email or Auth account records", async () => {
    const client = clients.get(identities[4].id)!;
    const rows = await client.from("profiles").select("*");
    expect(rows.error).toBeNull();
    expect(JSON.stringify(rows.data)).not.toMatch(/@example\.test|"email"/);
    expect((await client.from("profiles").select("email")).error).not.toBeNull();
    expect((await client.auth.admin.listUsers()).error).not.toBeNull();
  });

  it("SYS-10.1 Vitest/pg schema checks require RLS and no anonymous or ungranted mutation access", async () => {
    const tables = await h.db.query("select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
    expect(tables.rows.find((row) => row.relname === "profiles")).toMatchObject({ relrowsecurity: true });
    expect(tables.rows.every((row) => row.relrowsecurity)).toBe(true);
    const grants = await h.db.query(`select has_table_privilege('anon', 'public.profiles', 'select') as anon_read,
      has_table_privilege('authenticated', 'public.profiles', 'insert,update,delete') as user_write`);
    expect(grants.rows[0]).toEqual({ anon_read: false, user_write: false });
    await h.db.query("begin");
    try {
      await h.db.query("create table public.auth_core_unexposed_probe (id int)");
      const probe = await h.db.query(`select relrowsecurity as rls,
        has_table_privilege('anon', oid, 'select,insert,update,delete') as anon_access,
        has_table_privilege('authenticated', oid, 'select,insert,update,delete') as user_access,
        has_table_privilege('service_role', oid, 'select,insert,update,delete') as admin_access
        from pg_class where oid='public.auth_core_unexposed_probe'::regclass`);
      expect(probe.rows[0]).toEqual({ rls: true, anon_access: false, user_access: false, admin_access: false });
    } finally { await h.db.query("rollback"); }
  });

  it("SYS-10.4 only the private initial-provisioning trigger is privileged and users cannot execute it", async () => {
    const triggers = await h.db.query(`select n.nspname, p.prosecdef,
      has_function_privilege('anon',p.oid,'execute') as anon_execute,
      has_function_privilege('authenticated',p.oid,'execute') as user_execute
      from pg_trigger t join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace
      where t.tgrelid='auth.users'::regclass and not t.tgisinternal and (t.tgtype & 4)=4`);
    expect(triggers.rows).toContainEqual({ nspname: "private", prosecdef: true, anon_execute: false, user_execute: false });
  });

  it("SYS-07.1 real expired credentials refresh into the downstream server cookie context without a loop", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", h.url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", h.key);
    const session = (await clients.get(identities[1].id)!.auth.getSession()).data.session!;
    // Persist an expired session with its real local refresh token into SSR cookies.
    const jar = new Map<string, string>();
    const writer = createServerClient(h.url, h.key, {
      cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (items) => { for (const item of items) jar.set(item.name, item.value); } },
    });
    await writer.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    // Expiry in persisted session is untrusted transport data, never proof of identity.
    const name = [...jar.keys()].find((key) => /-auth-token(?:\.\d+)?$/.test(key))?.replace(/\.\d+$/, "");
    expect(name).toBeDefined();
    const chunks = [...jar].filter(([key]) => key === name || key.startsWith(`${name}.`))
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
    const encoded = chunks.map(([, value]) => value).join("");
    const stored = JSON.parse(Buffer.from(encoded.replace(/^base64-/, ""), "base64url").toString());
    stored.expires_at = 1;
    for (const [key] of chunks) jar.delete(key);
    jar.set(name!, `base64-${Buffer.from(JSON.stringify(stored)).toString("base64url")}`);
    const request = new NextRequest("http://localhost/learner/challenges", {
      headers: { cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") },
    });
    const { proxy } = await import("@/proxy");
    const response = await proxy(request);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-request-cookie")).toMatch(/-auth-token(?:\.\d+)?=/);
    expect(request.cookies.getAll().map(({ value }) => value).join("")).not.toBe([...jar.values()].join(""));
    const refreshed = createServerClient(h.url, h.key, { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } });
    expect((await refreshed.auth.getUser()).data.user?.id).toBe(identities[1].id);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("SYS-05.4 local sign-out revokes this refresh token while another device still verifies", async () => {
    const actor = identities[0];
    const first = h.client();
    const second = h.client();
    const firstSession = await first.auth.signInWithPassword({ email: actor.email, password });
    await second.auth.signInWithPassword({ email: actor.email, password });
    expect((await first.auth.signOut({ scope: "local" })).error).toBeNull();
    expect((await h.client().auth.refreshSession({ refresh_token: firstSession.data.session!.refresh_token })).data.session).toBeNull();
    expect((await second.auth.getUser()).data.user?.id).toBe(actor.id);
    requestContext.client = first;
    const { getAccount } = await import("@/server/auth/account");
    expect(await getAccount()).toEqual({ status: "unauthenticated" });
  });
});
