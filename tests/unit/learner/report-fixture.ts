import { submissionViewSchema, type SubmissionView } from "@/lib/learner/submissions";
import { uid } from "../server/llm/fixtures";
import { completed, learnerId, submission, submissionId, submittedAt, unmatchedId } from "./grading-fixture";

/** Deterministic Learner report DTOs for T-15 contract and component tests. No network or database. */
export const reportKey = uid(951);
export const reportFlagId = uid(851);
export const reportEndpoint = `/api/v1/submissions/${submissionId}/reports`;
export const resultEndpoint = `/api/v1/submissions/${submissionId}`;
export const reportReason = "Rounding is unspecified for fractional prices.";
export const markupReason = '<img src="https://attacker.example.test/report" onerror="alert(1)"> Cents are discarded.';

export const reportCopy = {
  action: "Report unmatched comment",
  instructions: "Explain why this comment identifies an issue missing from the answer key. Reporting does not change your grade.",
  send: "Send report",
  sending: "Sending report…",
  cancel: "Cancel",
  blank: "Enter a reason.",
  tooLong: "Reason is too long.",
  sent: "Report sent. A TA can review this comment.",
  reported: "Reported",
  duplicate: "This comment has already been reported.",
  uncertain: "We couldn't confirm your report. Check report again.",
  check: "Check report",
  checking: "Checking report…",
  inProgress: "Your report is still being confirmed. Check again.",
  failed: "We couldn't send your report. Try again.",
  throttled: "Too many requests. Try again later.",
  unavailable: "This comment isn't available for reporting.",
  back: "Back to result",
  conflict: "We couldn't reuse this report request. Refresh the result to check your reports.",
  refresh: "Refresh result",
} as const;

export function reportFlag(overrides: Partial<SubmissionView["flags"][number]> = {}): SubmissionView["flags"][number] {
  return {
    id: reportFlagId, submissionId, source: "learner", kind: "learner_report", commentId: unmatchedId,
    reason: reportReason, createdAt: submittedAt, status: "open", resolutions: [], ...overrides,
  };
}

export const resolvedReport = () => reportFlag({
  status: "resolved",
  resolutions: [{ id: uid(911), actorId: uid(21), createdAt: submittedAt, auditOrder: 1, disposition: "dismissed", reason: "The answer key covers this." }],
});

export function completedView(flags: SubmissionView["flags"] = []): SubmissionView {
  return submissionViewSchema.parse({ ...submission, grading: completed, flags });
}

export function secondAttemptView(flags: SubmissionView["flags"] = []): SubmissionView {
  return submissionViewSchema.parse({
    ...submission, id: uid(502), attemptNumber: 2, previousSubmissionId: submissionId, grading: completed,
    flags: flags.map(flag => ({ ...flag, submissionId: uid(502) })),
  });
}

export const errorBody = (code: string, message: string) => ({ error: { code, message } });

export function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", ...headers },
  });
}

export { learnerId, submissionId, unmatchedId };
