// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { createProgressFixture } from "./fixture";
import { id } from "../../../unit/ta/progress/evidence";
let f: Awaited<ReturnType<typeof createProgressFixture>>;
beforeAll(async () => { f = await createProgressFixture(); });
afterAll(async () => { await f?.dispose(); });
it("SYS-10.1 SYS-10.2 SYS-12.1 SYS-12.2 TA-04.1 direct profile columns and evidence joins enforce the two-user-per-role matrix", async () => {
  const callers = { ...Object.fromEntries(Object.entries(f.actors).map(([key, actor]) => [key, actor.client])), anon: f.h.client() };
  for (const [role, client] of Object.entries(callers)) {
    const result = await client.from("profiles").select("id,display_name").in("id", [id(11), id(12)]);
    const expected = role.startsWith("ta") ? [id(11), id(12)] : role === "learnerA" ? [id(11)] : role === "learnerB" ? [id(12)] : [];
    expect((result.data ?? []).map(row => row.id).sort()).toEqual(expected);
    for (const columns of ["email", "id,email", "*"]) {
      const emails = await client.from("profiles").select(columns).in("id", [id(11), id(12)]);
      expect(JSON.stringify(emails.data)).not.toMatch(/email|@example\.test/);
    }
    const grades = await client.from("submissions").select("id,ai_grades(ai_grade_evidence(ai_grade_assessments(flaw_id,comment_id)))").in("id", [id(501), id(503)]);
    if (role.startsWith("ta")) {
      expect(grades.error).toBeNull(); expect(grades.data).toHaveLength(2);
      expect(JSON.stringify(grades.data)).toContain(id(301));
    } else if (role.startsWith("author") || role === "anon") expect(grades.error !== null || grades.data?.length === 0).toBe(true);
    else expect((grades.data ?? []).map(row => row.id)).toEqual([role === "learnerA" ? id(501) : id(503)]);
    const otherRole = await client.from("profiles").select("id,display_name").in("id", [id(1), id(2), id(21), id(22)]);
    const own = f.actors[role as keyof typeof f.actors]?.id;
    expect((otherRole.data ?? []).map(row => row.id)).toEqual(own && !role.startsWith("learner") ? [own] : []);
  }
});
it("SYS-10.1 SYS-10.2 TA-04.2 directory RPC grants only authenticated EXECUTE and validates stored TA role in direct calls", async () => {
  // Interfaces defined by tests: this read-only helper exists to page permitted
  // identity without granting a TA broad profile timestamps or other-role rows.
  const signature = "public.list_ta_learners(integer,timestamp with time zone,uuid)";
  const result = await f.h.db.query("select p.prosecdef,p.proconfig from pg_proc p where p.oid=to_regprocedure($1)", [signature]);
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].prosecdef).toBe(true);
  expect(result.rows[0].proconfig).toContain('search_path=""');
  for (const [role, allowed] of [["authenticated", true], ["anon", false], ["service_role", false]] as const) {
    const grant = await f.h.db.query("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, signature]);
    expect(grant.rows[0].allowed).toBe(allowed);
  }
  const publicGrant = await f.h.db.query("select exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure($1) and acl.grantee=0 and acl.privilege_type='EXECUTE') allowed", [signature]);
  expect(publicGrant.rows[0].allowed).toBe(false);
  const before = await f.snapshot();
  for (const [role, actor] of Object.entries(f.actors)) {
    const rpc = await actor.client.rpc("list_ta_learners", { p_limit: 1, p_before: null, p_after_id: null });
    expect(rpc.error).toBeNull();
    if (role.startsWith("ta")) {
      expect(rpc.data.status).toBe("ok"); expect(rpc.data.items.length).toBeLessThanOrEqual(2);
      for (const learner of rpc.data.items) expect(Object.keys(learner).sort()).toEqual(["displayName", "id"]);
    } else expect(rpc.data).toEqual({ status: "forbidden" });
  }
  const anonymous = await f.h.client().rpc("list_ta_learners", { p_limit: 1, p_before: null, p_after_id: null });
  expect(anonymous.error).not.toBeNull();
  for (const limit of [0, 51]) {
    const rpc = await f.actors.taA.client.rpc("list_ta_learners", { p_limit: limit, p_before: null, p_after_id: null });
    expect(rpc.error !== null || rpc.data?.status === "invalid").toBe(true);
  }
  expect(await f.snapshot()).toEqual(before);
});
it("SYS-10.1 SYS-10.2 SYS-12.2 TA-05.7 identity RPC enforces grants and distinguishes absent, learner and wrong-role IDs without exposing hidden profiles", async () => {
  const signature = "public.read_ta_learner(uuid)";
  const fn = await f.h.db.query("select p.prosecdef,p.proconfig from pg_proc p where p.oid=to_regprocedure($1)", [signature]);
  expect(fn.rows).toHaveLength(1); expect(fn.rows[0].prosecdef).toBe(true); expect(fn.rows[0].proconfig).toContain('search_path=""');
  for (const [role, allowed] of [["authenticated", true], ["anon", false], ["service_role", false]] as const) {
    const grant = await f.h.db.query("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, signature]);
    expect(grant.rows[0].allowed).toBe(allowed);
  }
  const publicGrant = await f.h.db.query("select exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure($1) and acl.grantee=0 and acl.privilege_type='EXECUTE') allowed", [signature]);
  expect(publicGrant.rows[0].allowed).toBe(false);
  const before = await f.snapshot();
  for (const [caller, actor] of Object.entries(f.actors)) for (const target of [id(11), id(12), id(1), id(2), id(21), id(22), id(999)]) {
    const result = await actor.client.rpc("read_ta_learner", { p_learner_id: target }); expect(result.error).toBeNull();
    if (!caller.startsWith("ta") || [id(1), id(2), id(21), id(22)].includes(target)) expect(result.data).toEqual({ status: "forbidden" });
    else if (target === id(999)) expect(result.data).toEqual({ status: "not_found" });
    else expect(result.data).toEqual({ status: "ok", learner: { id: target, displayName: target === id(11) ? "Learner A" : "Learner B" } });
  }
  const anon = await f.h.client().rpc("read_ta_learner", { p_learner_id: id(11) }); expect(anon.error).not.toBeNull();
  expect(await f.snapshot()).toEqual(before);
});
it("SYS-10.1 SYS-12.2 SEC-REV-01 profile column grants deny timestamps while preserving own stored roles and TA identity RPCs", async () => {
  for (const role of ["authenticated", "anon", "service_role"]) {
    const table = await f.h.db.query("select has_table_privilege($1,'public.profiles','SELECT') allowed", [role]);
    expect.soft(table.rows[0].allowed).toBe(false);
    for (const column of ["id", "display_name", "role", "created_at"]) {
      const grant = await f.h.db.query("select has_column_privilege($1,'public.profiles',$2,'SELECT') allowed", [role, column]);
      expect.soft(grant.rows[0].allowed).toBe(role === "authenticated" && column !== "created_at");
    }
  }
  const callers = { ...Object.fromEntries(Object.entries(f.actors).map(([key, actor]) => [key, actor.client])), anon: f.h.client() };
  for (const [caller, client] of Object.entries(callers)) {
    const target = caller === "anon" ? id(11) : f.actors[caller as keyof typeof f.actors].id;
    const timestamps = await client.from("profiles").select("id,created_at").eq("id", target);
    expect.soft(timestamps.error?.code).toBe("42501"); expect.soft(timestamps.data).toBeNull();
    if (caller === "anon") continue;
    const own = await client.from("profiles").select("id,display_name,role").eq("id", target).single();
    expect(own.error).toBeNull(); expect(own.data).toEqual({ id: target, display_name: expect.any(String), role: caller.slice(0, -1) });
    if (caller.startsWith("ta")) {
      const identity = await client.rpc("read_ta_learner", { p_learner_id: id(11) });
      expect(identity.error).toBeNull(); expect(identity.data).toEqual({ status: "ok", learner: { id: id(11), displayName: "Learner A" } });
      const page = await client.rpc("list_ta_learners", { p_limit: 1, p_before: null, p_after_id: null });
      expect(page.error).toBeNull(); expect(page.data.status).toBe("ok");
      for (const row of page.data.items) expect(Object.keys(row).sort()).toEqual(["displayName", "id"]);
    }
  }
});
