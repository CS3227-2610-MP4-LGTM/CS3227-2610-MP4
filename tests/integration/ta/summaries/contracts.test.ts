// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/ta/learners/[id]/summary/route";
import { POST } from "@/app/api/v1/ta/learners/[id]/summaries/route";
import type { Provider } from "@/server/llm/provider";
import { envelope } from "../../../unit/server/llm/fixtures";
import { id, summary } from "../../../unit/ta/summaries/evidence";
import { answers } from "../../../unit/ta/inspection/evidence";
import { createSummaryFixture } from "./fixture";
const mocks = vi.hoisted(() => ({ user: null as SupabaseClient | null, admin: vi.fn(), execute: vi.fn<Provider["execute"]>() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => { if (!mocks.user) throw new Error("Missing local caller"); return mocks.user; } }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/llm/provider", async original => ({ ...await original<typeof import("@/server/llm/provider")>(), createFakeProvider: () => ({ execute: mocks.execute }) }));
let f: Awaited<ReturnType<typeof createSummaryFixture>>;
type Caller = keyof Awaited<ReturnType<typeof createSummaryFixture>>["actors"] | "anon";
beforeAll(async () => { f = await createSummaryFixture(); });
beforeEach(async () => {
  vi.stubEnv("APP_ENV", "test"); vi.stubEnv("AI_PROVIDER", "fake");
  await f.clearGenerated(); mocks.admin.mockReset().mockReturnValue(f.h.admin); mocks.execute.mockReset().mockResolvedValue(result());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => { mocks.user = null; await f?.dispose(); });
function result(output = summary().output): Awaited<ReturnType<Provider["execute"]>> {
  return { output: envelope("summarize_learner", output), usage: { inputTokens: 100, outputTokens: 30, verified: true } };
}
async function call(caller: Caller = "taA", method = "GET", learnerId = id(11), key = randomUUID(), body = "{}") {
  mocks.user = caller === "anon" ? f.h.client() : f.actors[caller].client;
  const actor = caller === "anon" ? "" : f.actors[caller].id;
  const request = new Request(`http://localhost/api/v1/ta/learners/${learnerId}/${method === "GET" ? "summary" : "summaries"}`, {
    method, headers: { Origin: "http://localhost", "Content-Type": "application/json", "Idempotency-Key": key, "X-LGTM-Workspace-Account-Id": actor },
    ...(method === "GET" ? {} : { body }),
  });
  const response = await (method === "GET" ? GET : POST)(request, { params: Promise.resolve({ id: learnerId }) });
  expect(response.headers.get("cache-control")).toContain("no-store");
  return { status: response.status, body: await response.json() };
}
async function data(response: Awaited<ReturnType<typeof call>>, http = 200) {
  expect(response.status).toBe(http); expect(Object.keys(response.body)).toEqual(["data"]); return response.body.data;
}
async function counts() {
  return (await f.h.db.query(`select (select count(*)::int from public.performance_summaries where learner_id=$1) summaries,
    (select count(*)::int from public.performance_summary_evidence e join public.performance_summaries s on s.id=e.summary_id where s.learner_id=$1) evidence,
    (select count(*)::int from private.llm_operations where account_id in($2,$3)) operations`, [id(11), id(21), id(22)])).rows[0];
}
async function protectedState() {
  const state = await f.snapshot();
  for (const key of ["performance_summaries", "performance_summary_evidence", "llm_operations", "ai_usage_records", "llm_usage_events"]) delete state[key];
  return state;
}
it.each(["taA", "taB"] as const)("TA-04.3 SYS-12.2 %s reads null without reservation, generation or any database mutation", async caller => {
  const before = await f.snapshot(); expect(await data(await call(caller))).toEqual({ summary: null, stale: false });
  expect(await f.snapshot()).toEqual(before); expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
});
it.each(["authorA", "authorB", "learnerA", "learnerB", "anon"] as const)("SYS-08.3 SYS-12.5 SEC-01.1 %s cannot read or generate summaries through direct routes", async caller => {
  const before = await f.snapshot();
  for (const method of ["GET", "POST"]) {
    const response = await call(caller, method); expect(response.status).toBe(caller === "anon" ? 401 : 403);
    expect(response.body).toEqual({ error: expect.objectContaining({ code: caller === "anon" ? "UNAUTHENTICATED" : "FORBIDDEN" }) });
    expect(JSON.stringify(response.body)).not.toMatch(/Learner A|Checkout|@example\.test|inputFingerprint/);
  }
  expect(await f.snapshot()).toEqual(before); expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
});
it.each([[1, 403, "FORBIDDEN"], [21, 403, "FORBIDDEN"], [999, 404, "NOT_FOUND"]] as const)("SYS-08.3 SEC-01.1 rejects target %s before reservation or dispatch", async (target, http, code) => {
  const before = await f.snapshot();
  for (const method of ["GET", "POST"]) expect(await call("taA", method, id(target))).toMatchObject({ status: http, body: { error: { code } } });
  expect(await f.snapshot()).toEqual(before); expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
});
it("TA-04.5 SYS-03.3 SYS-10.3 SEC-01.2 atomically persists validated output and every evidence row with exact authorized input", async () => {
  const before = await protectedState(); const rpc = vi.spyOn(f.h.admin, "rpc");
  const stored = await data(await call("taA", "POST"), 201);
  expect(Object.keys(stored).sort()).toEqual(["createdAt", "id", "inputFingerprint", "learnerId", "output"]);
  expect(stored).toMatchObject({ learnerId: id(11), output: summary().output, inputFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) });
  expect(Number.isNaN(Date.parse(stored.createdAt))).toBe(false); expect(mocks.execute).toHaveBeenCalledTimes(1);
  const request = mocks.execute.mock.calls[0][0]; expect(request.data.operation).toBe("summarize_learner");
  const payload = request.data.operation === "summarize_learner" ? request.data.payload : null; expect(payload).not.toBeNull();
  expect(Object.keys(payload!).sort()).toEqual(["progress", "submissions"]);
  expect(payload!.submissions.map(s => s.submissionId)).toEqual([id(501), id(502)]);
  expect(payload!.submissions[0]).toMatchObject({ originalScore: 25, effectiveScore: 70, attemptNumber: 1, comments: [
    { commentId: id(601), body: expect.any(String), feedback: "The consequence and proposed fix are clear." },
    { commentId: id(602), body: expect.any(String), feedback: null },
  ] });
  expect(payload!.submissions[1]).toMatchObject({ originalScore: 100, effectiveScore: 100, attemptNumber: 2 });
  for (const s of payload!.submissions) expect(Object.keys(s).sort()).toEqual(["attemptNumber", "categories", "comments", "effectiveScore", "originalScore", "revisionId", "submissionId", "submittedAt"]);
  expect(payload!.progress.categories.slice(0, 2)).toEqual([
    { category: "logic_bug", totalFlaws: 1, identifiedFlaws: 1, identificationRate: 1, completedFirstAttempts: 1 },
    { category: "edge_case", totalFlaws: 1, identifiedFlaws: 0, identificationRate: 0, completedFirstAttempts: 1 },
  ]);
  const serialized = JSON.stringify(payload); expect(serialized).not.toMatch(/Learner A|@example\.test|"email"|"displayName"|"workingCode"|"explanation"|"fix"|"line"|"flawId"/);
  expect(serialized).not.toContain(id(503)); for (const answer of answers) { expect(serialized).not.toContain(answer.explanation); expect(serialized).not.toContain(answer.fix); }
  expect(request.capabilities).toEqual({ tools: false, browsing: false, codeExecution: false, callbacks: false });
  const evidence = await f.h.db.query("select item_kind,item_ordinal,submission_id from public.performance_summary_evidence where summary_id=$1 order by item_kind,item_ordinal,submission_id", [stored.id]);
  expect(evidence.rows).toEqual([{ item_kind: "blindSpots", item_ordinal: 0, submission_id: id(501) }, { item_kind: "nextSteps", item_ordinal: 0, submission_id: id(501) }]);
  const attribution = await f.h.db.query("select requested_by from public.performance_summaries where id=$1", [stored.id]); expect(attribution.rows[0].requested_by).toBe(id(21));
  expect(rpc.mock.calls.some(([name]) => name === "persist_ta_summary")).toBe(true);
  expect(await data(await call("taB"))).toEqual({ summary: stored, stale: false }); expect(mocks.execute).toHaveBeenCalledTimes(1);
  expect(await protectedState()).toEqual(before);
});
it("TA-04.4 retained freshness follows effective overrides and not generated age; regeneration appends immutable history", async () => {
  const first = await data(await call("taA", "POST"), 201);
  // Alter only the stored timestamp under test-owner trigger suspension: age
  // alone cannot alter fingerprint freshness.
  await f.h.db.query("begin"); await f.h.db.query("set local session_replication_role=replica");
  await f.h.db.query("update public.performance_summaries set created_at='2000-01-01T00:00:00Z' where id=$1", [first.id]); await f.h.db.query("commit");
  expect((await data(await call())).stale).toBe(false);
  mocks.user = f.actors.taB.client;
  const { POST: overridePost } = await import("@/app/api/v1/ta/submissions/[id]/overrides/route");
  const response = await overridePost(new Request(`http://localhost/api/v1/ta/submissions/${id(501)}/overrides`, { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json", "Idempotency-Key": randomUUID() }, body: JSON.stringify({ score: 75, reason: "A second justified assessment." }) }), { params: Promise.resolve({ id: id(501) }) });
  expect(response.status).toBe(201);
  expect((await data(await call())).stale).toBe(true); expect(mocks.execute).toHaveBeenCalledTimes(1);
  const next = await data(await call("taB", "POST"), 201); expect(next.id).not.toBe(first.id); expect(next.inputFingerprint).not.toBe(first.inputFingerprint);
  expect((await data(await call())).stale).toBe(false); expect((await counts()).summaries).toBe(2);
  expect((await f.h.db.query("select output from public.performance_summaries where id=$1", [first.id])).rows[0].output).toEqual(first.output);
});
it("TA-04.4 SEC-01.2 latest-20 selection excludes older rows while all-history progress still affects freshness", async () => {
  const rows = [];
  for (let n = 0; n < 21; n++) rows.push(await f.completed(560000 + n * 10, new Date(Date.UTC(2026, 1, 1, 0, 0, Math.floor(n / 2))).toISOString()));
  const all = [...rows].sort((a, b) => b.at.localeCompare(a.at) || a.submissionId.localeCompare(b.submissionId));
  const evidenceId = all[0].submissionId;
  mocks.execute.mockResolvedValue(result({ strengths: [], blindSpots: [{ category: "logic_bug", text: "Check logic across first attempts.", submissionIds: [evidenceId] }], nextSteps: [] }));
  await data(await call("taA", "POST"), 201);
  const request = mocks.execute.mock.calls[0][0].data; if (request.operation !== "summarize_learner") throw new Error("Wrong operation");
  expect(request.payload.submissions.map(s => s.submissionId)).toEqual(all.slice(0, 20).map(s => s.submissionId));
  expect(request.payload.progress.categories[0]).toMatchObject({ totalFlaws: 22, identifiedFlaws: 1, completedFirstAttempts: 22 });
  await f.completed(561000, "2025-12-01T00:00:00Z");
  expect((await data(await call())).stale).toBe(true); expect(mocks.execute).toHaveBeenCalledTimes(1);
});
it("TA-04.6 a learner with no completed submissions is rejected before reservation or provider dispatch", async () => {
  const before = await f.snapshot(); const response = await call("taA", "POST", id(31));
  expect(response).toMatchObject({ status: 409, body: { error: { code: "INVALID_STATE" } } });
  expect(await f.snapshot()).toEqual(before); expect(mocks.execute).not.toHaveBeenCalled();
});
it("SEC-05.1 TA-04.7 duplicate in-flight keys dispatch once and replay the committed result after a lost reply", async () => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); const key = randomUUID();
  mocks.execute.mockImplementationOnce(async () => { entered.resolve(); await release.promise; return result(); });
  const running = call("taA", "POST", id(11), key);
  try {
    await Promise.race([entered.promise, running.then(value => { throw new Error(`Returned ${value.status} before dispatch`); })]);
    expect(await call("taA", "POST", id(11), key)).toMatchObject({ status: 409, body: { error: { code: "INVALID_STATE" } } });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  } finally { release.resolve(); }
  const committed = await running; expect(committed.status).toBe(201);
  expect(await call("taA", "POST", id(11), key)).toEqual(committed); expect(mocks.execute).toHaveBeenCalledTimes(1);
  expect(await counts()).toMatchObject({ summaries: 1, evidence: 2, operations: 1 });
});
it.each(["foreign", "category", "all-empty", "unknown-field"] as const)("SEC-02.1 TA-04.6 invalid %s output never persists even after the allowed provider retry", async kind => {
  const previous = await data(await call("taA", "POST"), 201); const invalid = result();
  const output = invalid.output as { payload: Record<string, unknown> }; const item = { category: "edge_case", text: "Unsafe summary.", submissionIds: [id(501)] };
  output.payload = { strengths: [], blindSpots: [kind === "foreign" ? { ...item, submissionIds: [id(503)] } : kind === "category" ? { ...item, category: "security" } : item], nextSteps: [] };
  if (kind === "all-empty") output.payload.blindSpots = []; if (kind === "unknown-field") output.payload.score = 100;
  mocks.execute.mockResolvedValue(invalid); const rejected = await call("taA", "POST");
  expect(rejected).toMatchObject({ status: 422, body: { error: { code: "INVALID_AI_OUTPUT" } } });
  expect(mocks.execute).toHaveBeenCalledTimes(3); expect((await counts()).summaries).toBe(1);
  expect((await data(await call())).summary).toEqual(previous);
});
it.each([["AI_UNAVAILABLE", 502], ["AI_TIMEOUT", 504]] as const)("SEC-06.1 TA-04.6 %s preserves a prior summary and exposes no provider diagnostics", async (code, http) => {
  const previous = await data(await call("taA", "POST"), 201);
  const sentinel = "SENTINEL_SOURCE_PRIVATE_ANSWER_CREDENTIAL"; const logs = vi.spyOn(console, "error").mockImplementation(() => {});
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {}); const traces = vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.execute.mockRejectedValueOnce(Object.assign(new Error(sentinel), { code }));
  const failed = await call("taA", "POST"); expect(failed).toMatchObject({ status: http, body: { error: { code } } });
  expect(JSON.stringify([failed, logs.mock.calls, warnings.mock.calls, traces.mock.calls])).not.toContain(sentinel);
  expect((await data(await call())).summary).toEqual(previous); expect(mocks.execute).toHaveBeenCalledTimes(2);
});
it("SEC-05.3 TA-04.7 an invalid output retries once, confirmed failures replay without dispatch and a new key permits a new explicit attempt", async () => {
  mocks.execute.mockResolvedValueOnce({ ...result(), output: envelope("summarize_learner", {}) }).mockResolvedValueOnce(result());
  await data(await call("taA", "POST"), 201); expect(mocks.execute).toHaveBeenCalledTimes(2);
  const key = randomUUID(); mocks.execute.mockRejectedValueOnce(Object.assign(new Error("Failure"), { code: "AI_UNAVAILABLE" }));
  const failure = await call("taA", "POST", id(11), key); expect(failure.status).toBe(502);
  expect(await call("taA", "POST", id(11), key)).toEqual(failure); expect(mocks.execute).toHaveBeenCalledTimes(3);
  await data(await call("taA", "POST"), 201); expect(mocks.execute).toHaveBeenCalledTimes(4);
});
it("SYS-10.3 SEC-05.2 failed accounting and failed evidence persistence cannot replace the prior summary or store partial rows", async () => {
  const previous = await data(await call("taA", "POST"), 201); const original = f.h.admin.rpc.bind(f.h.admin);
  const rpc = vi.spyOn(f.h.admin, "rpc");
  rpc.mockImplementation((name, args, options) => name === "llm_accounting" && args?.action === "settle"
    ? Promise.resolve({ data: null, error: { message: "SENTINEL_SETTLEMENT_DIAGNOSTIC" } }) as never : original(name, args, options));
  const failed = await call("taA", "POST"); expect(failed.status).toBe(503); expect(JSON.stringify(failed)).not.toContain("SENTINEL");
  expect((await data(await call())).summary).toEqual(previous); expect(await counts()).toMatchObject({ summaries: 1, evidence: 2 });
  rpc.mockRestore(); await f.clearGenerated();
  const restored = await data(await call("taA", "POST"), 201);
  await f.h.db.query(`create function public.t33_reject_summary_evidence() returns trigger language plpgsql as $$begin
    if exists(select 1 from public.performance_summaries where id=new.summary_id and learner_id='${id(11)}'::uuid) then raise exception 'SENTINEL_EVIDENCE_DIAGNOSTIC'; end if;
    return new; end$$`);
  await f.h.db.query("create trigger t33_reject_summary_evidence before insert on public.performance_summary_evidence for each row execute function public.t33_reject_summary_evidence()");
  try {
    const rejected = await call("taA", "POST"); expect(rejected.status).toBe(503); expect(JSON.stringify(rejected)).not.toContain("SENTINEL");
    expect((await data(await call())).summary).toEqual(restored); expect(await counts()).toMatchObject({ summaries: 1, evidence: 2 });
  } finally {
    await f.h.db.query("drop trigger t33_reject_summary_evidence on public.performance_summary_evidence"); await f.h.db.query("drop function public.t33_reject_summary_evidence()");
  }
});
it("SEC-05.2 TA-04.6 a late provider result cannot create summary rows after durable operation expiry", async () => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  mocks.execute.mockImplementationOnce(async () => { entered.resolve(); await release.promise; return result(); });
  const running = call("taA", "POST");
  try {
    await Promise.race([entered.promise, running.then(value => { throw new Error(`Returned ${value.status} before dispatch`); })]);
    await f.h.db.query("update private.llm_operations set expires_at=clock_timestamp()-interval '1 second' where account_id=$1 and state='active'", [id(21)]);
  } finally { release.resolve(); }
  const late = await running; expect([409, 504]).toContain(late.status); expect(await counts()).toMatchObject({ summaries: 0, evidence: 0 });
});
it("SYS-10.1 SYS-10.3 SYS-12.5 admin summary RPC has an empty search path and only service_role EXECUTE; users cannot forge generated writes", async () => {
  const signature = "public.persist_ta_summary(jsonb)";
  const fn = await f.h.db.query("select prosecdef,proconfig from pg_proc where oid=to_regprocedure($1)", [signature]);
  expect(fn.rows).toEqual([{ prosecdef: true, proconfig: expect.arrayContaining(['search_path=""']) }]);
  for (const [role, allowed] of [["service_role", true], ["authenticated", false], ["anon", false]] as const) {
    expect((await f.h.db.query("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, signature])).rows[0].allowed).toBe(allowed);
  }
  const acl = await f.h.db.query("select exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=to_regprocedure($1) and a.grantee=0 and a.privilege_type='EXECUTE') allowed", [signature]);
  expect(acl.rows[0].allowed).toBe(false);
  const spy = vi.spyOn(f.h.admin, "rpc"); const stored = await data(await call("taA", "POST"), 201);
  const persisted = spy.mock.calls.find(([name]) => name === "persist_ta_summary"); expect(persisted).toBeDefined();
  const args = persisted![1]!; expect(Object.keys(args)).toEqual(["p_input"]);
  const before = await counts();
  const replay = await f.h.admin.rpc("persist_ta_summary", args); expect(replay.error).toBeNull(); expect(await counts()).toEqual(before);
  for (const [caller, actor] of Object.entries(f.actors)) {
    const allowed = caller.startsWith("ta");
    const rows = await actor.client.from("performance_summaries").select("id,output").eq("id", stored.id);
    expect((rows.data ?? []).map(row => row.id)).toEqual(allowed ? [stored.id] : []);
    const evidence = await actor.client.from("performance_summary_evidence").select("summary_id,submission_id").eq("summary_id", stored.id);
    expect((evidence.data ?? []).length).toBe(allowed ? 2 : 0);
    expect((await actor.client.rpc("persist_ta_summary", args)).error).not.toBeNull();
    expect((await actor.client.from("performance_summaries").insert({ learner_id: id(11), requested_by: actor.id, input_fingerprint: "forged", output: summary().output })).error).not.toBeNull();
    await actor.client.from("performance_summaries").update({ output: summary().output }).eq("id", stored.id);
    await actor.client.from("performance_summaries").delete().eq("id", stored.id);
    expect((await actor.client.from("performance_summary_evidence").insert({ summary_id: stored.id, item_kind: "blindSpots", item_ordinal: 4, submission_id: id(503) })).error).not.toBeNull();
  }
  const anon = f.h.client(); expect((await anon.from("performance_summaries").select("*")).data ?? []).toEqual([]);
  expect((await anon.rpc("persist_ta_summary", args)).error).not.toBeNull();
  for (const table of ["performance_summaries", "performance_summary_evidence"]) for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
    expect((await f.h.db.query("select has_table_privilege('service_role',$1,$2) allowed", [`public.${table}`, privilege])).rows[0].allowed).toBe(false);
  }
  for (const table of ["performance_summaries", "performance_summary_evidence"]) {
    const columns = await f.h.db.query<{ attname: string }>("select attname from pg_attribute where attrelid=to_regclass($1) and attnum>0 and not attisdropped order by attnum", [`public.${table}`]);
    expect(columns.rows.length).toBeGreaterThan(0);
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"]) for (const { attname } of columns.rows) {
      expect((await f.h.db.query("select has_column_privilege('service_role',$1,$2,$3) allowed", [`public.${table}`, attname, privilege])).rows[0].allowed).toBe(false);
    }
  }
  for (const invalid of [{}, { requestedBy: id(11), learnerId: id(11), output: summary().output },
    { requestedBy: id(21), learnerId: id(11), operationId: randomUUID(), idempotencyKey: randomUUID(), inputFingerprint: "f".repeat(64), output: summary().output }]) {
    expect((await f.h.admin.rpc("persist_ta_summary", { p_input: invalid })).error).not.toBeNull();
  }
  expect(await counts()).toEqual(before); expect((await data(await call())).summary).toEqual(stored);
});
it("SEC-04.1 TA-04.6 oversized authorized evidence is rejected whole before reservation and dispatch", async () => {
  // 20 retained attempts with bounded comments exceed the input token cap;
  // each individual persisted comment still satisfies Text(2000).
  for (let n = 0; n < 20; n++) {
    const attempt = await f.completed(570000 + n * 10, new Date(Date.UTC(2026, 2, 1, 0, 0, n)).toISOString());
    for (let ordinal = 0; ordinal < 2; ordinal++) await f.h.db.query("insert into public.submission_comments(id,submission_id,ordinal,line,body) values($1,$2,$3,3,$4)", [id(590000 + n * 10 + ordinal), attempt.submissionId, ordinal, "界".repeat(2000)]);
  }
  const rejected = await call("taA", "POST"); expect(rejected).toMatchObject({ status: 413, body: { error: { code: "PAYLOAD_TOO_LARGE" } } });
  expect(mocks.execute).not.toHaveBeenCalled(); expect(await counts()).toMatchObject({ summaries: 0, evidence: 0, operations: 0 });
});
it("SEC-04.2 TA-04.6 exhausted account attempt budget rejects generation without dispatch and retains previous result", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.now());
  const previous = await data(await call("taA", "POST"), 201);
  // Four admitted requests exhaust only this account's UTC-minute ceiling.
  for (let n = 0; n < 3; n++) await data(await call("taA", "POST"), 201);
  expect(await call("taA", "POST")).toMatchObject({ status: 429, body: { error: { code: "RATE_LIMITED" } } });
  expect(mocks.execute).toHaveBeenCalledTimes(4); expect((await counts()).summaries).toBe(4);
  const latest = (await data(await call())).summary; expect(latest).not.toBeNull(); expect(latest.output).toEqual(previous.output);
});
