// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createInspectionFixture } from "./fixture";
import { code, id, submission } from "../../../unit/ta/inspection/evidence";
const context = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => {
  if (!context.client) throw new Error("Missing local test caller"); return context.client;
} }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: () => { throw new Error("TA inspection must remain user-scoped"); } }));
vi.mock("@/server/llm/boundary", () => ({ createLlmBoundary: () => { throw new Error("Inspection cannot start AI work"); } }));
let fixture: Awaited<ReturnType<typeof createInspectionFixture>>;
let anon: SupabaseClient;
type Caller = keyof Awaited<ReturnType<typeof createInspectionFixture>>["actors"] | "anon";
beforeAll(async () => { fixture = await createInspectionFixture(); anon = fixture.h.client(); });
afterAll(async () => { context.client = null; await fixture?.dispose(); });
const clientFor = (caller: Caller) => caller === "anon" ? anon : fixture.actors[caller].client;
async function list(caller: Caller, query = "") {
  context.client = clientFor(caller);
  const { GET } = await import("@/app/api/v1/ta/submissions/route");
  return GET(new Request(`http://localhost/api/v1/ta/submissions?${query}`));
}
async function detail(caller: Caller, submissionId = id(501), query = "") {
  context.client = clientFor(caller);
  const { GET } = await import("@/app/api/v1/ta/submissions/[id]/route");
  return GET(new Request(`http://localhost/api/v1/ta/submissions/${submissionId}?${query}`), { params: Promise.resolve({ id: submissionId }) });
}
async function data(response: Response) {
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json(); expect(Object.keys(body)).toEqual(["data"]);
  const serialized = JSON.stringify(body);
  for (const actor of Object.values(fixture.actors)) expect(serialized).not.toContain(actor.email);
  expect(serialized).not.toMatch(/"(?:email|access_token|refresh_token)"/i);
  return body.data;
}
async function failure(response: Response, status: number, code: string) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json(); expect(body).toEqual({ error: expect.objectContaining({ code, message: expect.any(String) }) });
  expect(JSON.stringify(body)).not.toMatch(/Checkout|Learner A|price \* fraction|postgres|stack|@example\.test/);
}
it.each(["taA", "taB"] as const)("TA-01.1 TA-01.4 TA-01.5 SYS-12.2 %s reads both learners, separate attempts and strict private projection", async caller => {
  const page = await data(await list(caller));
  expect(page.items.map((row: { id: string }) => row.id)).toEqual([501, 502, 503, 510, 511, 512, 513, 514].map(id));
  expect(page.nextCursor).toBeNull();
  const base = submission();
  expect(page.items[0]).toEqual({ id: id(501), challengeId: id(101), revisionId: id(201), title: "Checkout totals",
    learner: base.learner, attemptNumber: 1, submittedAt: expect.any(String), gradingState: "completed", effectiveScore: 70, openFlagCount: 0 });
  expect(page.items[2]).toMatchObject({ learner: { id: id(12) }, effectiveScore: 60, openFlagCount: 2 });
  const view = await data(await detail(caller));
  expect(Object.keys(view).sort()).toEqual(["id", "challengeId", "revisionId", "learner", "attemptNumber", "previousSubmissionId", "submittedAt", "challenge", "comments", "grading", "flags", "answerKey", "matching", "assessments"].sort());
  expect(view.challenge.code).toEqual(code); expect(view.answerKey).toEqual(base.answerKey);
  expect(view.comments).toEqual(base.comments); expect(view.matching).toEqual(base.matching); expect(view.assessments).toEqual(base.assessments);
  expect(view.grading.original).toEqual(base.grading.original);
  expect(view.grading.effective).toEqual({ score: 70, passed: true, source: "ta" });
  expect(view.grading.overrides).toEqual([expect.objectContaining({ id: id(901), actorId: id(21), auditOrder: 1, score: 70 })]);
  expect(view.flags).toEqual([expect.objectContaining({ id: id(801), status: "resolved",
    resolutions: [expect.objectContaining({ id: id(902), actorId: id(21), auditOrder: 2, disposition: "upheld" })] })]);
});
it("TA-01.2 TA-01.3 filters in combination, uses deterministic bounded pages and rejects filter-bound cursor reuse", async () => {
  const first = await data(await list("taA", "limit=2"));
  expect(first.items.map((row: { id: string }) => row.id)).toEqual([id(501), id(502)]);
  expect(first.nextCursor).toEqual(expect.any(String)); expect(first.nextCursor.length).toBeLessThanOrEqual(512);
  const second = await data(await list("taA", `limit=2&cursor=${first.nextCursor}`));
  expect(second.items.map((row: { id: string }) => row.id)).toEqual([id(503), id(510)]);
  await failure(await list("taA", `limit=2&learnerId=${id(12)}&cursor=${first.nextCursor}`), 400, "VALIDATION_ERROR");
  const filtered = await data(await list("taA", `learnerId=${id(11)}&challengeId=${id(101)}&gradingState=completed`));
  expect(filtered.items.map((row: { id: string }) => row.id)).toEqual([id(501), id(502)]);
  expect(await data(await list("taA", `learnerId=${id(11)}&gradingState=failed`))).toEqual({ items: [], nextCursor: null });
  for (const query of ["limit=51", "cursor=broken", "learnerId=bad", "unexpected=true", "limit=1&limit=2"]) {
    await failure(await list("taA", query), 400, "VALIDATION_ERROR");
  }
  await failure(await detail("taA", "bad"), 400, "VALIDATION_ERROR");
  await failure(await detail("taA", id(501), "extra=true"), 400, "VALIDATION_ERROR");
  await failure(await detail("taA", id(999)), 404, "NOT_FOUND");
});
it.each(["pending", "running", "failed", "zero"])("TA-01.4 TA-01.6 preserves empty comments and %s stored grade state on repeated reads", async state => {
  const sid = fixture.statusIds[state];
  const before = await data(await detail("taA", sid));
  const after = await data(await detail("taA", sid));
  expect(after).toEqual(before); expect(before.comments).toEqual([]); expect(before.challenge.code).toEqual(code);
  expect(before.grading.state).toBe(state === "zero" ? "completed" : state);
  if (state === "zero") expect(before.grading.original.score).toBe(0);
  else { expect(before.grading.original).toBeNull(); expect(before.grading.effective).toBeNull(); }
  const result = await fixture.h.db.query("select count(*)::int as count from public.grading_runs where submission_id=$1", [sid]);
  expect(result.rows[0].count).toBe(1);
});
it.each(["authorA", "authorB", "learnerA", "learnerB", "anon"] as const)("SYS-08.2 SYS-08.3 SYS-11.1 SYS-11.3 denies direct TA entry to %s without disclosure", async caller => {
  const status = caller === "anon" ? 401 : 403, code = caller === "anon" ? "UNAUTHENTICATED" : "FORBIDDEN";
  await failure(await list(caller), status, code);
  for (const sid of [id(501), id(503), id(999)]) await failure(await detail(caller, sid), status, code);
  const reads = await import("@/server/ta/submissions");
  context.client = clientFor(caller);
  expect(await reads.readSubmissionPage(new URLSearchParams())).toEqual({ status: caller === "anon" ? "unauthenticated" : "role_denied" });
  expect(await reads.readSubmission(id(501))).toEqual({ status: caller === "anon" ? "unauthenticated" : "role_denied" });
});
it("SYS-12.1 SYS-12.2 exercises direct local RLS, answer joins and email column restrictions with two users per role", async () => {
  for (const caller of [...Object.keys(fixture.actors), "anon"] as Caller[]) {
    const client = clientFor(caller);
    const result = await client.from("submissions").select("id").in("id", [id(501), id(503)]);
    if (caller !== "anon") expect(result.error).toBeNull();
    const expected = caller.startsWith("ta") ? [id(501), id(503)] : caller === "learnerA" ? [id(501)] : caller === "learnerB" ? [id(503)] : [];
    expect((result.data ?? []).map(row => row.id).sort()).toEqual(expected);
    const privateRows = await client.from("revision_answers").select("working_code,real_diff").eq("revision_id", id(201));
    if (caller === "authorA" || caller.startsWith("ta")) {
      expect(privateRows.error).toBeNull(); expect(privateRows.data).toEqual([{ working_code: code.before, real_diff: code }]);
    } else expect(privateRows.error !== null || privateRows.data?.length === 0).toBe(true);
    const joined = await client.from("challenge_revisions").select("id,revision_answers(working_code,real_diff)").eq("id", id(201));
    if (caller.startsWith("learner")) expect(JSON.stringify(joined.data)).not.toContain("working_code");
    const emails = await client.from("profiles").select("email").eq("id", id(11));
    expect(emails.error !== null || emails.data?.length === 0).toBe(true);
  }
});
it("TA-01.8 SYS-12.4 retains exact R1 code, key and original assessment after draft edits, R2 publication, unpublish and archive", async () => {
  const before = await data(await detail("taA"));
  await fixture.h.db.query("update public.challenge_drafts set title = 'Edited draft', draft_version = draft_version + 1 where challenge_id=$1", [id(101)]);
  expect(await data(await detail("taB"))).toEqual(before);
  await fixture.publishNextRevision();
  expect(await data(await detail("taA"))).toEqual(before);
  for (const status of ["unpublished", "archived"]) {
    await fixture.h.db.query("update public.challenges set status=$1 where id=$2", [status, id(101)]);
    expect(await data(await detail("taA"))).toEqual(before);
    for (const caller of ["learnerA", "learnerB"] as const) {
      const sid = caller === "learnerA" ? id(501) : id(503);
      const own = await fixture.actors[caller].client.from("submissions").select("revision_id,ai_grades(score)").eq("id", sid).single();
      expect(own.error).toBeNull(); expect(own.data?.revision_id).toBe(id(201));
      expect(own.data?.ai_grades).toEqual({ score: caller === "learnerA" ? 25 : 60 });
    }
  }
});

it("TA-01.5 preserves duplicate, missed and per-flaw evidence from stored grading", async () => {
  const view = await data(await detail("taA", fixture.statusIds.duplicate));
  expect(view.matching).toEqual({ matches: [{ flawId: id(301), commentId: id(607), distance: 0 }], missedFlawIds: [id(302)], unmatchedCommentIds: [], duplicateCommentIds: [id(608)] });
  expect(view.grading.original.score).toBe(50);
  expect(view.grading.original.comments[1]).toEqual({ commentId: id(608), matched: false, explanationCredit: null, fixCredit: null, feedback: null });
  expect(view.assessments[1]).toEqual({ flawId: id(302), commentId: null, explanationCredit: 0, fixCredit: 0, feedback: null });
});
