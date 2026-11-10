import { uid } from "../server/llm/fixtures";

export const submissionId = uid(501);
export const learnerId = uid(11);
export const challengeId = uid(101);
export const revisionId = uid(201);
export const submittedAt = "2026-01-01T00:00:00Z";
export const matchedId = uid(601);
export const duplicateId = uid(602);
export const unmatchedId = uid(603);
export const original = {
  score: 25, passMark: 60, passed: false,
  identificationPoints: 0, explanationPoints: 15, fixPoints: 10,
  matchedCount: 1, missedCount: 1,
  unmatchedCommentIds: [unmatchedId], duplicateCommentIds: [duplicateId],
  comments: [
    { commentId: matchedId, matched: true, explanationCredit: 1, fixCredit: 1, feedback: "The consequence is clear." },
    { commentId: duplicateId, matched: false, explanationCredit: null, fixCredit: null, feedback: null },
    { commentId: unmatchedId, matched: false, explanationCredit: null, fixCredit: null, feedback: null },
  ],
  eligibleHints: [{ hintId: uid(402), category: "edge_case" }],
} as const;
export const completed = {
  state: "completed", failureCode: null, original,
  effective: { score: 25, passed: false, source: "ai" }, overrides: [],
} as const;
export const pending = { state: "pending", failureCode: null, original: null, effective: null, overrides: [] } as const;
export const running = { ...pending, state: "running" } as const;
export const failed = (failureCode: string) => ({ ...pending, state: "failed" as const, failureCode });

const source = ["// Checkout", "const fraction = 0.25;", "return price * fraction;", "// Same flaw", "// unchanged", "// cents"];
export const submission = {
  id: submissionId, challengeId, revisionId, learner: { id: learnerId, displayName: "Learner A" },
  attemptNumber: 1, previousSubmissionId: null, submittedAt,
  challenge: {
    id: challengeId, revisionId, title: "Checkout totals", description: "Review discounts and basket totals.",
    language: "javascript", difficulty: "easy", categories: ["edge_case", "logic_bug"], publishedAt: submittedAt,
    code: { path: "challenge.js", before: "", after: source.join("\n") + "\n", hunks: [{
      oldStart: 0, oldCount: 0, newStart: 1, newCount: source.length,
      lines: source.map((text, index) => ({ kind: "added", text, oldLine: null, newLine: index + 1 })),
    }] },
  },
  comments: [
    { id: matchedId, ordinal: 0, line: 3, body: "This returns the discount rather than the payable amount." },
    { id: duplicateId, ordinal: 1, line: 4, body: "Another comment about the same calculation." },
    { id: unmatchedId, ordinal: 2, line: 6, body: '<img src="https://attacker.example.test/a" onerror="alert(1)">' },
  ],
  flags: [],
};
