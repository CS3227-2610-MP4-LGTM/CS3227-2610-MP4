import { submissionViewSchema, type SubmissionView } from "@/lib/learner/submissions";
import { uid } from "../server/llm/fixtures";
import { completed, submission, submissionId, unmatchedId, submittedAt } from "./grading-fixture";

export const tiedTime = submittedAt;
export const actorId = uid(21);
export const fullReason = '<img src="https://attacker.example.test/reason" onerror="alert(1)"> ' + "A full explanation. ".repeat(60).trim();
export const overrides = [
  { id: uid(901), actorId, createdAt: tiedTime, auditOrder: 1, score: 90, reason: "First replacement assessment." },
  { id: uid(902), actorId: uid(22), createdAt: tiedTime, auditOrder: 3, score: 59, reason: fullReason },
];
export const resolutions = [
  { id: uid(911), actorId, createdAt: tiedTime, auditOrder: 2, disposition: "upheld", reason: "Initial disposition." },
  { id: uid(912), actorId: uid(22), createdAt: tiedTime, auditOrder: 4, disposition: "dismissed", reason: fullReason },
];
export const flagKinds = ["near_pass_mark", "grading_output_retried", "assessment_disagreement", "learner_report"] as const;
export const flagLabels = ["Score near the pass mark", "AI grading output needed a retry", "Location match and AI assessment disagree", "Learner reported an unmatched comment"];
export function moderatedSubmission(): SubmissionView {
  return submissionViewSchema.parse({
    ...submission,
    grading: { ...completed, effective: { score: 59, passed: false, source: "ta" }, overrides },
    flags: flagKinds.map((kind, index) => ({
      id: uid(801 + index), submissionId, kind, source: kind === "learner_report" ? "learner" : "rule",
      commentId: kind === "learner_report" ? unmatchedId : null,
      reason: kind === "learner_report" ? "Rounding is unspecified for fractional prices." : null,
      createdAt: tiedTime, status: index === 3 ? "resolved" : "open", resolutions: index === 3 ? resolutions : [],
    })),
  });
}
export function card(overrides: Record<string, unknown> = {}) {
  return {
    id: submissionId, challengeId: submission.challengeId, revisionId: submission.revisionId,
    title: submission.challenge.title, learner: submission.learner, attemptNumber: 1,
    submittedAt, gradingState: "completed", effectiveScore: 59, openFlagCount: 3,
    ...overrides,
  };
}
export type HistoryCard = ReturnType<typeof card>;
export type HistoryResult = { status: "ok"; page: { items: HistoryCard[]; nextCursor: string | null } }
  | { status: "invalid" | "unavailable" };
export const page = (items = [card()], nextCursor: string | null = null): HistoryResult => ({ status: "ok", page: { items, nextCursor } });
