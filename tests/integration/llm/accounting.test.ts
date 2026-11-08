// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { accountKeys, accounts, limits, openHarness, type TestHarness } from "./harness";
import { uid } from "../../unit/server/llm/fixtures";
vi.mock("server-only", () => ({}));
import { createAccountingStore } from "@/server/llm/accounting";

let h: TestHarness;
let time = Date.parse("2026-02-01T00:00:00Z");
let sequence = 10000;
const clock = () => time;
const key = () => uid(++sequence).replace("00000000", "38f00000");
const reservation = (accountId = accounts.authorA.id, patch: object = {}) => ({ accountId,
  operation: "inject_flaws", resourceId: key(), idempotencyKey: key(), fingerprint: key(), inputTokens: 100, outputTokens: 50, ...patch });
async function store(override: object = {}) {
  const db = await h.connection();
  return createAccountingStore({ db, clock, environmentId: "t04-llm-acceptance", limits: { ...limits, ...override } });
}
async function completed(s: Awaited<ReturnType<typeof store>>, request = reservation(), usage = { inputTokens: 100, outputTokens: 20 }) {
  const admitted = await s.reserve(request);
  expect(admitted.status).toBe("reserved");
  await s.markDispatched({ reservationId: admitted.reservationId });
  await s.settle({ reservationId: admitted.reservationId, outcome: "verified", usage });
  await s.close({ operationId: admitted.operationId, outcome: "completed" });
  return admitted;
}
// Move the controlled clock by a day between scenarios, without erasing durable history.
function nextWindow() { time += 86400000; }
beforeAll(async () => { h = await openHarness(); });
afterAll(async () => { if (h) await h.cleanup(); });

it.each(["account", "environment"] as const)("SEC-05.1 independent committed connections race the last %s concurrency slot", async scope => {
  nextWindow();
  const cap = scope === "account" ? { account: { ...limits.account, active: 1 } } : { environment: { ...limits.environment, active: 1 } };
  const a = await store(cap); const b = await store(cap);
  const firstAccount = accounts.authorA.id;
  const secondAccount = scope === "account" ? firstAccount : accounts.authorB.id;
  const results = await Promise.allSettled([a.reserve(reservation(firstAccount)), b.reserve(reservation(secondAccount))]);
  const winners = results.flatMap(r => r.status === "fulfilled" && r.value.status === "reserved" ? [r.value] : []);
  expect(winners).toHaveLength(1);
  const losers = results.filter(r => r.status === "rejected");
  expect(losers).toHaveLength(1);
  expect((losers[0] as PromiseRejectedResult).reason).toMatchObject({ code: "RATE_LIMITED" });
  // A third connection observes the committed reservation; process-local locks do not satisfy this.
  const persisted = await (await store(cap)).read({ accountId: firstAccount });
  expect(persisted.environment.active).toBe(1);
  await a.settle({ reservationId: winners[0].reservationId, outcome: "not_dispatched" });
  await a.close({ operationId: winners[0].operationId, outcome: "failed" });
});
it.each([
  ["account", "minuteAttempts", 4], ["account", "dayAttempts", 20], ["account", "dayTokens", 300000],
  ["environment", "minuteAttempts", 20], ["environment", "dayAttempts", 100], ["environment", "dayTokens", 1500000],
] as const)("SEC-04.2 %s %s accepts equality and atomically denies the next unit at %s", async (scope, budget, ceiling) => {
  nextWindow();
  // Lower all other budgets only as far as needed to isolate this exact ceiling.
  // Day-attempt scenarios advance UTC minutes; token scenarios use a verified reservation of the full residual.
  const s = await store();
  const count = budget === "dayTokens" ? Math.ceil(ceiling / 40000) : ceiling;
  let consumed = 0;
  for (let i = 0; i < count; i++) {
    if (budget !== "minuteAttempts" && i > 0) time += 60000;
    const account = scope === "account" ? accounts.authorA.id : accounts[accountKeys[i % accountKeys.length]].id;
    const tokens = budget === "dayTokens" ? Math.min(40000, ceiling - consumed) : 1;
    await completed(s, reservation(account, { inputTokens: Math.max(0, tokens - 8192), outputTokens: Math.min(tokens, 8192) }), { inputTokens: Math.max(0, tokens - 8192), outputTokens: Math.min(tokens, 8192) });
    consumed += tokens;
  }
  const account = scope === "account" ? accounts.authorA.id : accounts.taB.id;
  const before = await s.read({ accountId: account });
  expect(before[scope][budget]).toBe(ceiling);
  await expect(s.reserve(reservation(account, { inputTokens: 0, outputTokens: 1 }))).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect((await s.read({ accountId: account }))[scope][budget]).toBe(ceiling);
});
it.each([
  ["account", "minuteAttempts"], ["account", "dayAttempts"], ["account", "dayTokens"],
  ["environment", "minuteAttempts"], ["environment", "dayAttempts"], ["environment", "dayTokens"],
] as const)("SEC-05.1 races the last %s %s unit across independent committed connections", async (scope, budget) => {
  nextWindow();
  const ceiling = budget === "dayTokens" ? 150 : 1;
  const cap = { [scope]: { ...limits[scope], [budget]: ceiling } };
  const a = await store(cap); const b = await store(cap);
  const secondAccount = scope === "account" ? accounts.authorA.id : accounts.authorB.id;
  const results = await Promise.allSettled([a.reserve(reservation()), b.reserve(reservation(secondAccount))]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  // Account concurrency remains at its hard ceiling of one. Equality of the
  // resulting budget charge verifies admission at the last budget unit too.
  expect((await a.read({ accountId: accounts.authorA.id }))[scope][budget]).toBe(ceiling);
  for (const result of results) {
    if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "RATE_LIMITED" });
    else {
      await a.settle({ reservationId: result.value.reservationId, outcome: "not_dispatched" });
      await a.close({ operationId: result.value.operationId, outcome: "failed" });
    }
  }
});
it("SEC-05.1 identical concurrent keys acquire one durable reservation and replay without charging again", async () => {
  nextWindow();
  const a = await store(); const b = await store(); const request = reservation();
  const result: { status: string; operationId: string; reservationId: string }[] = await Promise.all([a.reserve(request), b.reserve(request)]);
  expect(result.filter(r => r.status === "reserved")).toHaveLength(1);
  expect(result.filter(r => r.status === "in_progress")).toHaveLength(1);
  const winner = result.find(r => r.status === "reserved")!;
  await a.markDispatched({ reservationId: winner.reservationId });
  await a.settle({ reservationId: winner.reservationId, outcome: "verified", usage: { inputTokens: 100, outputTokens: 20 } });
  await a.close({ operationId: winner.operationId, outcome: "completed" });
  expect(await b.reserve(request)).toMatchObject({ status: "replay", operationId: winner.operationId });
  expect((await b.read({ accountId: request.accountId })).account).toMatchObject({ dayAttempts: 1, dayTokens: 120, active: 0 });
  await expect(b.reserve({ ...request, fingerprint: "changed-payload" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});
it.each(["verified", "uncertain", "not_dispatched"] as const)("SEC-05.2 %s settlement is once-only across connections and survives reconstruction", async outcome => {
  nextWindow();
  const a = await store(); const b = await store(); const request = reservation();
  const admitted = await a.reserve(request);
  if (outcome !== "not_dispatched") await a.markDispatched({ reservationId: admitted.reservationId });
  const settlement = { reservationId: admitted.reservationId, outcome, usage: outcome === "verified" ? { inputTokens: 100, outputTokens: 20 } : undefined };
  await Promise.all([a.settle(settlement), b.settle(settlement)]);
  await a.close({ operationId: admitted.operationId, outcome: "completed" });
  // Contradictory late settlement cannot refund a previously charged attempt.
  if (outcome !== "not_dispatched") await expect(b.settle({ reservationId: admitted.reservationId, outcome: "not_dispatched" })).rejects.toThrow();
  const read = await (await store()).read({ accountId: request.accountId });
  expect(read.account).toMatchObject({ active: 0, dayAttempts: outcome === "not_dispatched" ? 0 : 1,
    dayTokens: outcome === "verified" ? 120 : outcome === "uncertain" ? 150 : 0 });
});
it("SEC-05.2 dispatched reservations cannot claim known-unused release or usage exceeding their charge", async () => {
  nextWindow(); const s = await store(); const r = await s.reserve(reservation());
  await s.markDispatched({ reservationId: r.reservationId });
  await expect(s.settle({ reservationId: r.reservationId, outcome: "not_dispatched" })).rejects.toThrow();
  await expect(s.settle({ reservationId: r.reservationId, outcome: "verified", usage: { inputTokens: 101, outputTokens: 50 } })).rejects.toThrow();
  await s.settle({ reservationId: r.reservationId, outcome: "uncertain" });
  await s.close({ operationId: r.operationId, outcome: "failed" });
});
it("SEC-04.2 UTC rollover retains active slots and settlement belongs to reservation windows", async () => {
  time = Date.parse("2026-05-01T23:59:59Z");
  const s = await store(); const r = await s.reserve(reservation());
  await s.markDispatched({ reservationId: r.reservationId });
  time += 1000;
  const read = await (await store()).read({ accountId: accounts.authorA.id });
  expect(read.account).toMatchObject({ active: 1, dayAttempts: 0, dayTokens: 0 });
  await expect(s.reserve(reservation())).rejects.toMatchObject({ code: "RATE_LIMITED" });
  await s.settle({ reservationId: r.reservationId, outcome: "verified", usage: { inputTokens: 100, outputTokens: 20 } });
  await s.close({ operationId: r.operationId, outcome: "completed" });
  const history = await s.read({ accountId: accounts.authorA.id, at: Date.parse("2026-05-01T23:59:59Z") });
  expect(history.account).toMatchObject({ dayAttempts: 1, dayTokens: 120 });
  expect((await s.read({ accountId: accounts.authorA.id })).account.dayTokens).toBe(0);
});
it.each([34999, 35000, 35001])("SEC-05.2 expiry at %sms frees slots, charges uncertainty and rejects late settlement", async elapsed => {
  nextWindow(); const s = await store(); const start = time; const r = await s.reserve(reservation());
  await s.markDispatched({ reservationId: r.reservationId });
  time = start + elapsed; await s.expire();
  const read = await s.read({ accountId: accounts.authorA.id });
  if (elapsed < 35000) {
    expect(read.account.active).toBe(1);
    time = start + 35000; await s.expire();
  }
  expect((await s.read({ accountId: accounts.authorA.id })).account).toMatchObject({ active: 0, dayTokens: 150, dayAttempts: 1 });
  await expect(s.settle({ reservationId: r.reservationId, outcome: "verified", usage: { inputTokens: 1, outputTokens: 1 } })).rejects.toMatchObject({ code: "INVALID_STATE" });
});

it("SYS-10.1 all accounting tables have RLS, explicit grants and no anonymous/admin direct table access", async () => {
  const { tables: domainTables } = await import("../domain/fixture");
  const known = [...domainTables, "profiles", "profile_roles", "submission_audit_orders"];
  const catalog = await h.db.query<{ oid: number; schema: string; name: string; rls: boolean }>(`
    select c.oid,n.nspname as schema,c.relname as name,c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r' and not (c.relname=any($1::text[]))
  `, [known]);
  expect(catalog.rows.some(row => row.name === "ai_usage_records"), "durable usage table").toBe(true);
  for (const row of catalog.rows) {
    expect(row.rls, row.name).toBe(true);
    for (const role of ["anon", "authenticated", "service_role"]) {
      const grants = await h.db.query<{ read: boolean; write: boolean }>(`
        select has_table_privilege($1,$2::oid,'SELECT') or has_any_column_privilege($1,$2::oid,'SELECT') as read,
          has_table_privilege($1,$2::oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          or has_any_column_privilege($1,$2::oid,'INSERT,UPDATE,REFERENCES') as write
      `, [role, row.oid]);
      expect(grants.rows[0].write, `${role} mutations ${row.name}`).toBe(false);
      if (role !== "authenticated") expect(grants.rows[0].read, `${role} reads ${row.name}`).toBe(false);
    }
  }
  const functions = await h.db.query<{ identity: string; admin: boolean; anonymous: boolean; user: boolean }>(`
    select p.oid::regprocedure::text as identity,
      has_function_privilege('service_role',p.oid,'EXECUTE') as admin,
      has_function_privilege('anon',p.oid,'EXECUTE') as anonymous,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as user
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind='f'
      and (p.proname ~ '(llm|ai_usage|accounting|reserve_ai|settle_ai|dispatch_ai|expire_ai)'
        or exists (select from unnest($1::text[]) as t(name) where position(t.name in p.prosrc)>0))
  `, [catalog.rows.map(row => row.name)]);
  expect(functions.rows.length, "dedicated atomic accounting functions").toBeGreaterThan(0);
  for (const fn of functions.rows) {
    expect(fn.anonymous, fn.identity).toBe(false); expect(fn.user, fn.identity).toBe(false);
    // Trigger-only validation functions need not be granted to admin. At least
    // the actual reservation path below must execute successfully as service_role.
  }
  nextWindow();
  await completed(await store());
});
it("SYS-12.5 direct clients cannot insert, spoof, update, delete or reset accounting", async () => {
  nextWindow(); const s = await store(); await completed(s);
  const before = await s.read({ accountId: accounts.authorA.id });
  const table = await h.db.query<{ schema: string; name: string }>(`
    select n.nspname as schema,c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relname='ai_usage_records' and c.relkind='r'
  `);
  expect(table.rows).toHaveLength(1);
  const { quote } = await import("../domain/fixture");
  const target = `${quote(table.rows[0].schema)}.${quote(table.rows[0].name)}`;
  for (const caller of [...accountKeys, "anon"] as const) {
    const db = await h.connection(caller === "anon" ? "anon" : "authenticated", caller === "anon" ? undefined : accounts[caller].id);
    await expect(db.query(`insert into ${target} default values`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.query(`delete from ${target}`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.query(`truncate ${target}`)).rejects.toMatchObject({ code: "42501" });
    // Discover an actual column so failure demonstrates privilege denial,
    // rather than referencing a fabricated accounting column.
    const column = await h.db.query<{ attname: string }>("select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped order by attnum limit 1", [target]);
    const name = quote(column.rows[0].attname);
    await expect(db.query(`update ${target} set ${name}=${name}`)).rejects.toMatchObject({ code: "42501" });
  }
  expect(await s.read({ accountId: accounts.authorA.id })).toEqual(before);
});
it("SYS-12.1 direct usage reads obey own-only RLS for two users per role and anonymous", async () => {
  nextWindow(); const s = await store();
  for (const account of Object.values(accounts)) await completed(s, reservation(account.id));
  const rows = await h.db.query<{ oid: number; schema: string; name: string }>(`
    select c.oid,n.nspname as schema,c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relname='ai_usage_records' and c.relkind='r'
  `);
  expect(rows.rows).toHaveLength(1);
  const target = rows.rows[0]; const { quote } = await import("../domain/fixture");
  for (const caller of [...accountKeys, "anon"] as const) {
    const role = caller === "anon" ? "anon" : "authenticated";
    const columns = await h.db.query<{ attname: string }>(`
      select a.attname from pg_attribute a where a.attrelid=$1 and a.attnum>0 and not a.attisdropped
        and has_column_privilege($2,a.attrelid,a.attnum,'SELECT')
    `, [target.oid, role]);
    if (!columns.rows.length) continue; // Function/view-only projection; boundary.readUsage covers successful reads.
    const db = await h.connection(role, caller === "anon" ? undefined : accounts[caller].id);
    const result = await db.query(`select ${columns.rows.map(c => quote(c.attname)).join(",")} from ${quote(target.schema)}.${quote(target.name)}`);
    const json = JSON.stringify(result.rows);
    if (caller === "anon") expect(result.rows).toHaveLength(0);
    for (const other of accountKeys.filter(key => key !== caller)) expect(json).not.toContain(accounts[other].id);
    expect(json).not.toMatch(/prompt|apiKey|private_answer|working_code/i);
  }
});
it("SEC-05.3 retry reserves its own attempt and tokens within the same active operation", async () => {
  nextWindow(); const s = await store(); const request = reservation();
  const first = await s.reserve(request);
  await s.markDispatched({ reservationId: first.reservationId });
  await s.settle({ reservationId: first.reservationId, outcome: "verified", usage: { inputTokens: 100, outputTokens: 20 } });
  const retry = await s.reserve({ ...request, operationId: first.operationId });
  expect(retry.status).toBe("reserved"); expect(retry.operationId).toBe(first.operationId);
  expect(retry.reservationId).not.toBe(first.reservationId);
  expect((await s.read({ accountId: request.accountId })).account).toMatchObject({ active: 1, dayAttempts: 2, dayTokens: 270 });
  await s.markDispatched({ reservationId: retry.reservationId });
  await s.settle({ reservationId: retry.reservationId, outcome: "uncertain" });
  await expect(s.reserve({ ...request, operationId: first.operationId })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  await s.close({ operationId: first.operationId, outcome: "failed" });
});
it("SEC-04.2 account budgets aggregate mixed operation kinds rather than granting each operation its own quota", async () => {
  nextWindow(); const s = await store();
  for (const operation of ["inject_flaws", "generate_hints", "assess_review", "summarize_learner"]) {
    await completed(s, reservation(accounts.authorA.id, { operation }));
  }
  await expect(s.reserve(reservation(accounts.authorA.id, { operation: "generate_hints" }))).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect((await s.read({ accountId: accounts.authorA.id })).account.minuteAttempts).toBe(4);
});
it("SEC-05.2 abandoned dispatched usage remains fully charged after accounting transport fails", async () => {
  nextWindow(); const db = await h.connection();
  const s = createAccountingStore({ db, clock, environmentId: "t04-llm-acceptance", limits });
  const first = await s.reserve(reservation()); await s.markDispatched({ reservationId: first.reservationId });
  const query = vi.spyOn(db, "query").mockImplementationOnce(() => { throw new Error("injected settlement disconnect"); });
  await expect(s.settle({ reservationId: first.reservationId, outcome: "verified", usage: { inputTokens: 1, outputTokens: 1 } })).rejects.toThrow();
  query.mockRestore();
  time += 35000;
  const reconstructed = await store(); await reconstructed.expire();
  expect((await reconstructed.read({ accountId: accounts.authorA.id })).account).toMatchObject({ active: 0, dayAttempts: 1, dayTokens: 150 });
});
