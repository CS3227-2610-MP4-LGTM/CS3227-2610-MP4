import { z } from "zod";
import { categorySchema, challengeIdSchema } from "./challenge-schema";
import type { SubmissionView } from "./submissions";

export const learnerHintSchema = z.strictObject({
  hintId: challengeIdSchema, category: categorySchema,
  text: z.string().min(1).refine(text => Array.from(text).length <= 500),
});
export type LearnerHint = z.infer<typeof learnerHintSchema>;

export type RetryEligibility = { published: boolean; secondSubmissionId: string | null };

export function retryUnavailableReason(submission: SubmissionView, eligibility: RetryEligibility) {
  if (submission.attemptNumber === 2) return "You have used your retry.";
  if (submission.grading.state !== "completed") return "Retry is available after your first assessment completes.";
  if (eligibility.secondSubmissionId) return "You have used your retry.";
  if (!eligibility.published) return "Retry is unavailable while this challenge is not published.";
}
