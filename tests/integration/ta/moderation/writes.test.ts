// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { localHarness } from "../../auth/local";
import { createInspectionFixture } from "../inspection/fixture";
import { id } from "../../../unit/ta/inspection/evidence";
const context = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => {
  if (!context.client) throw new Error("Missing local caller"); return context.client;
} }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: () => { throw new Error("Human moderation must be user-scoped"); } }));
vi.mock("@/server/llm/boundary", () => ({ createLlmBoundary: () => { throw new Error("Moderation must never request AI"); } }));
let f: Awaited<ReturnType<typeof createInspectionFixture>>;
let anon: SupabaseClient;
type Caller = keyof Awaited<ReturnType<typeof createInspectionFixture>>["actors"] | "anon";
let sequence = 10_000;
const key = () => id(sequence++);
const client = (caller: Caller) => caller === "anon" ? anon : f.actors[caller].client;
beforeAll(async () => {
  f = await createInspectionFixture(); anon = f.h.client();
  await f.h.db.query("insert into public.review_flags(id,submission_id,source,kind) values($1,$2,'rule','grading_output_retried')", [id(804), id(503)]);
});
afterAll(async () => {
  context.client = null;
  if (!f) return;
  // Remove only derived records; base fixture remains responsible for its seeded rows.
  // Disabling triggers here is confined to the privileged local fixture teardown.
  await f.h.db.query("begin");
  try {
    await f.h.db.query("set local session_replication_role = replica");
    await f.h.db.query("delete from public.flag_resolutions where flag_id in(select id from public.review_flags where submission_id in($1,$2,$3)) and id <> $4", [id(501), id(502), id(503), id(902)]);
    await f.h.db.query("delete from public.grade_overrides where submission_id in($1,$2,$3) and id <> $4", [id(501), id(502), id(503), id(901)]);
    await f.h.db.query("delete from public.review_flags where id=$1", [id(804)]);
    await f.h.db.query("delete from private.submission_audit_orders where submission_id in($1,$2,$3) and not(submission_id=$1 and audit_order in(1,2))", [id(501), id(502), id(503)]);
    await f.h.db.query("commit");
  } catch (error) { await f.h.db.query("rollback"); throw error; }
  finally { await f.dispose(); }
});
async function post(caller: Caller, kind: "override" | "resolution", target: string, body: unknown, requestKey: string | null = key(), origin = "http://localhost") {
  context.client = client(caller);
  const path = kind === "override" ? `ta/submissions/${target}/overrides` : `ta/flags/${target}/resolutions`;
  const request = new Request(`http://localhost/api/v1/${path}`, { method: "POST", headers: {
    "content-type": "application/json", origin, ...(requestKey === null ? {} : { "Idempotency-Key": requestKey }),
  }, body: JSON.stringify(body) });
  const { POST } = kind === "override" ? await import("@/app/api/v1/ta/submissions/[id]/overrides/route") : await import("@/app/api/v1/ta/flags/[id]/resolutions/route");
  return POST(request, { params: Promise.resolve({ id: target }) });
}
async function read(caller: Caller, sid = id(501)) {
  context.client = client(caller); const { readSubmission } = await import("@/server/ta/submissions");
  const result = await readSubmission(sid); expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error("Fixture detail unavailable"); return result.submission;
}
async function created(response: Response) {
  expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json(); expect(Object.keys(body)).toEqual(["data"]);
  expect(JSON.stringify(body)).not.toMatch(/@example\.test|"email"|access_token|refresh_token/); return body.data;
}
async function failure(response: Response, status: number, code: string) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ error: expect.objectContaining({ code, message: expect.any(String) }) });
}
async function counts() {
  return (await f.h.db.query("select (select count(*) from public.grade_overrides)::int overrides, (select count(*) from public.flag_resolutions)::int resolutions, (select count(*) from private.submission_audit_orders)::int audit")).rows[0];
}
it.each(["taA", "taB"] as const)("TA-03.2 TA-03.3 TA-03.4 TA-03.7 SYS-12.3 %s appends boundaries and equal-score decisions preserving all original evidence", async caller => {
  const before = await read(caller); const another = await read(caller, id(502));
  for (const score of [0, 59, 60, 100, 100]) {
    const start = Date.now(); const result = await created(await post(caller, "override", id(501), { score, reason: " Same-score or boundary decision " }));
    expect(result.override).toMatchObject({ actorId: f.actors[caller].id, score, reason: "Same-score or boundary decision", auditOrder: expect.any(Number) });
    expect(Date.parse(result.override.createdAt)).toBeGreaterThanOrEqual(start - 1000); expect(Date.parse(result.override.createdAt)).toBeLessThanOrEqual(Date.now() + 1000);
    expect(result.grading.effective).toEqual({ score, passed: score >= 60, source: "ta" });
    const after = await read(caller); expect(after.grading.original).toEqual(before.grading.original);
    for (const field of ["answerKey", "matching", "assessments", "comments", "challenge", "flags"] as const) expect(after[field]).toEqual(before[field]);
    expect(await read(caller, id(502))).toEqual(another);
  }
});
it("TA-02.4 TA-02.6 preserves corrections, leaves other flags open and does not alter grade/key/hints", async () => {
  const before = await read("taA", id(503));
  for (const disposition of ["upheld", "dismissed"]) {
    const flag = await created(await post("taB", "resolution", id(802), { disposition, reason: `Reviewed: ${disposition}` }));
    expect(flag.status).toBe("resolved"); expect(flag.resolutions.at(-1)).toMatchObject({ actorId: id(22), disposition, reason: `Reviewed: ${disposition}` });
  }
  const after = await read("taA", id(503));
  expect(after.flags.find(flag => flag.id === id(802))!.resolutions.map(r => r.disposition)).toEqual(["upheld", "dismissed"]);
  expect(after.flags.filter(flag => [id(803), id(804)].includes(flag.id)).map(flag => flag.status)).toEqual(["open", "open"]);
  for (const field of ["grading", "answerKey", "matching", "assessments", "challenge"] as const) expect(after[field]).toEqual(before[field]);
});
it("TA-02.1 TA-02.2 TA-02.3 queue preserves each kind, bound filters, stable pages and open/resolved membership", async () => {
  context.client = client("taA"); const { GET } = await import("@/app/api/v1/ta/flags/route");
  async function page(search: string) { const response = await GET(new Request(`http://localhost/api/v1/ta/flags?${search}`)); expect(response.status).toBe(200); return (await response.json()).data; }
  const open = await page(""); expect(open.items.every((flag: {status: string}) => flag.status === "open")).toBe(true);
  expect(open.items.some((flag: {id: string}) => flag.id === id(802))).toBe(false);
  const all = [...open.items, ...(await page("status=resolved")).items];
  expect(all.map(flag => flag.kind).sort()).toEqual(["assessment_disagreement", "grading_output_retried", "learner_report", "near_pass_mark"]);
  for (const flag of all) {
    const result = await page(`status=${flag.status}&kind=${flag.kind}`); expect(result.items.map((row: {id: string}) => row.id)).toEqual([flag.id]);
    if (flag.source === "rule") { expect(flag.reason).toBeNull(); expect(flag.commentId).toBeNull(); }
    else { expect(flag.reason).toContain("Rounding"); expect(flag.commentId).toBe(id(602)); }
  }
  const first = await page("limit=1"); expect(first.nextCursor).toEqual(expect.any(String));
  const second = await page(`limit=1&cursor=${encodeURIComponent(first.nextCursor)}`);
  expect(first.items[0].id).not.toBe(second.items[0].id); expect(second.nextCursor).toBeNull();
  for (const query of ["cursor=broken", "status=all", "kind=unknown", "limit=51", "limit=1&limit=2", `status=resolved&cursor=${first.nextCursor}`]) {
    await failure(await GET(new Request(`http://localhost/api/v1/ta/flags?${query}`)), 400, "VALIDATION_ERROR");
  }
});
it.each(["override", "resolution"] as const)("TA-02.7 TA-03.6 %s lost-response replay returns identical IDs/results; changed payload conflicts; keys are actor/resource scoped", async kind => {
  const target = kind === "override" ? id(501) : id(801), requestKey = key();
  const body = kind === "override" ? { score: 70, reason: "Lost response" } : { disposition: "upheld", reason: "Lost response" };
  const original = await created(await post("taA", kind, target, body, requestKey)); const after = await counts();
  expect(await created(await post("taA", kind, target, { ...body, reason: " Lost response " }, requestKey))).toEqual(original);
  expect(await counts()).toEqual(after);
  await failure(await post("taA", kind, target, { ...body, reason: "Changed payload" }, requestKey), 409, "IDEMPOTENCY_CONFLICT");
  expect(await counts()).toEqual(after);
  await created(await post("taB", kind, target, body, requestKey));
  await created(await post("taA", kind, kind === "override" ? id(502) : id(803), body, requestKey));
});
it.each(["override", "resolution"] as const)("TA-02.5 TA-03.2 TA-03.8 SYS-02.1 %s invalid, forged and missing-key requests have no audit side effects", async kind => {
  const before = await counts(), target = kind === "override" ? id(501) : id(801);
  const good = kind === "override" ? { score: 70, reason: "Evidence" } : { disposition: "dismissed", reason: "Evidence" };
  const invalid = [{ ...good, reason: " " }, { ...good, reason: "📝".repeat(2001) }, { ...good, actorId: id(22) }, { ...good, createdAt: "2000-01-01T00:00:00Z" }, { ...good, auditOrder: 1 }, { ...good, extra: true }, ...(kind === "override" ? [-1, 101, 1.5, "70", null].map(score => ({ ...good, score })) : ["", "UPHELD", null].map(disposition => ({ ...good, disposition })))];
  for (const body of invalid) await failure(await post("taA", kind, target, body), 400, "VALIDATION_ERROR");
  for (const requestKey of [null, "broken"]) await failure(await post("taA", kind, target, good, requestKey), 400, "VALIDATION_ERROR");
  await failure(await post("taA", kind, "bad-id", good), 400, "VALIDATION_ERROR");
  await failure(await post("taA", kind, id(999), good), 404, "NOT_FOUND");
  await failure(await post("taA", kind, target, good, key(), "https://untrusted.example"), 403, "FORBIDDEN");
  expect(await counts()).toEqual(before);
});
it.each(["pending", "running", "failed"])("TA-03.5 rejects %s original grading without manufacturing an assessment", async state => {
  const before = await counts();
  await failure(await post("taA", "override", f.statusIds[state], { score: 70, reason: "Cannot invent original" }), 409, "INVALID_STATE");
  expect(await counts()).toEqual(before);
  const originals = await f.h.db.query("select id from public.ai_grades where submission_id=$1", [f.statusIds[state]]); expect(originals.rows).toEqual([]);
});
// Each race uses independently connected PostgreSQL clients, real role/JWT claims,
// and separate committed transactions. No surrounding rollback hides lock behavior.
async function committed(caller: "taA" | "taB", kind: "override" | "resolution", target: string, payload: object, requestKey: string) {
  const db = localHarness().db; await db.connect();
  try {
    await db.query("begin"); await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: f.actors[caller].id, role: "authenticated" })]);
    const fn = kind === "override" ? "append_ta_override" : "append_ta_resolution";
    const result = await db.query(`select public.${fn}($1::uuid,$2::jsonb,$3::uuid) result`, [target, JSON.stringify(payload), requestKey]);
    await db.query("commit"); return result.rows[0].result;
  } catch (error) { await db.query("rollback"); throw error; } finally { await db.end(); }
}
it("TA-02.7 TA-03.6 SYS-12.3 races distinct overrides/resolutions on independent committed connections with unique shared auditOrder and timestamp ties", async () => {
  const before = await read("taA");
  const results = await Promise.all([
    committed("taA", "override", id(501), { score: 59, reason: "Concurrent lower" }, key()),
    committed("taB", "override", id(501), { score: 60, reason: "Concurrent higher" }, key()),
    committed("taA", "resolution", id(801), { disposition: "upheld", reason: "Concurrent upheld" }, key()),
    committed("taB", "resolution", id(801), { disposition: "dismissed", reason: "Concurrent dismissed" }, key()),
  ]);
  expect(results.every(result => result.status === "ok")).toBe(true);
  const after = await read("taA"), newOverrides = after.grading.overrides.slice(before.grading.overrides.length);
  const newResolutions = after.flags[0].resolutions.slice(before.flags[0].resolutions.length);
  expect(newOverrides).toHaveLength(2); expect(newResolutions).toHaveLength(2);
  const stream = [...newOverrides, ...newResolutions].sort((a,b) => a.auditOrder - b.auditOrder);
  expect(new Set(stream.map(row => row.auditOrder)).size).toBe(4);
  expect(stream[0].auditOrder).toBeGreaterThan(Math.max(...before.grading.overrides.map(row => row.auditOrder), ...before.flags[0].resolutions.map(row => row.auditOrder)));
  // Force equal wall-clock timestamps and opposing insertion/response order; auditOrder is authoritative.
  await f.h.db.query("begin");
  try {
    await f.h.db.query("set local session_replication_role = replica");
    for (const table of ["grade_overrides", "flag_resolutions"]) await f.h.db.query(`update public.${table} set created_at='2026-01-01T00:00:09Z' where id=any($1::uuid[])`, [stream.map(row => row.id)]);
    await f.h.db.query("commit");
  } catch(error) { await f.h.db.query("rollback"); throw error; }
  const tied = await read("taB"), latest = [...newOverrides].sort((a,b) => a.auditOrder - b.auditOrder).at(-1)!;
  expect(tied.grading.effective).toEqual({ score: latest.score, passed: latest.score >= 60, source: "ta" });
  expect(tied.grading.overrides.map(row => row.auditOrder)).toEqual([...tied.grading.overrides.map(row => row.auditOrder)].sort((a,b) => a-b));
  expect(tied.flags[0].resolutions.map(row => row.auditOrder)).toEqual([...tied.flags[0].resolutions.map(row => row.auditOrder)].sort((a,b) => a-b));
});
it.each(["override", "resolution"] as const)("TA-02.7 TA-03.6 %s duplicate-key race executes once and remains replayable", async kind => {
  const requestKey = key(), target = kind === "override" ? id(501) : id(801);
  const payload = kind === "override" ? { score: 70, reason: "One action" } : { disposition: "dismissed", reason: "One action" };
  const before = await counts();
  const results = await Promise.all([committed("taA", kind, target, payload, requestKey), committed("taA", kind, target, payload, requestKey)]);
  expect(results.some(result => result.status === "ok")).toBe(true);
  for (const result of results) expect(["ok", "invalid_state"]).toContain(result.status);
  const replay = await committed("taA", kind, target, payload, requestKey); expect(replay.status).toBe("ok");
  for (const result of results.filter(result => result.status === "ok")) expect(result).toEqual(replay);
  const after = await counts(); expect(after[kind === "override" ? "overrides" : "resolutions"]).toBe(before[kind === "override" ? "overrides" : "resolutions"] + 1);
  expect(after.audit).toBe(before.audit + 1);
});
it.each(["authorA", "authorB", "learnerA", "learnerB", "anon"] as const)("TA-02.8 TA-03.8 SYS-08.2 SYS-08.3 SYS-11 %s cannot write through handlers, application entries or constrained DB functions", async caller => {
  const before = await counts(), status = caller === "anon" ? 401 : 403, code = caller === "anon" ? "UNAUTHENTICATED" : "FORBIDDEN";
  for (const target of [id(501), id(503), id(999)]) await failure(await post(caller, "override", target, { score: 70, reason: "Denied" }), status, code);
  for (const target of [id(801), id(802), id(999)]) await failure(await post(caller, "resolution", target, { disposition: "upheld", reason: "Denied" }), status, code);
  context.client = client(caller); const app = await import("@/server/ta/moderation");
  const expected = { status: caller === "anon" ? "unauthenticated" : "role_denied" };
  expect(await app.appendOverride(id(501), { score: 70, reason: "Denied" }, key())).toEqual(expected);
  expect(await app.appendResolution(id(801), { disposition: "upheld", reason: "Denied" }, key())).toEqual(expected);
  expect(await app.readFlagPage(new URLSearchParams())).toEqual(expected);
  for (const [fn, target, payload] of [["append_ta_override", id(501), { score: 70, reason: "Denied" }], ["append_ta_resolution", id(801), { disposition: "upheld", reason: "Denied" }]] as const) {
    const result = await client(caller).rpc(fn, { p_id: target, p_payload: payload, p_key: key() });
    expect(result.error !== null || result.data?.status === "forbidden").toBe(true);
  }
  expect(await counts()).toEqual(before);
});
it("SYS-10.1 SYS-10.2 SYS-10.4 SYS-12.1 SYS-12.5 denies direct forged inserts/edits/deletes for every role, preserves scoped histories and learner privacy", async () => {
  const before = await counts();
  for (const caller of [...Object.keys(f.actors), "anon"] as Caller[]) {
    const c = client(caller);
    for (const [table, row, recordId] of [
      ["grade_overrides", { id: key(), submission_id: id(501), actor_id: id(22), created_at: "2000-01-01", audit_order: 999999, score: 100, reason: "Forged" }, id(901)],
      ["flag_resolutions", { id: key(), flag_id: id(801), actor_id: id(22), created_at: "2000-01-01", audit_order: 999998, disposition: "upheld", reason: "Forged" }, id(902)],
      ["review_flags", { id: key(), submission_id: id(501), source: "rule", kind: "near_pass_mark" }, id(801)],
    ] as const) {
      expect((await c.from(table).insert(row)).error).not.toBeNull();
      expect((await c.from(table).update({ reason: "Changed" }).eq("id", recordId).select("id")).data ?? []).toEqual([]);
      expect((await c.from(table).delete().eq("id", recordId).select("id")).data ?? []).toEqual([]);
    }
    for (const table of ["grade_overrides", "flag_resolutions", "review_flags"]) {
      const result = await c.from(table).select("*");
      const allowed = caller.startsWith("ta") || caller === "learnerA" || caller === "learnerB";
      if (allowed) expect(result.error).toBeNull(); else expect(result.error !== null || result.data?.length === 0).toBe(true);
      if (caller === "learnerA") expect((result.data ?? []).every(row => table === "flag_resolutions" ? row.flag_id === id(801) : row.submission_id === id(501) || row.submission_id === id(502))).toBe(true);
      if (caller === "learnerB") expect((result.data ?? []).every(row => table === "flag_resolutions" ? [id(802), id(803), id(804)].includes(row.flag_id) : row.submission_id === id(503))).toBe(true);
      expect(JSON.stringify(result.data)).not.toMatch(/@example\.test|"email"/);
    }
  }
  expect(await counts()).toEqual(before);
  const schema = await f.h.db.query("select relname,relrowsecurity from pg_class where oid in('public.grade_overrides'::regclass,'public.flag_resolutions'::regclass)");
  expect(schema.rows.every(row => row.relrowsecurity)).toBe(true);
});
it("TA-02.8 TA-03.7 SYS-12.3 SYS-12.4 retains historical moderation and shares effective grade with owning-Learner projection", async () => {
  const before = await read("taA"); await f.publishNextRevision();
  await f.h.db.query("update public.challenge_drafts set title='Edited', draft_version=draft_version+1 where challenge_id=$1", [id(101)]);
  for (const status of ["unpublished", "archived"]) {
    await f.h.db.query("update public.challenges set status=$1 where id=$2", [status, id(101)]);
    await created(await post("taA", "override", id(501), { score: 60, reason: `Historical ${status}` }));
    await created(await post("taB", "resolution", id(801), { disposition: "upheld", reason: `Historical ${status}` }));
    const ta = await read("taA");
    for (const field of ["challenge", "answerKey", "matching", "assessments"] as const) expect(ta[field]).toEqual(before[field]);
    expect(ta.grading.original).toEqual(before.grading.original);
    const { projectEffectiveGrade } = await import("@/lib/grading/effective-grade");
    for (const caller of ["learnerA", "learnerB"] as const) {
      const sid = caller === "learnerA" ? id(501) : id(503), ownTa = await read("taA", sid);
      const stored = await client(caller).from("submissions").select("id,ai_grades(score),grade_overrides(id,actor_id,created_at,audit_order,score,reason)").eq("id", sid).single();
      expect(stored.error).toBeNull(); expect(stored.data).not.toBeNull();
      const base = stored.data!; const original = Array.isArray(base.ai_grades) ? base.ai_grades[0] : base.ai_grades;
      expect(projectEffectiveGrade(original?.score ?? null, (base.grade_overrides ?? []).map((row: {score: number; audit_order: number}) => ({ score: row.score, auditOrder: row.audit_order })))).toEqual(ownTa.grading.effective);
      const privateKey = await client(caller).from("revision_answers").select("*").eq("revision_id", id(201));
      expect(privateKey.error !== null || privateKey.data?.length === 0).toBe(true);
    }
  }
});
it("TA-02.5 TA-03.2 TA-03.8 SYS-10.2 SYS-12.3 constrained database functions reject forged fields, invalid bounds and incomplete grading independently of HTTP", async () => {
  const before = await counts(); const c = client("taA");
  const cases = [
    ["append_ta_override", id(501), { score: 101, reason: "Rejected" }],
    ["append_ta_override", id(501), { score: 1.5, reason: "Rejected" }],
    ["append_ta_override", id(501), { score: 70, reason: " " }],
    ["append_ta_override", id(501), { score: 70, reason: "a".repeat(2001) }],
    ["append_ta_override", id(501), { score: 70, reason: "Rejected", actorId: id(22) }],
    ["append_ta_override", id(501), { score: 70, reason: "Rejected", createdAt: "2000-01-01T00:00:00Z" }],
    ["append_ta_override", id(501), { score: 70, reason: "Rejected", auditOrder: 999 }],
    ["append_ta_resolution", id(801), { disposition: "invalid", reason: "Rejected" }],
    ["append_ta_resolution", id(801), { disposition: "upheld", reason: " " }],
    ["append_ta_resolution", id(801), { disposition: "upheld", reason: "Rejected", actorId: id(22) }],
    ["append_ta_resolution", id(801), { disposition: "upheld", reason: "Rejected", createdAt: "2000-01-01T00:00:00Z", auditOrder: 99 }],
  ] as const;
  for (const [fn, target, payload] of cases) {
    const result = await c.rpc(fn, { p_id: target, p_payload: payload, p_key: key() });
    expect(result.error !== null || result.data?.status === "invalid").toBe(true);
  }
  for (const state of ["pending", "running", "failed"]) {
    const result = await c.rpc("append_ta_override", { p_id: f.statusIds[state], p_payload: { score: 70, reason: "Cannot invent original" }, p_key: key() });
    expect(result.error).toBeNull(); expect(result.data).toMatchObject({ status: "invalid_state" });
  }
  expect(await counts()).toEqual(before);
});
it("SYS-10.1 SYS-10.4 denies the admin role execution of human moderation append functions", async () => {
  const before = await counts();
  const grants = await f.h.db.query(`select p.proname,
    has_function_privilege('authenticated',p.oid,'execute') authenticated,
    has_function_privilege('anon',p.oid,'execute') anon,
    has_function_privilege('service_role',p.oid,'execute') service_role
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in('append_ta_override','append_ta_resolution') order by p.proname`);
  expect(grants.rows).toEqual([
    { proname: "append_ta_override", authenticated: true, anon: false, service_role: false },
    { proname: "append_ta_resolution", authenticated: true, anon: false, service_role: false },
  ]);
  for (const [fn, target, payload] of [["append_ta_override", id(501), { score: 100, reason: "Unlisted admin use" }], ["append_ta_resolution", id(801), { disposition: "upheld", reason: "Unlisted admin use" }]] as const) {
    const result = await f.h.admin.rpc(fn, { p_id: target, p_payload: payload, p_key: key() });
    expect(result.error).not.toBeNull();
  }
  expect(await counts()).toEqual(before);
});
