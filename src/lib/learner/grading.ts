import { z } from "zod";
import { categorySchema, challengeIdSchema, timestampSchema } from "./challenge-schema";

export const gradingIntentHeader = "X-LGTM-Grading-Intent";

export const gradingFailureMessages = {
  RATE_LIMITED: "Grading usage limit reached. Try grading again later.",
  PAYLOAD_TOO_LARGE: "This review is too large for grading. Your submitted review is saved.",
  INVALID_AI_OUTPUT: "We couldn't produce a valid assessment. Try grading again.",
  AI_UNAVAILABLE: "AI grading is unavailable. Try grading again.",
  AI_TIMEOUT: "Grading timed out. Try grading again.",
  SERVICE_UNAVAILABLE: "Grading is unavailable. Try grading again later.",
} as const;

export const gradingFailureSchema = z.enum(Object.keys(gradingFailureMessages) as GradingFailureCode[]);
export type GradingFailureCode = keyof typeof gradingFailureMessages;
export const passMark = 60;

const credit = z.union([z.literal(0), z.literal(0.5), z.literal(1)]);
const commentResult = z.discriminatedUnion("matched", [
  z.strictObject({
    commentId: challengeIdSchema, matched: z.literal(true),
    explanationCredit: credit, fixCredit: credit, feedback: z.string().min(1),
  }),
  z.strictObject({
    commentId: challengeIdSchema, matched: z.literal(false),
    explanationCredit: z.null(), fixCredit: z.null(), feedback: z.null(),
  }),
]);
const score = z.number().int().min(0).max(100);
const original = z.strictObject({
  score, passMark: z.literal(passMark), passed: z.boolean(),
  identificationPoints: z.number().min(0).max(50),
  explanationPoints: z.number().min(0).max(30),
  fixPoints: z.number().min(0).max(20),
  matchedCount: z.number().int().nonnegative(),
  missedCount: z.number().int().nonnegative(),
  unmatchedCommentIds: z.array(challengeIdSchema),
  duplicateCommentIds: z.array(challengeIdSchema),
  comments: z.array(commentResult),
  eligibleHints: z.array(z.strictObject({ hintId: challengeIdSchema, category: categorySchema })),
}).refine(grade => {
  const matched = grade.comments.filter(comment => comment.matched);
  const unselected = new Set([...grade.unmatchedCommentIds, ...grade.duplicateCommentIds]);
  return grade.passed === (grade.score >= passMark) && matched.length === grade.matchedCount
    && new Set(grade.comments.map(comment => comment.commentId)).size === grade.comments.length
    && unselected.size === grade.unmatchedCommentIds.length + grade.duplicateCommentIds.length
    && unselected.size === grade.comments.length - matched.length
    && grade.comments.every(comment => comment.matched !== unselected.has(comment.commentId));
});

const auditFields = {
  id: challengeIdSchema, actorId: challengeIdSchema, createdAt: timestampSchema,
  auditOrder: z.number().int().positive(), reason: z.string(),
};
const pendingGradeFields = { original: z.null(), effective: z.null(), overrides: z.tuple([]) };
export const gradingViewSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.enum(["pending", "running"]), failureCode: z.null(), ...pendingGradeFields }),
  z.strictObject({ state: z.literal("failed"), failureCode: gradingFailureSchema, ...pendingGradeFields }),
  z.strictObject({
    state: z.literal("completed"), failureCode: z.null(), original,
    effective: z.strictObject({ score, passed: z.boolean(), source: z.enum(["ai", "ta"]) }),
    overrides: z.array(z.strictObject({ ...auditFields, score })),
  }),
]);

export const learnerFlagSchema = z.strictObject({
  id: challengeIdSchema, submissionId: challengeIdSchema,
  source: z.enum(["rule", "learner"]),
  kind: z.enum(["near_pass_mark", "grading_output_retried", "assessment_disagreement", "learner_report"]),
  commentId: challengeIdSchema.nullable(), reason: z.string().nullable(),
  createdAt: timestampSchema, status: z.enum(["open", "resolved"]),
  resolutions: z.array(z.strictObject({ ...auditFields, disposition: z.string() })),
});

export type GradingView = z.infer<typeof gradingViewSchema>;
export type LearnerGrade = z.infer<typeof original>;
