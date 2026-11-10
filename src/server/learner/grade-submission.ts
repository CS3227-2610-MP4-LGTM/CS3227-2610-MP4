import "server-only";
import { z } from "zod";
import { challengeIdSchema } from "@/lib/learner/challenge-schema";
import { gradingFailureSchema, gradingIntentHeader, gradingViewSchema, type GradingFailureCode, type GradingView } from "@/lib/learner/grading";
import { pendingGrade } from "@/lib/learner/submissions";
import type { ReadFailure } from "@/lib/learner/challenges";
import type { WorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { createAdminClient } from "@/server/supabase/admin";
import { createAccountingStore } from "@/server/llm/accounting";
import { createLlmBoundary } from "@/server/llm/boundary";
import { ceilings } from "@/server/llm/config";
import { errorCode, fail } from "@/server/llm/errors";
import { matchReview, scoreReview } from "./grading";
import { matchesRequestOrigin, matchesWorkspaceAccount, readLearnerSubmissionWithAccess, readRequestBody, submissionCaller } from "./submissions";

const completedSchema = z.strictObject({
  status: z.literal("completed"),
  grading: gradingViewSchema.refine(grading => grading.state === "completed"),
});
const startSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("started"), gradingRunId: challengeIdSchema }),
  completedSchema,
  z.strictObject({ status: z.enum(["pending", "invalid_state", "idempotency_conflict"]) }),
  z.strictObject({ status: z.literal("failed"), failureCode: gradingFailureSchema }),
]);

const matchingContextSchema = z.object({
  revisionId: challengeIdSchema,
  flaws: z.array(z.object({
    id: challengeIdSchema, revision_id: challengeIdSchema,
    start_line: z.number().int().positive(), end_line: z.number().int().positive(),
  })).max(5),
});

type GradeResult =
  | { status: "ok"; grading: GradingView }
  | { status: "failed"; failureCode: GradingFailureCode }
  | { status: "invalid_state" }
  | { status: "idempotency_conflict" }
  | { status: "too_large" }
  | ReadFailure
  | WorkspaceAccessFailure;

export async function requestLearnerGrade(id: string, request: Request): Promise<GradeResult> {
  const caller = await submissionCaller();
  if (caller.status !== "ok") return caller;
  const url = new URL(request.url);
  if (!matchesRequestOrigin(request, url)) return { status: "forbidden" };
  if (!matchesWorkspaceAccount(request, caller.account.id)) return { status: "account_unavailable" };

  const key = challengeIdSchema.safeParse(request.headers.get("Idempotency-Key"));
  const intent = z.enum(["initial", "retry"]).safeParse(request.headers.get(gradingIntentHeader));
  if (!key.success || !intent.success || !challengeIdSchema.safeParse(id).success || url.searchParams.size) {
    return { status: "invalid" };
  }
  const raw = await readRequestBody(request, 1024);
  if (raw.status !== "ok") return raw;
  if (!z.strictObject({}).safeParse(raw.value).success) return { status: "invalid" };

  const observed = await readLearnerSubmissionWithAccess(id, caller);
  if (observed.status !== "ok") return observed;
  const { submission } = observed;

  // Every privileged call follows the cookie-scoped account and ownership
  // checks. The start RPC takes the submission lock and repeats them.
  const args = { p_account_id: caller.account.id, p_submission_id: submission.id };
  try {
    const admin = createAdminClient();
    const startArgs = {
      ...args, p_idempotency_key: key.data, p_intent: intent.data,
    };
    const { data, error } = await admin.rpc("start_learner_grading", startArgs);
    if (error?.message === "INVALID_STATE") return { status: "invalid_state" };
    if (error?.message === "FORBIDDEN") return { status: "forbidden" };
    if (error) return { status: "unavailable" };
    const started = startSchema.parse(data);
    if (started.status === "failed") return started;
    if (started.status === "completed") return { status: "ok", grading: started.grading };
    if (started.status === "pending") return { status: "ok", grading: { ...pendingGrade, overrides: [] } };
    if (started.status !== "started") return { status: started.status };

    const run = { ...args, p_grading_run_id: started.gradingRunId };
    async function recordFailure(code: string): Promise<GradeResult> {
      const parsed = gradingFailureSchema.safeParse(code);
      const { data, error } = await admin.rpc("fail_learner_grading", {
        ...run, p_failure_code: parsed.success ? parsed.data : "SERVICE_UNAVAILABLE",
      });
      if (error?.message === "INVALID_STATE") {
        // The key is already bound to this run. Read its outcome if a retry
        // expired the run first or the completion acknowledgement was lost.
        const replay = await admin.rpc("start_learner_grading", startArgs);
        if (replay.error?.message === "FORBIDDEN") return { status: "forbidden" };
        if (replay.error) return { status: "unavailable" };
        const recorded = startSchema.parse(replay.data);
        if (recorded.status === "failed") return recorded;
        if (recorded.status === "completed") return { status: "ok", grading: recorded.grading };
        return { status: "invalid_state" };
      }
      if (error?.message === "FORBIDDEN") return { status: "forbidden" };
      if (error) return { status: "unavailable" };
      return { status: "failed", ...z.strictObject({ failureCode: gradingFailureSchema }).parse(data) };
    }

    try {
      const clock = Date.now;
      const env = process.env;
      const accounting = createAccountingStore({ clock, limits: ceilings, environmentId: env.APP_ENV ?? "unconfigured" });
      const context = matchingContextSchema.parse(await accounting.gradingContext!({
        accountId: caller.account.id, submissionId: submission.id, gradingRunId: started.gradingRunId,
      }));
      if (context.revisionId !== submission.revisionId || context.flaws.some(flaw => flaw.revision_id !== submission.revisionId)) {
        fail("SERVICE_UNAVAILABLE");
      }
      const flaws = context.flaws.map(({ id, start_line, end_line }) => ({ id, startLine: start_line, endLine: end_line }));
      const matching = matchReview(submission.comments, flaws);
      const result = await createLlmBoundary({ client: caller.client, accounting, clock, limits: ceilings, env }).execute({
        operation: "assess_review", resourceId: submission.id, idempotencyKey: key.data,
      }, {
        gradingRunId: started.gradingRunId,
        matches: matching.matches.map(({ flawId, commentId }) => ({ key: flawId, commentId })),
      });
      if (!result.data || result.data.operation !== "assess_review") {
        return await recordFailure("error" in result ? result.error.code : "SERVICE_UNAVAILABLE");
      }

      const providerOutputRetried = result.meta.outputRetried;
      const assessed = result.data.payload.assessments;
      const byComment = new Map(assessed.map(assessment => [assessment.commentId, assessment]));
      const { ruleFlags, ...score } = scoreReview({ flawCount: flaws.length, matching, assessments: assessed, providerOutputRetried });
      const { data: completed, error: completionError } = await admin.rpc("complete_learner_grading", {
        ...run,
        p_payload: {
          original: {
            ...score,
            unmatchedCommentIds: matching.unmatchedCommentIds,
            duplicateCommentIds: matching.duplicateCommentIds,
            comments: submission.comments.map(({ id: commentId }) => {
              const assessment = byComment.get(commentId);
              return {
                commentId, matched: Boolean(assessment),
                explanationCredit: assessment?.explanationCredit ?? null,
                fixCredit: assessment?.fixCredit ?? null,
                feedback: assessment?.feedback ?? null,
              };
            }),
          },
          matching,
          assessments: [
            ...assessed.map(({ key: flawId, ...assessment }) => ({ flawId, ...assessment })),
            ...matching.missedFlawIds.map(flawId => ({
              flawId, commentId: null, explanationCredit: 0, fixCredit: 0, feedback: null,
            })),
          ],
          ruleFlags,
          providerOutputRetried,
        },
      });
      if (completionError?.message === "FORBIDDEN") return { status: "forbidden" };
      if (completionError) {
        // The database records AI_TIMEOUT if this run reached its deadline.
        // The failure write can only change the same still-running, ungraded run.
        return await recordFailure("SERVICE_UNAVAILABLE");
      }
      const resultView = completedSchema.safeParse(completed);
      return resultView.success ? { status: "ok", grading: resultView.data.grading } : { status: "unavailable" };
    } catch (error) {
      return await recordFailure(errorCode(error));
    }
  } catch {
    return { status: "unavailable" };
  }
}
