import { z } from "zod";
import { challengeIdSchema } from "./challenge-schema";
import { learnerFlagSchema } from "./grading";

/** The three 409 INVALID_STATE meanings, shared by the report route and client. */
export const reportErrorMessages = {
  ineligible: "This comment isn't available for reporting.",
  alreadyReported: "This comment has already been reported.",
  inProgress: "Your report is still being confirmed. Check again.",
} as const;

export const reportOutcomeMessages = {
  invalid: "The report request is invalid.",
  notFound: "We couldn't find this comment.",
  conflict: "We couldn't reuse this report request. Refresh the result to check your reports.",
  tooLarge: "This report is too large to send.",
  rateLimited: "Too many requests. Try again later.",
  failed: "We couldn't send your report. Try again.",
  uncertain: "We couldn't confirm your report. Check report again.",
  blank: "Enter a reason.",
  tooLong: "Reason is too long.",
  sent: "Report sent. A TA can review this comment.",
} as const;

export const reportReasonLimit = 2000;
/** Admits every valid payload, even 2,000 code points written as escaped surrogate pairs (24,000 bytes). */
export const reportBodyLimit = 64 * 1024;

export function reportReasonError(value: string) {
  const text = value.trim();
  if (!text) return reportOutcomeMessages.blank;
  if (Array.from(text).length > reportReasonLimit) return reportOutcomeMessages.tooLong;
}

export const reportInputSchema = z.strictObject({
  commentId: challengeIdSchema,
  reason: z.string().transform(value => value.trim()).superRefine((value, context) => {
    const message = reportReasonError(value);
    if (message) context.addIssue({ code: "custom", message });
  }),
});
export type ReportInput = z.infer<typeof reportInputSchema>;

export type ReportFlag = z.infer<typeof learnerFlagSchema>;

/** A strict acknowledgement for exactly the requested learner report. */
export function matchesReport(flag: ReportFlag, submissionId: string, input: ReportInput) {
  return flag.submissionId === submissionId.toLowerCase() && flag.commentId === input.commentId.toLowerCase()
    && flag.source === "learner" && flag.kind === "learner_report" && flag.reason === input.reason;
}
