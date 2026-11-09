import type { WorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { accountAccessHeader } from "@/lib/learner/challenges";
import {
  submissionErrorMessages, submissionFailureSchema, submissionOutcomeMessages, submissionSuccessSchema, workspaceAccountHeader,
  type SubmissionInput,
} from "@/lib/learner/submissions";

export type FrozenReview = { key: string; payload: SubmissionInput; accountId?: string };
type Failure = {
  status: "rejected";
  message: string;
  recovery?: "challenges" | "history";
  fieldErrors?: Record<string, string[]>;
};
export type SubmissionOutcome =
  | { status: "ok"; id: string }
  | { status: "uncertain" | "in_progress" | "conflict" }
  | WorkspaceAccessFailure
  | Failure;

export async function sendReview(challengeId: string, request: FrozenReview, checking: boolean): Promise<SubmissionOutcome> {
  try {
    const headers = new Headers({ "Content-Type": "application/json", "Idempotency-Key": request.key });
    if (request.accountId !== undefined) headers.set(workspaceAccountHeader, request.accountId);
    const response = await fetch(`/api/v1/challenges/${encodeURIComponent(challengeId)}/submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify(request.payload),
      cache: "no-store",
    });
    const json = await response.json();
    if (response.status === 201) {
      const { id, attemptNumber, challengeId: returnedChallenge, revisionId, learner, comments } = submissionSuccessSchema.parse(json).data;
      if (attemptNumber === 1 && returnedChallenge.toLowerCase() === challengeId.toLowerCase()
        && revisionId.toLowerCase() === request.payload.revisionId.toLowerCase()
        && (request.accountId === undefined || learner.id.toLowerCase() === request.accountId.toLowerCase())
        && comments.length === request.payload.comments.length
        && comments.every(({ line, body }, index) => {
          const input = request.payload.comments[index];
          return line === input.line && body === input.body;
        })) return { status: "ok", id };
      return { status: "uncertain" };
    }

    const { code, message, fieldErrors } = submissionFailureSchema.parse(json).error;
    switch (`${response.status} ${code}`) {
      case "400 VALIDATION_ERROR":
        return { status: "rejected", message: submissionOutcomeMessages.invalid, fieldErrors };
      case "401 UNAUTHENTICATED":
        return { status: "unauthenticated" };
      case "403 FORBIDDEN":
        return { status: response.headers.get(accountAccessHeader) === "role_denied" ? "role_denied" : "account_unavailable" };
      case "404 NOT_FOUND":
        return { status: "rejected", message: submissionOutcomeMessages.notFound, recovery: "challenges" };
      case "409 VERSION_CONFLICT":
        return { status: "rejected", message: submissionOutcomeMessages.stale, recovery: "challenges" };
      case "409 ATTEMPT_LIMIT":
        return { status: "rejected", message: submissionOutcomeMessages.attemptLimit, recovery: "history" };
      case "409 IDEMPOTENCY_CONFLICT":
        return { status: "conflict" };
      case "409 INVALID_STATE":
        if (message === submissionErrorMessages.inProgress) return { status: "in_progress" };
        if (message === submissionErrorMessages.lifecycleUnavailable) {
          return { status: "rejected", message, recovery: "challenges" };
        }
        break;
      case "413 PAYLOAD_TOO_LARGE":
        return { status: "rejected", message: submissionOutcomeMessages.tooLarge };
      case "429 RATE_LIMITED":
        return checking ? { status: "uncertain" } : { status: "rejected", message: submissionOutcomeMessages.rateLimited };
      case "503 SERVICE_UNAVAILABLE":
        if (message === submissionErrorMessages.accountServiceUnavailable) return { status: "account_service_unavailable" };
        if (message === submissionErrorMessages.submissionUnavailable && !checking) return { status: "rejected", message };
    }
  } catch {
    // Transport failures or malformed acknowledgements cannot rule out a commit.
  }
  return { status: "uncertain" };
}
