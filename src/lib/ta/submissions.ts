import { z } from "zod";
import type { WorkspaceAccessFailure } from "@/lib/auth/workspace-access";
const uuid = z.uuid();
const category = z.enum(["logic_bug", "edge_case", "error_handling", "security", "performance"]);
const time = z.iso.datetime({ offset: true });
const learner = z.strictObject({ id: uuid, displayName: z.string() });
export const gradingStateSchema = z.enum(["pending", "running", "failed", "completed"]);
const credit = z.union([z.literal(0), z.literal(0.5), z.literal(1)]);
const score = z.number().int().min(0).max(100);
export const cardSchema = z.strictObject({ id: uuid, challengeId: uuid, revisionId: uuid, title: z.string(), learner, attemptNumber: z.number().int(), submittedAt: time, gradingState: gradingStateSchema, effectiveScore: score.nullable(), openFlagCount: z.number().int().nonnegative() });
const commentResult = z.strictObject({ commentId: uuid, matched: z.boolean(), explanationCredit: credit.nullable(), fixCredit: credit.nullable(), feedback: z.string().nullable() });
const original = z.strictObject({ score, passed: z.boolean(), passMark: z.literal(60), identificationPoints: z.number(), explanationPoints: z.number(), fixPoints: z.number(), matchedCount: z.number().int(), missedCount: z.number().int(), unmatchedCommentIds: z.array(uuid), duplicateCommentIds: z.array(uuid), comments: z.array(commentResult), eligibleHints: z.array(z.strictObject({ hintId: uuid, category })) });
const audit = { id: uuid, actorId: uuid, createdAt: time, auditOrder: z.number().int().positive(), reason: z.string() };
const lineNumber = z.number().int().positive();
const line = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("context"), text: z.string(), oldLine: lineNumber, newLine: lineNumber }), z.strictObject({ kind: z.literal("added"), text: z.string(), oldLine: z.null(), newLine: lineNumber }), z.strictObject({ kind: z.literal("removed"), text: z.string(), oldLine: lineNumber, newLine: z.null() })]);
export const submissionSchema = z.strictObject({
 id: uuid, challengeId: uuid, revisionId: uuid, learner, attemptNumber: z.number().int(), previousSubmissionId: uuid.nullable(), submittedAt: time,
 challenge: z.strictObject({ id: uuid, revisionId: uuid, title: z.string(), description: z.string(), language: z.enum(["python", "java", "javascript", "typescript"]), difficulty: z.enum(["easy", "medium", "hard"]), categories: z.array(category), publishedAt: time, code: z.strictObject({ path: z.string(), before: z.string(), after: z.string(), hunks: z.array(z.strictObject({ oldStart: z.number().int().nonnegative(), oldCount: z.number().int().nonnegative(), newStart: z.number().int().nonnegative(), newCount: z.number().int().nonnegative(), lines: z.array(line) })) }) }),
 comments: z.array(z.strictObject({ id: uuid, ordinal: z.number().int(), line: lineNumber, body: z.string() })),
 answerKey: z.array(z.strictObject({ id: uuid, revisionId: uuid, proposalId: uuid, category, sourceStartLine: lineNumber, sourceEndLine: lineNumber, startLine: lineNumber, endLine: lineNumber, originalSnippet: z.string(), replacementSnippet: z.string(), explanation: z.string(), fix: z.string() })),
 matching: z.strictObject({ matches: z.array(z.strictObject({ flawId: uuid, commentId: uuid, distance: z.number().int().min(0).max(1) })), missedFlawIds: z.array(uuid), unmatchedCommentIds: z.array(uuid), duplicateCommentIds: z.array(uuid) }),
 assessments: z.array(z.strictObject({ flawId: uuid, commentId: uuid.nullable(), explanationCredit: credit, fixCredit: credit, feedback: z.string().nullable() })),
 grading: z.strictObject({ state: gradingStateSchema, failureCode: z.string().nullable(), original: original.nullable(), effective: z.strictObject({ score, passed: z.boolean(), source: z.enum(["ai", "ta"]) }).nullable(), overrides: z.array(z.strictObject({ ...audit, score })) }),
 flags: z.array(z.strictObject({ id: uuid, submissionId: uuid, source: z.string(), kind: z.string(), commentId: uuid.nullable(), reason: z.string().nullable(), createdAt: time, status: z.enum(["open", "resolved"]), resolutions: z.array(z.strictObject({ ...audit, disposition: z.string() })) })),
});
export type SubmissionCard = z.infer<typeof cardSchema>;
export type TaSubmissionView = z.infer<typeof submissionSchema>;
export type ReadFailure = { status: "invalid" | "not_found" | "unavailable" } | WorkspaceAccessFailure;
export type ListResult = { status: "ok"; page: { items: SubmissionCard[]; nextCursor: string | null } } | ReadFailure;
export type DetailResult = { status: "ok"; submission: TaSubmissionView } | ReadFailure;
