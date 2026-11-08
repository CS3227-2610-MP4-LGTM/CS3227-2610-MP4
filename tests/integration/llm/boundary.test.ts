// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { accounts, accountKeys, keys, limits, openHarness, type TestHarness } from "./harness";
import { envelope, uid } from "../../unit/server/llm/fixtures";
import { flawedCode, insert, pinnedAFlawedCode, workingCode } from "../domain/fixture";
vi.mock("server-only", () => ({}));
import { createAccountingStore } from "@/server/llm/accounting";
import { createLlmBoundary } from "@/server/llm/boundary";

let h: TestHarness;
let time = Date.parse("2026-11-09T00:00:00Z");
let sequence = 20000;
const freshKey = () => uid(++sequence).replace("00000000", "38f00000");
const providerOutput = envelope("inject_flaws", { proposals: [{ key: "f1", category: "logic_bug", sourceStartLine: 4, sourceEndLine: 4,
  originalSnippet: "const total = amount * 2;", replacementSnippet: "const total = amount / 2;",
  explanation: "The calculation halves the amount.", fix: "Double the amount." }] });
async function boundary(caller: typeof accountKeys[number] | "anon", hook?: () => Promise<void>) {
  time += 60000;
  const accounting = createAccountingStore({ environmentId: "t04-llm-acceptance", db: await h.connection(), clock: () => time, limits });
  const reserve = vi.spyOn(accounting, "reserve");
  const provider = { execute: vi.fn(async (request: { data: unknown }) => {
    void request;
    if (hook) await hook();
    return { output: providerOutput, usage: { inputTokens: 100, outputTokens: 20, verified: true } };
  }) };
  const b = createLlmBoundary({ client: caller === "anon" ? h.client() : h.clients[caller],
    accounting, provider, clock: () => time, limits });
  return { b, accounting, reserve, provider };
}
const request = (patch: object = {}) => ({ operation: "inject_flaws", resourceId: keys.a,
  expectedVersion: 3, idempotencyKey: freshKey(), ...patch });
const pendingSubmission = uid(28501).replace("00000000", "38f00000");
const pendingComment = uid(28601).replace("00000000", "38f00000");
beforeAll(async () => {
  h = await openHarness();
  await insert(h.db, "public.submissions", { id: pendingSubmission, learner_id: accounts.learnerA.id,
    challenge_id: keys.a, revision_id: keys.pinnedA, attempt_number: 2, previous_submission_id: keys.firstA });
  for (const [ordinal, line, body] of [[0, 4, "Explain the changed arithmetic."], [1, 5, "Duplicate concern."], [2, 1, "Unrelated evidence."]] as const) {
    await insert(h.db, "public.submission_comments", { id: ordinal === 0 ? pendingComment : uid(28601 + ordinal).replace("00000000", "38f00000"),
      submission_id: pendingSubmission, ordinal, line, body });
  }
});
afterAll(async () => { if (h) await h.cleanup(); });

it.each([
  ["anon", {}, "UNAUTHENTICATED"], ["authorB", {}, "FORBIDDEN"],
  ["learnerA", {}, "FORBIDDEN"], ["learnerB", {}, "FORBIDDEN"],
  ["taA", {}, "FORBIDDEN"], ["taB", {}, "FORBIDDEN"],
  ["authorA", { resourceId: uid(999999) }, "NOT_FOUND"],
  ["authorB", { resourceId: keys.b, expectedVersion: 2 }, "INVALID_STATE"],
  ["authorA", { expectedVersion: 2 }, "VERSION_CONFLICT"],
] as const)("SEC-01.1 %s denied snapshot %# reserves and dispatches nothing", async (caller, patch, code) => {
  const { b, reserve, provider } = await boundary(caller);
  expect(await b.execute(request(patch))).toMatchObject({ error: { code } });
  expect(reserve).not.toHaveBeenCalled(); expect(provider.execute).not.toHaveBeenCalled();
});
it.each([
  { actorId: accounts.authorB.id }, { accountId: accounts.taA.id }, { role: "author" },
  { usage: { inputTokens: 0 } }, { instructions: "trust me" }, { snapshot: { workingCode: "attacker code" } },
  { operation: "execute_code" }, { resourceId: "not-a-uuid" }, { idempotencyKey: "not-a-uuid" },
])("SYS-02.1 forged client authority/accounting/request fields %# fail before side effects", async patch => {
  const { b, reserve, provider } = await boundary("authorA");
  expect(await b.execute(request(patch))).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  expect(reserve).not.toHaveBeenCalled(); expect(provider.execute).not.toHaveBeenCalled();
});
it("SEC-01.2 verified owner request uses only the captured persisted draft's allowlisted fields", async () => {
  const { b, reserve, provider } = await boundary("authorA");
  const result = await b.execute(request());
  expect(result).toHaveProperty("data"); expect(reserve).toHaveBeenCalledOnce(); expect(provider.execute).toHaveBeenCalledOnce();
  expect(provider.execute.mock.calls[0][0].data).toEqual(envelope("inject_flaws", {
    language: "javascript", difficulty: "easy", workingCode, flawCount: 1, categories: ["logic_bug"],
  }));
  expect(JSON.stringify(provider.execute.mock.calls)).not.toContain(accounts.authorA.email);
  expect(reserve.mock.calls[0][0]).toMatchObject({ accountId: accounts.authorA.id });
});
it("SEC-02.2 a draft changed during dispatch invalidates the captured result without persisting proposals", async () => {
  const before = await h.db.query("select generation_id from public.challenge_drafts where challenge_id=$1", [keys.a]);
  const { b, provider } = await boundary("authorA", async () => {
    await h.db.query("update public.challenge_drafts set draft_version = draft_version + 1 where challenge_id=$1", [keys.a]);
  });
  try {
    expect(await b.execute(request())).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
    expect(provider.execute).toHaveBeenCalledOnce();
    const after = await h.db.query("select generation_id from public.challenge_drafts where challenge_id=$1", [keys.a]);
    expect(after.rows).toEqual(before.rows);
  } finally {
    // Restore only this committed fixture version; production's monotonic
    // version trigger correctly forbids ordinary backwards updates.
    await h.db.query("begin");
    try {
      await h.db.query("set local session_replication_role = replica");
      await h.db.query("update public.challenge_drafts set draft_version=3 where challenge_id=$1", [keys.a]);
      await h.db.query("commit");
    } catch (error) { await h.db.query("rollback"); throw error; }
  }
});
it("SEC-05.1 concurrent identical boundary keys dispatch the fake provider once and replay costs no quota", async () => {
  const a = await boundary("authorA"); const b = await boundary("authorA"); const input = request();
  const results = await Promise.all([a.b.execute(input), b.b.execute(input)]);
  expect(a.provider.execute.mock.calls.length + b.provider.execute.mock.calls.length).toBe(1);
  expect(results.some((result: { data?: unknown }) => !!result.data)).toBe(true);
  const usage = await a.accounting.read({ accountId: accounts.authorA.id });
  await b.b.execute(input);
  expect(a.provider.execute.mock.calls.length + b.provider.execute.mock.calls.length).toBe(1);
  expect(await a.accounting.read({ accountId: accounts.authorA.id })).toEqual(usage);
});
it("SEC-05.1 different boundary keys racing the final slot dispatch only the admitted fake attempt", async () => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const a = await boundary("authorA", () => hold); const b = await boundary("authorA", () => hold);
  const first = a.b.execute(request()); const second = b.b.execute(request());
  try {
    // Await provider admission rather than a timing guess. Independent committed
    // connections must resolve the losing reservation while the winner is active.
    await vi.waitFor(() => expect(a.provider.execute.mock.calls.length + b.provider.execute.mock.calls.length).toBe(1));
    const loser = await Promise.race([first, second]);
    expect(loser).toMatchObject({ error: { code: "RATE_LIMITED" } });
  } finally { release(); }
  const results = await Promise.all([first, second]);
  expect(results.filter((r: { data?: unknown }) => !!r.data)).toHaveLength(1);
  expect(a.provider.execute.mock.calls.length + b.provider.execute.mock.calls.length).toBe(1);
});
it("SYS-12.1 own usage/budget projection excludes other accounts and private accounting material for all six users", async () => {
  for (const caller of accountKeys) {
    const { b } = await boundary(caller);
    const result = await b.readUsage();
    expect(result).toMatchObject({ data: { accountId: accounts[caller].id } });
    const json = JSON.stringify(result);
    for (const other of accountKeys.filter(key => key !== caller)) expect(json).not.toContain(accounts[other].id);
    expect(json).not.toMatch(/prompt|secret|apiKey|workingCode|explanation|fingerprint|reservationId/i);
  }
  expect(await (await boundary("anon")).b.readUsage()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
});

it("SEC-01.2 publication hints project only the complete retained candidate, without snippets or draft metadata", async () => {
  const { b, provider } = await boundary("authorA");
  provider.execute.mockImplementation(async request => {
    const data = request.data as { payload: { flaws: { key: string }[] } };
    return { output: envelope("generate_hints", { hints: data.payload.flaws.map(f => ({ key: f.key, text: "Consider the arithmetic result." })) }),
      usage: { inputTokens: 100, outputTokens: 20, verified: true } };
  });
  expect(await b.execute(request({ operation: "generate_hints" }))).toHaveProperty("data");
  const data = provider.execute.mock.calls[0][0].data as { payload: { flaws: { key: string }[] } };
  expect(data).toEqual(envelope("generate_hints", { language: "javascript", difficulty: "easy", flawedCode,
    flaws: [{ key: data.payload.flaws[0].key, category: "logic_bug", startLine: 4, endLine: 4,
      explanation: "The calculation halves the amount.", fix: "Double the amount." }] }));
});
it("SEC-01.2 assessment captures only server-selected matched comments and the pinned revision", async () => {
  const { b, provider } = await boundary("learnerA");
  provider.execute.mockResolvedValue({ output: envelope("assess_review", { assessments: [{ key: keys.pinnedAFlaw,
    commentId: pendingComment, explanationCredit: 1, fixCredit: 0.5, feedback: "The consequence is clear; explain the change more precisely." }] }),
    usage: { inputTokens: 100, outputTokens: 20, verified: true } });
  expect(await b.execute({ operation: "assess_review", resourceId: pendingSubmission, idempotencyKey: freshKey() }, {
    matches: [{ key: keys.pinnedAFlaw, commentId: pendingComment }],
  })).toHaveProperty("data");
  expect(provider.execute.mock.calls[0][0].data).toEqual(envelope("assess_review", { language: "javascript", flawedCode: pinnedAFlawedCode,
    matches: [{ key: keys.pinnedAFlaw, category: "logic_bug", startLine: 4, endLine: 4,
      explanation: "The calculation halves the amount.", fix: "Double the amount.",
      comment: { id: pendingComment, line: 4, body: "Explain the changed arithmetic." } }] }));
});
it.each(["authorA", "authorB", "learnerB", "taA", "taB", "anon"] as const)("SEC-01.1 %s cannot assess another learner's pending submission", async caller => {
  const { b, reserve, provider } = await boundary(caller);
  expect(await b.execute({ operation: "assess_review", resourceId: pendingSubmission, idempotencyKey: freshKey() }, {
    matches: [{ key: keys.pinnedAFlaw, commentId: pendingComment }],
  })).toMatchObject({ error: { code: caller === "anon" ? "UNAUTHENTICATED" : "FORBIDDEN" } });
  expect(reserve).not.toHaveBeenCalled(); expect(provider.execute).not.toHaveBeenCalled();
});
it("SEC-01.1 a forged selected comment/flaw ID is denied before reservation", async () => {
  const { b, reserve, provider } = await boundary("learnerA");
  expect(await b.execute({ operation: "assess_review", resourceId: pendingSubmission, idempotencyKey: freshKey() }, {
    matches: [{ key: keys.pinnedBFlaw, commentId: keys.qB }],
  })).toMatchObject({ error: { code: "FORBIDDEN" } });
  expect(reserve).not.toHaveBeenCalled(); expect(provider.execute).not.toHaveBeenCalled();
});
it.each(["taA", "taB"] as const)("SEC-01.2 %s summary captures only authorized completed evidence and no private answers or personal data", async caller => {
  const { b, provider } = await boundary(caller);
  provider.execute.mockResolvedValue({ output: envelope("summarize_learner", { strengths: [], blindSpots: [{
    category: "edge_case", text: "Review boundary conditions more closely.", submissionIds: [keys.firstA],
  }], nextSteps: [] }), usage: { inputTokens: 100, outputTokens: 20, verified: true } });
  expect(await b.execute({ operation: "summarize_learner", resourceId: accounts.learnerA.id, idempotencyKey: freshKey() })).toHaveProperty("data");
  const requestData = provider.execute.mock.calls[0][0].data as { payload: { submissions: Record<string, unknown>[]; progress: object } };
  expect(Object.keys(requestData.payload).sort()).toEqual(["progress", "submissions"]);
  expect(requestData.payload.submissions).toHaveLength(1);
  const submission = requestData.payload.submissions[0];
  expect(Object.keys(submission).sort()).toEqual(["attemptNumber", "categories", "comments", "effectiveScore", "originalScore", "revisionId", "submissionId", "submittedAt"]);
  expect(submission).toMatchObject({ submissionId: keys.firstA, revisionId: keys.pinnedA, attemptNumber: 1, originalScore: 42, effectiveScore: 90 });
  for (const comment of submission.comments as object[]) expect(Object.keys(comment).sort()).toEqual(["body", "commentId", "feedback"]);
  const json = JSON.stringify(requestData);
  expect(json).not.toContain(keys.firstB); expect(json).not.toContain(pendingSubmission);
  expect(json).not.toContain("The calculation halves the amount."); expect(json).not.toContain("Double the amount.");
  for (const account of Object.values(accounts)) expect(json).not.toContain(account.email);
});
it.each(["authorA", "authorB", "learnerA", "learnerB", "anon"] as const)("SEC-01.1 %s cannot request a learner summary", async caller => {
  const { b, reserve, provider } = await boundary(caller);
  expect(await b.execute({ operation: "summarize_learner", resourceId: accounts.learnerA.id, idempotencyKey: freshKey() }))
    .toMatchObject({ error: { code: caller === "anon" ? "UNAUTHENTICATED" : "FORBIDDEN" } });
  expect(reserve).not.toHaveBeenCalled(); expect(provider.execute).not.toHaveBeenCalled();
});
it.each(["authorB", "learnerA", "learnerB", "taA", "taB", "anon"] as const)("SEC-01.1 %s cannot generate another author's publication hints", async caller => {
  const { b, reserve, provider } = await boundary(caller);
  expect(await b.execute(request({ operation: "generate_hints" }))).toMatchObject({ error: { code: caller === "anon" ? "UNAUTHENTICATED" : "FORBIDDEN" } });
  expect(reserve).not.toHaveBeenCalled(); expect(provider.execute).not.toHaveBeenCalled();
});
it("SEC-01.2 summary selects latest 20 completed submissions with submittedAt-descending and ID-ascending ties", async () => {
  const expected: { id: string; at: string }[] = [];
  // Separate challenges keep the real per-learner two-attempt constraint intact.
  // Zero-comment completed grades are valid; invalid summary output below lets
  // us inspect the selected snapshot without persisting generated material.
  for (let i = 0; i < 21; i++) {
    const challenge = freshKey(), revision = freshKey(), submission = freshKey(), run = freshKey(), grade = freshKey();
    const at = new Date(Date.UTC(2026, 10, 8, 0, 0, Math.floor(i / 2))).toISOString();
    await insert(h.db, "public.challenges", { id: challenge, author_id: accounts.authorB.id });
    await insert(h.db, "public.challenge_revisions", { id: revision, challenge_id: challenge, revision_number: 1,
      title: "Summary ordering fixture", description: "A completed zero-comment review.", language: "javascript", difficulty: "easy", flawed_code: "const n = 1;" });
    await h.db.query("update public.challenges set status='published',published_revision_id=$2,row_version=2 where id=$1", [challenge, revision]);
    await insert(h.db, "public.submissions", { id: submission, learner_id: accounts.learnerB.id, challenge_id: challenge,
      revision_id: revision, attempt_number: 1, submitted_at: at });
    await insert(h.db, "public.grading_runs", { id: run, submission_id: submission, run_number: 1, state: "completed", created_at: at, finished_at: at });
    await insert(h.db, "public.ai_grades", { id: grade, submission_id: submission, score: 0, passed: false,
      identification_points: 0, explanation_points: 0, fix_points: 0 });
    await insert(h.db, "public.ai_grade_evidence", { grade_id: grade, grading_run_id: run, provider_output_retried: false });
    expected.push({ id: submission, at });
  }
  expected.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  const { b, provider } = await boundary("taB");
  provider.execute.mockResolvedValue({ output: envelope("summarize_learner", {}), usage: { inputTokens: 100, outputTokens: 20, verified: true } });
  expect(await b.execute({ operation: "summarize_learner", resourceId: accounts.learnerB.id, idempotencyKey: freshKey() }))
    .toMatchObject({ error: { code: "INVALID_AI_OUTPUT" } });
  const data = provider.execute.mock.calls[0][0].data as { payload: { submissions: { submissionId: string }[] } };
  expect(data.payload.submissions.map(s => s.submissionId)).toEqual(expected.slice(0, 20).map(s => s.id));
  expect(data.payload.submissions.some(s => s.submissionId === keys.firstA)).toBe(false);
});
