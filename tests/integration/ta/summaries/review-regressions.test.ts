// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/ta/learners/[id]/summaries/route";
import type { Provider } from "@/server/llm/provider";
import { envelope } from "../../../unit/server/llm/fixtures";
import { id } from "../../../unit/ta/summaries/evidence";
import { createSummaryFixture } from "./fixture";

const mocks = vi.hoisted(() => ({ user: null as SupabaseClient | null, admin: vi.fn(), execute: vi.fn<Provider["execute"]>() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => {
  if (!mocks.user) throw new Error("Missing local caller");
  return mocks.user;
} }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/llm/provider", async original => ({ ...await original<typeof import("@/server/llm/provider")>(), createFakeProvider: () => ({ execute: mocks.execute }) }));

let f: Awaited<ReturnType<typeof createSummaryFixture>>;
beforeAll(async () => { f = await createSummaryFixture(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => { mocks.user = null; await f?.dispose(); });

it("TA-04.7 SEC-05.1 one TA reuses a mutation key independently for two learner resources and replays each recorded summary", async () => {
  // REV-01: a key is scoped to actor/method/resource, not just the actor.
  vi.stubEnv("APP_ENV", "test"); vi.stubEnv("AI_PROVIDER", "fake");
  await f.clearGenerated(); mocks.user = f.actors.taA.client;
  mocks.admin.mockReset().mockReturnValue(f.h.admin);
  mocks.execute.mockReset().mockImplementation(async request => {
    if (request.data.operation !== "summarize_learner") throw new Error("Unexpected operation");
    const first = request.data.payload.submissions[0];
    return { output: envelope("summarize_learner", { strengths: [], blindSpots: [{
      category: first.categories[0].category, text: "Review this learner's retained evidence.", submissionIds: [first.submissionId],
    }], nextSteps: [] }), usage: { inputTokens: 100, outputTokens: 30, verified: true } };
  });
  const key = randomUUID();
  async function generate(learnerId: string) {
    const response = await POST(new Request(`http://localhost/api/v1/ta/learners/${learnerId}/summaries`, {
      method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json", "Idempotency-Key": key }, body: "{}",
    }), { params: Promise.resolve({ id: learnerId }) });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.status).toBe(201);
    const body = await response.json(); expect(Object.keys(body)).toEqual(["data"]);
    return body.data;
  }

  const first = await generate(id(11));
  const second = await generate(id(12));
  expect(first.learnerId).toBe(id(11)); expect(second.learnerId).toBe(id(12));
  expect(first.id).not.toBe(second.id);
  expect(first.output.blindSpots[0].submissionIds).toEqual([id(501)]);
  expect(second.output.blindSpots[0].submissionIds).toEqual([id(503)]);
  const beforeReplay = await f.h.db.query("select * from private.ta_summary_requests where account_id=$1 and idempotency_key=$2 order by learner_id", [id(21), key]);
  expect(beforeReplay.rows).toHaveLength(2);
  expect(beforeReplay.rows.map(row => ({ learner: row.learner_id, summary: row.summary_id, state: row.state }))).toEqual([
    { learner: id(11), summary: first.id, state: "completed" },
    { learner: id(12), summary: second.id, state: "completed" },
  ]);
  expect(await generate(id(12))).toEqual(second);
  expect(await generate(id(11))).toEqual(first);
  expect(mocks.execute).toHaveBeenCalledTimes(2);
  expect(mocks.execute.mock.calls.map(([request]) => request.data.operation === "summarize_learner" ? request.data.payload.progress.learnerId : null)).toEqual([id(11), id(12)]);
  const afterReplay = await f.h.db.query("select * from private.ta_summary_requests where account_id=$1 and idempotency_key=$2 order by learner_id", [id(21), key]);
  expect(afterReplay.rows).toEqual(beforeReplay.rows);
  const summaries = await f.h.db.query("select id,learner_id from public.performance_summaries where learner_id=any($1::uuid[]) order by learner_id", [[id(11), id(12)]]);
  expect(summaries.rows).toEqual([{ id: first.id, learner_id: id(11) }, { id: second.id, learner_id: id(12) }]);
});
