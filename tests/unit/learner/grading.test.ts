// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { submissionViewSchema, workspaceAccountHeader } from "@/lib/learner/submissions";
import { uid } from "../server/llm/fixtures";
import { completed, learnerId, pending, submission, submissionId } from "./grading-fixture";

// Resolve T-12 acceptance interfaces only when the tests execute.
const gradingModule = "../../../src/server/learner/grading.ts";
const readModule = "../../../src/app/api/v1/submissions/[id]/route.ts";
const gradeModule = "../../../src/app/api/v1/submissions/[id]/grade/route.ts";

type Route = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
type Credit = 0 | 0.5 | 1;
type MatchResult = {
  matches: { flawId: string; commentId: string; distance: number }[];
  missedFlawIds: string[];
  duplicateCommentIds: string[];
  unmatchedCommentIds: string[];
};
type Rules = {
  matchReview: (comments: ReturnType<typeof comment>[], flaws: ReturnType<typeof flaw>[]) => MatchResult;
  scoreReview: (input: {
    flawCount: number; matching: MatchResult; providerOutputRetried: boolean;
    assessments: { key: string; commentId: string; explanationCredit: Credit; fixCredit: Credit; feedback: string }[];
  }) => { score: number; passed: boolean; ruleFlags: string[] };
};
const rules = async () => await import(gradingModule) as Rules;

const mocks = vi.hoisted(() => ({ account: vi.fn(), userRpc: vi.fn(), admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.account }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.userRpc }) }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: mocks.admin }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValue({ status: "ok", account: { id: learnerId, role: "learner", displayName: "Learner A" } });
});

const flaw = (id: number, startLine: number, endLine = startLine) => ({ id: uid(id), startLine, endLine });
const comment = (id: number, ordinal: number, line: number) => ({ id: uid(id), ordinal, line });

it("LRN-05.5 prefers exact range matches, then ordinal, and separates duplicates from unmatched evidence", async () => {
  const { matchReview } = await rules();
  const flaws = [flaw(303, 11), flaw(302, 6), flaw(301, 3, 4)];
  const comments = [comment(604, 3, 9), comment(602, 1, 5), comment(603, 2, 4), comment(601, 0, 5)];
  expect(matchReview(comments, flaws)).toEqual({
    matches: [{ flawId: uid(301), commentId: uid(603), distance: 0 }, { flawId: uid(302), commentId: uid(601), distance: 1 }],
    missedFlawIds: [uid(303)], duplicateCommentIds: [uid(602)], unmatchedCommentIds: [uid(604)],
  });
});

it("LRN-05.5 orders equally distant flaws by range start and then by flaw ID", async () => {
  const { matchReview } = await rules();
  expect(matchReview([comment(601, 0, 5)], [flaw(303, 6), flaw(302, 4), flaw(301, 4)])).toEqual({
    matches: [{ flawId: uid(301), commentId: uid(601), distance: 1 }],
    missedFlawIds: [uid(302), uid(303)], duplicateCommentIds: [], unmatchedCommentIds: [],
  });
});

async function score(flawCount: number, pairs: [Credit, Credit][], unmatched = 0, duplicate = 0, providerOutputRetried = false) {
  const { matchReview, scoreReview } = await rules();
  const flaws = Array.from({ length: flawCount }, (_, index) => flaw(301 + index, 3 + 4 * index));
  const matches = pairs.map((_, index) => comment(601 + index, index, flaws[index].startLine));
  const others = [
    ...Array.from({ length: duplicate }, (_, index) => comment(650 + index, pairs.length + index, flaws[0].startLine)),
    ...Array.from({ length: unmatched }, (_, index) => comment(660 + index, pairs.length + duplicate + index, 1)),
  ];
  return scoreReview({
    flawCount,
    matching: matchReview([...matches, ...others], flaws),
    assessments: pairs.map(([explanationCredit, fixCredit], index) => ({
      key: flaws[index].id, commentId: matches[index].id, explanationCredit, fixCredit, feedback: "A specific assessment.",
    })),
    providerOutputRetried,
  });
}

it.each([0, 2])("LRN-05.4 completes a real zero grade with no matches and %d unmatched comments", async unmatched => {
  expect(await score(2, [], unmatched)).toMatchObject({
    score: 0, passMark: 60, passed: false, identificationPoints: 0, explanationPoints: 0,
    fixPoints: 0, matchedCount: 0, missedCount: 2, ruleFlags: [],
  });
});

it("LRN-05.4 deducts only unmatched comments and aggregates credits independently across the pinned flaw count", async () => {
  const grade = await score(3, [[1, 0.5], [0, 1]], 1, 1);
  expect(grade).toMatchObject({
    identificationPoints: 16.67, explanationPoints: 10, fixPoints: 10,
    score: 37, passMark: 60, passed: false, matchedCount: 2, missedCount: 1, ruleFlags: [],
  });
  expect(await score(2, [[1, 1]], 3, 1)).toMatchObject({ identificationPoints: 0, score: 25 });
});

it.each<{ value: number; flaws: number; pairs: [Credit, Credit][]; near: boolean }>([
  { value: 54, flaws: 4, pairs: [[0.5, 1], [0, 1], [0, 0.5]], near: false },
  { value: 55, flaws: 2, pairs: [[0, 0.5], [0, 0]], near: true },
  { value: 59, flaws: 4, pairs: [[0.5, 1], [0.5, 0.5], [0.5, 0.5]], near: true },
  { value: 60, flaws: 1, pairs: [[0, 0.5]], near: true },
  { value: 65, flaws: 1, pairs: [[0.5, 0]], near: true },
  { value: 66, flaws: 4, pairs: [[1, 1], [1, 0.5], [0.5, 0.5]], near: false },
])("LRN-05.4 rounds to $value before deciding pass and near-pass flag", async ({ value, flaws, pairs, near }) => {
  const grade = await score(flaws, pairs);
  expect(grade).toMatchObject({ score: value, passed: value >= 60 });
  expect(grade.ruleFlags.includes("near_pass_mark")).toBe(near);
});

it("SEC-05.3 flags a successful invalid-output retry and one disagreement even with several zero-credit matches", async () => {
  const pairs = [[0, 0], [0, 0]] satisfies [Credit, Credit][];
  const retried = await score(2, pairs, 0, 0, true);
  expect(retried.ruleFlags).toHaveLength(2);
  expect(retried.ruleFlags).toEqual(expect.arrayContaining([
    "assessment_disagreement", "grading_output_retried",
  ]));
  expect((await score(2, pairs)).ruleFlags).toEqual(["assessment_disagreement"]);
});

it("LRN-05.4 SEC-03.1 accepts only the strict Learner grade projection and rejects private or contradictory fields", () => {
  const view = { ...submission, grading: completed };
  expect(submissionViewSchema.safeParse(view).success).toBe(true);
  for (const grading of [
    { ...completed, matching: {} },
    { ...completed, original: { ...completed.original, answerKey: [] } },
    { ...completed, original: { ...completed.original, comments: [
      { ...completed.original.comments[0], flawId: uid(301) }, ...completed.original.comments.slice(1),
    ] } },
    { ...completed, original: { ...completed.original, comments: [
      completed.original.comments[0], { ...completed.original.comments[1], fixCredit: 0 }, completed.original.comments[2],
    ] } },
    { ...pending, original: completed.original },
    { ...completed, original: null },
  ]) expect(submissionViewSchema.safeParse({ ...submission, grading }).success).toBe(false);
});

const params = { params: Promise.resolve({ id: submissionId }) };
const origin = "https://app.example.test";
const submissionPath = `/api/v1/submissions/${submissionId}`;
async function grade({ body = "{}", query = "", headers: overrides = {} }: {
  body?: string; query?: string; headers?: Record<string, string | null>;
} = {}) {
  const headers = new Headers({
    "Content-Type": "application/json", "Idempotency-Key": uid(951), Origin: origin, Host: "app.example.test",
    [workspaceAccountHeader]: learnerId,
  });
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(name);
    else headers.set(name, value);
  }
  const { POST } = await import(gradeModule) as { POST: Route };
  return POST(new Request(`https://next.internal${submissionPath}/grade${query}`, { method: "POST", headers, body }), params);
}

it.each([
  { body: "{", label: "malformed JSON" }, { body: "null", label: "null" }, { body: "[]", label: "array" },
  { body: '{"submissionId":"different","matches":[]}', label: "client fields" },
  { query: "?runId=foo", label: "unexpected query" },
  { headers: { "Idempotency-Key": null }, label: "missing replay key" },
  { headers: { "Idempotency-Key": "bad" }, label: "invalid replay key" },
])("SYS-02.1 LRN-05.2 rejects $label before privileged grading access", async input => {
  const response = await grade(input);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  expect(mocks.admin).not.toHaveBeenCalled();
});

it.each<Record<string, string>>([
  { Origin: "https://foreign.example.test" },
  { Origin: "https://foreign.example.test", "X-Forwarded-Host": "foreign.example.test" },
  { Host: "app.example.test/path" },
  { [workspaceAccountHeader]: uid(12) },
  { [workspaceAccountHeader]: "invalid" },
])("SYS-09.3 SYS-12.1 rejects cross-Origin or account changes without privileged access (%j)", async headers => {
  const response = await grade({ headers });
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  expect(mocks.admin).not.toHaveBeenCalled();
});

it.each([
  { account: { status: "unauthenticated" }, status: 401, code: "UNAUTHENTICATED" },
  { account: { status: "forbidden" }, status: 403, code: "FORBIDDEN" },
  { account: { status: "ok", account: { id: learnerId, role: "author", displayName: "Author A" } }, status: 403, code: "FORBIDDEN" },
  { account: { status: "unavailable" }, status: 503, code: "SERVICE_UNAVAILABLE" },
])("SYS-11.1 SYS-11.2 SYS-11.3 SYS-11.4 protects both grading routes on $code", async ({ account, status, code }) => {
  mocks.account.mockResolvedValue(account);
  const { GET } = await import(readModule) as { GET: Route };
  for (const response of [await grade(), await GET(new Request(origin + submissionPath), params)]) {
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ error: { code } });
  }
  expect(mocks.admin).not.toHaveBeenCalled();
});
