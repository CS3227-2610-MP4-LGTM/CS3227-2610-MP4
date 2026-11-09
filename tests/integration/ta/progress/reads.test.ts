// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createProgressFixture } from "./fixture";
import { id, progress } from "../../../unit/ta/progress/evidence";
const context = vi.hoisted(() => ({ client: null as SupabaseClient | null, admin: vi.fn(), provider: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => {
  if (!context.client) throw new Error("Missing local caller"); return context.client;
} }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: context.admin }));
vi.mock("@/server/llm/boundary", () => ({ createLlmBoundary: context.provider }));
let f: Awaited<ReturnType<typeof createProgressFixture>>;
let anon: SupabaseClient;
type Caller = keyof Awaited<ReturnType<typeof createProgressFixture>>["actors"] | "anon";
const client = (caller: Caller) => caller === "anon" ? anon : f.actors[caller].client;
beforeAll(async () => {
  context.admin.mockImplementation(() => { throw new Error("No admin client on progress reads"); });
  context.provider.mockImplementation(() => { throw new Error("No AI on progress reads"); });
  f = await createProgressFixture(); anon = f.h.client();
  await f.h.db.query("update public.profiles set display_name='Same name' where id in($1,$2)", [id(11), id(12)]);
});
afterAll(async () => { context.client = null; await f?.dispose(); });
async function get(caller: Caller, section: "list" | "progress" | "recommendations", learnerId = id(11), query = "") {
  context.client = client(caller);
  const url = `http://localhost/api/v1/ta/learners${section === "list" ? "" : `/${learnerId}/${section}`}?${query}`;
  if (section === "list") return (await import("@/app/api/v1/ta/learners/route")).GET(new Request(url));
  const route = section === "progress" ? await import("@/app/api/v1/ta/learners/[id]/progress/route") : await import("@/app/api/v1/ta/learners/[id]/recommendations/route");
  return route.GET(new Request(url), { params: Promise.resolve({ id: learnerId }) });
}
async function data(response: Response) {
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json(); expect(Object.keys(body)).toEqual(["data"]);
  expect(JSON.stringify(body)).not.toMatch(/@example\.test|"email"|access_token|refresh_token|"workingCode"|"answerKey"/);
  return body.data;
}
async function failure(response: Response, status: number, code: string) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json(); expect(body).toEqual({ error: expect.objectContaining({ code, message: expect.any(String) }) });
  expect(JSON.stringify(body)).not.toMatch(/Same name|Learner A|Checkout|postgres|stack|@example\.test/);
}
it.each(["taA", "taB"] as const)("TA-04.1 TA-04.2 SYS-12.2 %s reads only bounded learner identity rows, orders same-time IDs and paginates duplicate names", async caller => {
  // Profile timestamps are a new test-defined persistence interface. Assert the
  // migration explicitly instead of failing fixture setup on an unknown column.
  const column = await f.h.db.query("select data_type from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='created_at'");
  expect(column.rows).toEqual([{ data_type: "timestamp with time zone" }]);
  await f.h.db.query("update public.profiles set created_at='2026-01-01T00:00:00Z' where id in($1,$2)", [id(11), id(12)]);
  const reads = await import("@/server/ta/progress"); context.client = client(caller);
  expect(await reads.readLearner(id(11))).toEqual({ status: "ok", learner: { id: id(11), displayName: "Same name" } });
  const first = await data(await get(caller, "list", id(11), "limit=1"));
  expect(first.items).toHaveLength(1); expect(Object.keys(first.items[0]).sort()).toEqual(["displayName", "id"]);
  const seen = [...first.items]; let cursor = first.nextCursor;
  while (cursor) {
    expect(cursor.length).toBeLessThanOrEqual(512);
    const page = await data(await get(caller, "list", id(11), `limit=1&cursor=${encodeURIComponent(cursor)}`));
    seen.push(...page.items); cursor = page.nextCursor;
    expect(seen.length).toBeLessThanOrEqual(20);
  }
  expect(new Set(seen.map((row: { id: string }) => row.id)).size).toBe(seen.length);
  const ordered = await f.h.db.query("select id from public.profiles where role='learner' order by created_at desc,id asc");
  expect(seen.map((row: { id: string }) => row.id)).toEqual(ordered.rows.map((row: { id: string }) => row.id));
  expect(seen.filter((row: { displayName: string }) => row.displayName === "Same name").map((row: { id: string }) => row.id)).toEqual([id(11), id(12)]);
  expect(seen.some((row: { id: string }) => [id(1), id(2), id(21), id(22)].includes(row.id))).toBe(false);
  expect((await data(await get(caller, "list"))).items.length).toBeLessThanOrEqual(20);
});
it("TA-04.2 TA-05.3 SYS-02.1 rejects malformed/extra/repeated fields and distinguishes missing IDs from existing wrong-role IDs", async () => {
  for (const query of ["limit=0", "limit=51", "limit=1.1", "limit=1&limit=2", "cursor=broken", `cursor=${"a".repeat(513)}`, "email=forged"]) await failure(await get("taA", "list", id(11), query), 400, "VALIDATION_ERROR");
  for (const query of ["limit=0", "limit=11", "limit=1.1", "limit=1&limit=2", "role=ta"]) await failure(await get("taA", "recommendations", id(11), query), 400, "VALIDATION_ERROR");
  for (const section of ["progress", "recommendations"] as const) {
    await failure(await get("taA", section, "bad"), 400, "VALIDATION_ERROR");
    await failure(await get("taA", section, id(999)), 404, "NOT_FOUND");
    for (const wrongRole of [id(1), id(2), id(21), id(22)]) await failure(await get("taA", section, wrongRole), 403, "FORBIDDEN");
    await failure(await get("taA", section, id(11), "unexpected=true"), 400, "VALIDATION_ERROR");
  }
  const reads = await import("@/server/ta/progress"); context.client = client("taA");
  expect(await reads.readLearner(id(999))).toEqual({ status: "not_found" });
  expect(await reads.readLearner(id(1))).toEqual({ status: "role_denied" });
});
it.each(["authorA", "authorB", "learnerA", "learnerB", "anon"] as const)("TA-05.7 SYS-08.2 SYS-08.3 SYS-12.1 denies %s direct endpoints and DAL calls regardless of learner ID", async caller => {
  const before = await f.snapshot();
  for (const learnerId of [id(11), id(12), id(1), id(999)]) {
    for (const section of ["list", "progress", "recommendations"] as const) await failure(await get(caller, section, learnerId), caller === "anon" ? 401 : 403, caller === "anon" ? "UNAUTHENTICATED" : "FORBIDDEN");
    context.client = client(caller); const reads = await import("@/server/ta/progress");
    for (const result of [await reads.readLearner(learnerId), await reads.readLearnerPage(new URLSearchParams()), await reads.readCategoryProgress(learnerId), await reads.readRecommendations(learnerId, new URLSearchParams())]) expect(result).toEqual({ status: caller === "anon" ? "unauthenticated" : "role_denied" });
  }
  expect(await f.snapshot()).toEqual(before); expect(context.admin).not.toHaveBeenCalled(); expect(context.provider).not.toHaveBeenCalled();
});
it("TA-05.1 TA-05.2 SYS-12.4 retains original first-attempt matching after retry, override, revision publication, unpublish and archive", async () => {
  for (const caller of ["taA", "taB"] as const) {
    expect(await data(await get(caller, "progress"))).toEqual(progress());
    expect(await data(await get(caller, "progress", id(12)))).toEqual({ ...progress([[1, 1, 1], [1, 1, 1]]), learnerId: id(12) });
    for (const [state, sid] of Object.entries(f.statusIds)) {
      const row = await f.h.db.query("select learner_id from public.submissions where id=$1", [sid]);
      const expected = ["pending", "running", "failed"].includes(state) ? progress([]) : state === "zero" ? progress([[0, 1, 1], [0, 1, 1]]) : progress();
      expect(await data(await get(caller, "progress", row.rows[0].learner_id))).toEqual({ ...expected, learnerId: row.rows[0].learner_id });
    }
  }
  await f.publishNextRevision();
  // R2 is currently live: an attempt pinned to R1 must exclude the whole
  // challenge, rather than excluding only the attempted revision.
  const republished = await data(await get("taA", "recommendations"));
  expect(republished.items.some((item: { challenge: { id: string } }) => item.challenge.id === id(101))).toBe(false);
  for (const status of ["published", "unpublished", "archived"]) {
    await f.h.db.query("update public.challenges set status=$1 where id=$2", [status, id(101)]);
    expect(await data(await get("taB", "progress"))).toEqual(progress());
  }
});
it("TA-05.3 TA-05.4 TA-05.5 refresh recomputes live recommendation ordering and excludes attempts in every state on any revision", async () => {
  const candidate = await f.addCandidate(6101);
  await f.addCandidate(6102, ["logic_bug", "edge_case"], "hard");
  await f.addCandidate(6103, ["edge_case"]);
  await f.addCandidate(6104, ["security"]);
  const ids = async () => (await data(await get("taA", "recommendations"))).items.map((r: { challenge: { id: string } }) => r.challenge.id);
  expect(await ids()).toEqual([id(6101), id(6102), id(6103)]);
  const result = await data(await get("taB", "recommendations"));
  expect(result.items[0]).toEqual({ challenge: { id: id(6101), revisionId: id(7101), title: "Practice 6101", description: "Review the changes.", language: "javascript", difficulty: "easy", categories: ["logic_bug", "edge_case"], publishedAt: expect.any(String) }, targetCategories: ["logic_bug", "edge_case"] });
  expect((await data(await get("taA", "recommendations", id(11), "limit=1"))).items).toHaveLength(1);
  await f.addAttempt(16001, candidate, "pending"); expect(await ids()).toEqual([id(6102), id(6103)]);
  const running = await f.addCandidate(6105); await f.addAttempt(16002, running, "running");
  const failed = await f.addCandidate(6106); await f.addAttempt(16003, failed, "failed");
  expect(await ids()).toEqual([id(6102), id(6103)]);
  await f.h.db.query("update public.challenges set status='unpublished' where id=$1", [id(6102)]); expect(await ids()).toEqual([id(6103)]);
  await f.h.db.query("update public.challenges set status='archived' where id=$1", [id(6103)]); expect(await ids()).toEqual([]);
  // A completed retry on old C1-R1 cannot make republished C1-R2 eligible.
  expect((await ids()).includes(id(101))).toBe(false);
});
it("TA-05.4 TA-05.7 SYS-08.3 repeated successful reads have zero writes, provider and admin activity", async () => {
  const before = await f.snapshot();
  for (const caller of ["taA", "taB"] as const) for (let repeat = 0; repeat < 2; repeat++) for (const section of ["list", "progress", "recommendations"] as const) await data(await get(caller, section));
  expect(await f.snapshot()).toEqual(before); expect(context.admin).not.toHaveBeenCalled(); expect(context.provider).not.toHaveBeenCalled();
});
