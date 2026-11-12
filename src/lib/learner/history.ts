import { z } from "zod";
import { challengeIdSchema, timestampSchema } from "./challenge-schema";
import type { ReadFailure } from "./challenges";
import type { WorkspaceAccessFailure } from "@/lib/auth/workspace-access";

export const submissionCardSchema = z.strictObject({
  id: challengeIdSchema, challengeId: challengeIdSchema, revisionId: challengeIdSchema,
  title: z.string().min(1).max(120),
  learner: z.strictObject({ id: challengeIdSchema, displayName: z.string().min(1) }),
  attemptNumber: z.union([z.literal(1), z.literal(2)]), submittedAt: timestampSchema,
  gradingState: z.enum(["pending", "running", "failed", "completed"]),
  effectiveScore: z.number().int().min(0).max(100).nullable(),
  openFlagCount: z.number().int().nonnegative(),
}).refine(card => (card.gradingState === "completed") === (card.effectiveScore !== null));
export const submissionPageSchema = z.strictObject({
  items: z.array(submissionCardSchema).max(50), nextCursor: z.string().min(1).max(512).nullable(),
});
export type SubmissionPage = z.infer<typeof submissionPageSchema>;
export type HistoryResult = { status: "ok"; page: SubmissionPage } | ReadFailure | WorkspaceAccessFailure;
