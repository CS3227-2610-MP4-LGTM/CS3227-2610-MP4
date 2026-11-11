import "server-only";
import { z } from "zod";
import { isWorkspaceAccessFailure, type WorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { challengeCardSchema, challengeIdSchema } from "@/lib/learner/challenge-schema";
import { genericReadFailure, type ReadFailure } from "@/lib/learner/challenges";
import { gradingViewSchema, learnerFlagSchema } from "@/lib/learner/grading";
import { learnerHintSchema, type RetryEligibility } from "@/lib/learner/feedback";
import {
  commentLimit, pendingGrade, reviewBodyLimit, submissionFieldsSchema, submissionInputSchema,
  submissionOutcomeMessages, submissionViewSchema, workspaceAccountHeader, type SubmissionView,
} from "@/lib/learner/submissions";
import { matchesRequestOrigin, readJsonBody } from "@/server/http/request";
import { createClient } from "@/server/supabase/server";
import { checkLearnerAccount, type LearnerClient } from "./access";
import { projectLearnerCode } from "./projection";

const projectionSchema = submissionFieldsSchema.extend({ challenge: challengeCardSchema.extend({ source: z.string() }) });
const successSchema = z.strictObject({ status: z.literal("ok"), submission: projectionSchema });
const resultReadSchema = z.union([
  z.strictObject({ status: z.literal("ok"), submission: projectionSchema.extend({
    grading: gradingViewSchema, flags: z.array(learnerFlagSchema),
  }) }),
  z.strictObject({ status: z.enum(["forbidden", "not_found"]) }),
]);
const readDenial = z.strictObject({ status: z.enum(["forbidden", "not_found"]) });
const retryEligibilitySchema = z.union([
  z.strictObject({ status: z.literal("ok"), published: z.boolean(), secondSubmissionId: challengeIdSchema.nullable() }),
  readDenial,
]);
const hintReadSchema = z.union([z.strictObject({ status: z.literal("ok"), hint: learnerHintSchema }), readDenial]);
const createResultSchema = z.union([
  successSchema,
  z.strictObject({ status: z.literal("invalid"), invalidCommentIndex: z.number().int().min(0).max(commentLimit - 1).optional() }),
  z.strictObject({ status: z.enum([
    "forbidden", "not_found", "lifecycle_unavailable", "version_conflict", "attempt_limit", "in_progress", "idempotency_conflict",
  ]) }),
]);

type Success = { status: "ok"; submission: SubmissionView };
type Invalid = { status: "invalid"; fieldErrors?: Record<string, string[]> };
type CreateFailure =
  | { status: "forbidden" | "not_found" | "lifecycle_unavailable" | "version_conflict" | "attempt_limit" | "in_progress" | "idempotency_conflict"
      | "too_large" | "unavailable" | "uncertain" | "rate_limited" }
  | Invalid | WorkspaceAccessFailure;
export type CreateSubmissionResult = Success | CreateFailure;

export async function submissionCaller() {
  try {
    const client = await createClient();
    const caller = await checkLearnerAccount(client);
    return caller.status === "ok" ? { ...caller, client } : caller;
  } catch {
    return { status: "account_service_unavailable" } as const;
  }
}

async function afterDatabaseDenial(client: LearnerClient) {
  const caller = await checkLearnerAccount(client);
  return caller.status === "ok" ? { status: "unavailable" } as const : caller;
}

function buildView(projection: z.infer<typeof projectionSchema> & Partial<Pick<SubmissionView, "grading" | "flags">>, learnerId: string) {
  const { challenge: { source, ...challenge }, ...submission } = projection;
  if (submission.learner.id !== learnerId) throw new Error("Unexpected submission owner");
  return submissionViewSchema.parse({
    grading: pendingGrade,
    flags: [],
    ...submission,
    challenge: { ...challenge, code: projectLearnerCode(challenge.language, source) },
  });
}

export async function readLearnerSubmissionWithAccess(
  id: string, checkedCaller?: Awaited<ReturnType<typeof submissionCaller>>,
): Promise<Success | ReadFailure | WorkspaceAccessFailure> {
  const caller = checkedCaller ?? await submissionCaller();
  if (caller.status !== "ok") return caller;
  const parsedId = challengeIdSchema.safeParse(id);
  if (!parsedId.success) return { status: "not_found" };
  try {
    const { data, error } = await caller.client.rpc("read_learner_submission", { p_submission_id: parsedId.data });
    if (error) return { status: "unavailable" };
    const result = resultReadSchema.parse(data);
    if (result.status === "forbidden") {
      const access = await afterDatabaseDenial(caller.client);
      return access.status === "unavailable" ? result : access;
    }
    if (result.status !== "ok") return result;
    if (result.submission.id !== parsedId.data.toLowerCase()) return { status: "unavailable" };
    return { status: "ok", submission: buildView(result.submission, caller.account.id) };
  } catch {
    return { status: "unavailable" };
  }
}

export async function readLearnerSubmission(id: string) {
  const result = await readLearnerSubmissionWithAccess(id);
  return isWorkspaceAccessFailure(result) ? genericReadFailure(result) : result;
}

export async function readLearnerResultWithRetry(id: string): Promise<
  (Success & { retry?: RetryEligibility }) | ReadFailure | WorkspaceAccessFailure
> {
  const caller = await submissionCaller();
  if (caller.status !== "ok") return caller;
  const source = await readLearnerSubmissionWithAccess(id, caller);
  if (source.status !== "ok") return source;
  try {
    const { data, error } = await caller.client.rpc("read_learner_retry_eligibility", { p_submission_id: source.submission.id });
    if (error) return source;
    const eligibility = retryEligibilitySchema.parse(data);
    if (eligibility.status === "forbidden") {
      const access = await afterDatabaseDenial(caller.client);
      return access.status === "unavailable" ? eligibility : access;
    }
    if (eligibility.status !== "ok") return eligibility;
    const { published, secondSubmissionId } = eligibility;
    return { ...source, retry: { published, secondSubmissionId } };
  } catch {
    return source;
  }
}

export async function readLearnerHint(
  id: string, hintId: string, caller: Extract<Awaited<ReturnType<typeof submissionCaller>>, { status: "ok" }>,
) {
  const submissionId = challengeIdSchema.safeParse(id);
  const hint = challengeIdSchema.safeParse(hintId);
  if (!submissionId.success || !hint.success) return { status: "invalid" } as const;
  try {
    const { data, error } = await caller.client.rpc("read_learner_submission_hint", {
      p_submission_id: submissionId.data, p_hint_id: hint.data,
    });
    if (error) return { status: "unavailable" } as const;
    const result = hintReadSchema.parse(data);
    if (result.status === "forbidden") {
      const access = await afterDatabaseDenial(caller.client);
      return access.status === "unavailable" ? result : access;
    }
    if (result.status === "ok" && result.hint.hintId !== hint.data.toLowerCase()) return { status: "unavailable" } as const;
    return result;
  } catch {
    return { status: "unavailable" } as const;
  }
}

/** Shared request-body reader (see `@/server/http/request`), kept here for existing Learner and TA importers. */
export function readRequestBody(request: Request, byteLimit = reviewBodyLimit) {
  return readJsonBody(request, byteLimit);
}

function validationFailure(error: z.ZodError): Invalid {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    // Only the fixed comment-text messages are safe to return. In particular,
    // Zod's strict-object messages can include unknown property names.
    if (issue.code === "custom" && /^comments\.\d+\.body$/.test(path)) {
      (fieldErrors[path] ??= []).push(issue.message);
    }
  }
  return Object.keys(fieldErrors).length ? { status: "invalid", fieldErrors } : { status: "invalid" };
}

export { matchesRequestOrigin };

export function matchesWorkspaceAccount(request: Request, accountId: string) {
  const workspaceAccount = request.headers.get(workspaceAccountHeader);
  if (workspaceAccount === null) return true;
  const expectedAccount = challengeIdSchema.safeParse(workspaceAccount);
  return expectedAccount.success && expectedAccount.data.toLowerCase() === accountId.toLowerCase();
}

export async function createLearnerSubmission(id: string, request: Request): Promise<CreateSubmissionResult> {
  const caller = await submissionCaller();
  if (caller.status !== "ok") return caller;
  const url = new URL(request.url);
  if (!matchesRequestOrigin(request, url)) return { status: "forbidden" };
  if (!matchesWorkspaceAccount(request, caller.account.id)) return { status: "account_unavailable" };
  const challengeId = challengeIdSchema.safeParse(id);
  const key = challengeIdSchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!challengeId.success || !key.success || url.searchParams.size) return { status: "invalid" };
  const raw = await readJsonBody(request, reviewBodyLimit);
  if (raw.status !== "ok") return raw;
  const input = submissionInputSchema.safeParse(raw.value);
  if (!input.success) return validationFailure(input.error);

  try {
    const { data, error, status } = await caller.client.rpc("create_learner_submission", {
      p_challenge_id: challengeId.data, p_idempotency_key: key.data, p_payload: input.data,
    });
    if (error) {
      if (status === 401 || status === 403) return afterDatabaseDenial(caller.client);
      if (status === 400 && error.code === "VALIDATION_ERROR") return { status: "invalid" };
      if (status === 429) return { status: "rate_limited" };
      // A PostgreSQL error confirms rollback. A network error, gateway failure
      // or malformed acknowledgement may have lost the committed outcome.
      const rolledBack = /^[0-9A-Z]{5}$/.test(error.code) && !error.code.startsWith("08") && error.code !== "40003";
      return { status: rolledBack ? "unavailable" : "uncertain" };
    }
    const result = createResultSchema.parse(data);
    if (result.status === "forbidden") return afterDatabaseDenial(caller.client);
    if (result.status === "invalid") {
      const index = result.invalidCommentIndex;
      return index === undefined ? { status: "invalid" }
        : { status: "invalid", fieldErrors: { [`comments.${index}.line`]: [submissionOutcomeMessages.invalidLine] } };
    }
    if (result.status !== "ok") return { status: result.status };
    const submission = buildView(result.submission, caller.account.id);
    const previous = input.data.previousSubmissionId?.toLowerCase() ?? null;
    if (submission.attemptNumber !== (previous === null ? 1 : 2) || submission.previousSubmissionId !== previous
      || submission.id === previous || submission.challengeId !== challengeId.data.toLowerCase()
      || submission.revisionId !== input.data.revisionId.toLowerCase()) return { status: "uncertain" };
    return { status: "ok", submission };
  } catch {
    return { status: "uncertain" };
  }
}
