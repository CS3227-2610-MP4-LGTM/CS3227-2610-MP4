import { z } from "zod";
import { challengeCardSchema, challengeIdSchema, timestampSchema } from "./challenge-schema";

export const submissionErrorMessages = {
  lifecycleUnavailable: "This challenge is no longer available for submission.",
  inProgress: "Submission is still being confirmed. Check again.",
  submissionUnavailable: "We couldn't submit your review. Try again.",
  accountServiceUnavailable: "We can't check your account right now. Try again.",
} as const;

export const commentLimit = 50;
export const commentTextLimit = 2000;
export const reviewBodyLimit = 128 * 1024;
export const historyHref = "/learner/history";
export const workspaceAccountHeader = "X-LGTM-Workspace-Account-Id";

export function commentError(body: string) {
  const text = body.trim();
  if (!text) return "Enter a comment.";
  if (Array.from(text).length > commentTextLimit) return "Comment is too long.";
  if (text.includes("\0") || !text.isWellFormed()) return "Enter a valid comment.";
}

const lineSchema = z.number().int().min(1).max(2147483647);
const commentBodySchema = z.string().transform(value => value.trim()).superRefine((value, context) => {
  const message = commentError(value);
  if (message) context.addIssue({ code: "custom", message });
});
export const submissionInputSchema = z.strictObject({
  revisionId: challengeIdSchema,
  comments: z.array(z.strictObject({ line: lineSchema, body: commentBodySchema })).max(commentLimit),
}).refine(({ comments }) => comments.every((comment, index) =>
  index === 0 || comment.line >= comments[index - 1].line,
), "Comments must be in line order.");
export type SubmissionInput = z.infer<typeof submissionInputSchema>;

const savedCommentSchema = z.strictObject({
  id: challengeIdSchema, ordinal: z.number().int().min(0).max(commentLimit - 1),
  line: lineSchema, body: commentBodySchema,
});

const addedLineSchema = z.strictObject({
  kind: z.literal("added"), oldLine: z.null(), newLine: lineSchema, text: z.string(),
});
const learnerCodeSchema = z.strictObject({
  path: z.string(),
  before: z.literal(""),
  after: z.string(),
  hunks: z.tuple([z.strictObject({
    oldStart: z.literal(0), oldCount: z.literal(0), newStart: z.literal(1),
    newCount: lineSchema, lines: z.array(addedLineSchema),
  })]),
});

export const submissionFieldsSchema = z.strictObject({
  id: challengeIdSchema,
  challengeId: challengeIdSchema,
  revisionId: challengeIdSchema,
  learner: z.strictObject({ id: challengeIdSchema, displayName: z.string().min(1) }),
  attemptNumber: z.union([z.literal(1), z.literal(2)]),
  previousSubmissionId: challengeIdSchema.nullable(),
  submittedAt: timestampSchema,
  comments: z.array(savedCommentSchema).max(commentLimit).refine(comments =>
    comments.every((comment, index) => comment.ordinal === index)
    && new Set(comments.map(comment => comment.id)).size === comments.length,
  ),
});
export const pendingGrade = {
  state: "pending", failureCode: null, original: null, effective: null, overrides: [],
} as const;

export const submissionViewSchema = submissionFieldsSchema.extend({
  challenge: challengeCardSchema.extend({ code: learnerCodeSchema }),
  grading: z.strictObject({
    state: z.literal("pending"), failureCode: z.null(), original: z.null(), effective: z.null(), overrides: z.tuple([]),
  }),
  flags: z.tuple([]),
}).refine(({ attemptNumber, previousSubmissionId, challengeId, revisionId, challenge, comments }) => {
  const source = challenge.code.after;
  const sourceLines = (source.endsWith("\n") ? source.slice(0, -1) : source).split("\n");
  const [hunk] = challenge.code.hunks;
  return challenge.id === challengeId && challenge.revisionId === revisionId
    && (attemptNumber === 1) === (previousSubmissionId === null)
    && hunk.newCount === sourceLines.length && hunk.lines.length === sourceLines.length
    && hunk.lines.every((line, index) => line.newLine === index + 1 && line.text === sourceLines[index])
    && comments.every(comment => comment.line <= sourceLines.length);
});
export type SubmissionView = z.infer<typeof submissionViewSchema>;
export const submissionSuccessSchema = z.strictObject({ data: submissionViewSchema });

export const submissionFailureSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(), message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export const submissionOutcomeMessages = {
  stale: "This challenge changed since you opened it. Your review has not been submitted.",
  attemptLimit: "You can't submit another attempt for this challenge.",
  tooLarge: "This review is too large to submit. Shorten or remove comments and try again.",
  invalid: "The review request is invalid.",
  invalidLine: "This line is outside the submitted revision.",
  notFound: "We couldn't find this challenge.",
  rateLimited: "Too many requests. Try again later.",
  conflict: "This submission request couldn't be reused. Open Review history to check your attempts.",
  uncertain: "We couldn't confirm submission. Check submission again before changing your review.",
} as const;
