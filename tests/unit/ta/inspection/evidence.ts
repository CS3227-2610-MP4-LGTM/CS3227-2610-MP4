import type { CodeDiff } from "@/lib/code-diff";

export const id = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
export const submittedAt = "2026-01-01T00:00:02Z";
export const answers = [
  { id: id(301), revisionId: id(201), proposalId: id(1301), category: "logic_bug" as const,
    sourceStartLine: 3, sourceEndLine: 3, startLine: 3, endLine: 3,
    originalSnippet: "  return price * (1 - fraction);", replacementSnippet: "  return price * fraction;",
    explanation: "Returns the discount amount instead of the payable price.", fix: "Multiply price by one minus fraction." },
  { id: id(302), revisionId: id(201), proposalId: id(1302), category: "edge_case" as const,
    sourceStartLine: 10, sourceEndLine: 10, startLine: 10, endLine: 10,
    originalSnippet: "  return prices.reduce((sum, price) => sum + price, 0);",
    replacementSnippet: "  return prices.reduce((sum, price) => sum + price);",
    explanation: "An empty basket causes reduce to throw.", fix: "Supply zero as the initial accumulator." },
];
export const workingCode = ["function discounted(price, percent) {", "  const fraction = percent / 100;",
  answers[0].originalSnippet, "}", "", "// Basket totals use whole currency units.", "",
  "function basketTotal(items) {", "  const prices = items.map(item => item.price);", answers[1].originalSnippet, "}", ""].join("\n");
export const flawedCode = answers.reduce((code, flaw) => code.replace(flaw.originalSnippet, flaw.replacementSnippet), workingCode);
export const code: CodeDiff = {
  path: "challenge.js", before: workingCode, after: flawedCode,
  hunks: answers.map(flaw => ({ oldStart: flaw.startLine, oldCount: 1, newStart: flaw.startLine, newCount: 1,
    lines: [ { kind: "removed", text: flaw.originalSnippet, oldLine: flaw.startLine, newLine: null },
      { kind: "added", text: flaw.replacementSnippet, oldLine: null, newLine: flaw.startLine } ] })),
};
export const comments = [
  { id: id(601), ordinal: 0, line: 3, body: "This returns the discount rather than the payable amount; multiply by one minus fraction." },
  { id: id(602), ordinal: 1, line: 6, body: "Whole currency units may discard cents; document the rounding policy." },
];
export function submission() {
  return {
    id: id(501), challengeId: id(101), revisionId: id(201), learner: { id: id(11), displayName: "Learner A" },
    attemptNumber: 1, previousSubmissionId: null, submittedAt,
    challenge: { id: id(101), revisionId: id(201), title: "Checkout totals", description: "Review the changes to discounts and basket totals.",
      language: "javascript" as const, difficulty: "easy" as const, categories: ["edge_case", "logic_bug"] as Array<"edge_case" | "logic_bug">,
      publishedAt: "2026-01-01T00:00:00Z", code },
    comments: structuredClone(comments), answerKey: structuredClone(answers),
    matching: { matches: [{ flawId: id(301), commentId: id(601), distance: 0 }], missedFlawIds: [id(302)],
      unmatchedCommentIds: [id(602)], duplicateCommentIds: [] as string[] },
    assessments: [ { flawId: id(301), commentId: id(601), explanationCredit: 1, fixCredit: 1, feedback: "The consequence and proposed fix are clear." },
      { flawId: id(302), commentId: null, explanationCredit: 0, fixCredit: 0, feedback: null } ],
    grading: { state: "completed" as "pending" | "running" | "failed" | "completed", failureCode: null as string | null,
      original: { score: 25, passMark: 60, passed: false, identificationPoints: 0, explanationPoints: 15, fixPoints: 10,
        matchedCount: 1, missedCount: 1, unmatchedCommentIds: [id(602)], duplicateCommentIds: [] as string[],
        comments: [ { commentId: id(601), matched: true, explanationCredit: 1, fixCredit: 1, feedback: "The consequence and proposed fix are clear." },
          { commentId: id(602), matched: false, explanationCredit: null, fixCredit: null, feedback: null } ],
        eligibleHints: [{ hintId: id(402), category: "edge_case" as const }] } as Original | null,
      effective: { score: 70, passed: true, source: "ta" as "ta" | "ai" } as { score: number; passed: boolean; source: "ta" | "ai" } | null,
      overrides: [{ id: id(901), actorId: id(21), createdAt: "2026-01-01T00:00:07Z", auditOrder: 1, score: 70, reason: "The additional currency concern merits credit." }] },
    flags: [{ id: id(801), submissionId: id(501), source: "learner", kind: "learner_report", commentId: id(602),
      reason: "Rounding is unspecified for fractional prices.", createdAt: "2026-01-01T00:00:04Z", status: "resolved",
      resolutions: [{ id: id(902), actorId: id(21), createdAt: "2026-01-01T00:00:08Z", auditOrder: 2,
        disposition: "upheld", reason: "The rounding requirement is ambiguous." }] }],
  };
}
type Original = { score: number; passMark: number; passed: boolean; identificationPoints: number; explanationPoints: number;
  fixPoints: number; matchedCount: number; missedCount: number; unmatchedCommentIds: string[]; duplicateCommentIds: string[];
  comments: { commentId: string; matched: boolean; explanationCredit: number | null; fixCredit: number | null; feedback: string | null }[];
  eligibleHints: { hintId: string; category: "edge_case" }[] };
export function card() {
  const view = submission();
  return { id: view.id, challengeId: view.challengeId, revisionId: view.revisionId, title: view.challenge.title,
    learner: view.learner, attemptNumber: 1, submittedAt, gradingState: "completed" as "pending" | "running" | "failed" | "completed",
    effectiveScore: 70 as number | null, openFlagCount: 0 };
}
