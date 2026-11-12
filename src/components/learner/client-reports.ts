import { z } from "zod";
import { accountAccessHeader } from "@/lib/learner/challenges";
import { learnerFlagSchema } from "@/lib/learner/grading";
import {
  matchesReport, reportErrorMessages, reportOutcomeMessages, type ReportFlag, type ReportInput,
} from "@/lib/learner/reports";
import { submissionFailureSchema, workspaceAccountHeader } from "@/lib/learner/submissions";

/** One in-memory report request; "Check report" replays exactly this key and payload. */
export type ReportRequest = { key: string; payload: ReportInput; accountId: string };

export type ReportOutcome =
  | { status: "ok"; flag: ReportFlag }
  | { status: "uncertain" | "in_progress" | "duplicate" | "unavailable" | "conflict" | "throttled" }
  | { status: "rejected"; message: string; fieldError?: string }
  | { status: "denied"; response: Response };

const successSchema = z.strictObject({ data: learnerFlagSchema });

function accountDenial(response: Response) {
  const access = response.headers.get(accountAccessHeader);
  return response.status === 401 || response.status === 403
    || (response.status === 503 && access === "account_service_unavailable");
}

export async function sendReport(submissionId: string, request: ReportRequest): Promise<ReportOutcome> {
  try {
    const response = await fetch(`/api/v1/submissions/${encodeURIComponent(submissionId)}/reports`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json", "Idempotency-Key": request.key, [workspaceAccountHeader]: request.accountId,
      },
      body: JSON.stringify(request.payload),
    });
    // Account and record denials belong to ACC-03 recovery; nothing is replayed.
    if (accountDenial(response)) return { status: "denied", response };
    const json = await response.json();
    if (response.status === 201) {
      const { data } = successSchema.parse(json);
      return matchesReport(data, submissionId, request.payload) ? { status: "ok", flag: data } : { status: "uncertain" };
    }
    const { code, message, fieldErrors } = submissionFailureSchema.parse(json).error;
    switch (`${response.status} ${code}`) {
      case "400 VALIDATION_ERROR":
        return { status: "rejected", message: reportOutcomeMessages.invalid, fieldError: fieldErrors?.reason?.[0] };
      case "404 NOT_FOUND":
        return { status: "unavailable" };
      case "409 INVALID_STATE":
        if (message === reportErrorMessages.ineligible) return { status: "unavailable" };
        if (message === reportErrorMessages.alreadyReported) return { status: "duplicate" };
        if (message === reportErrorMessages.inProgress) return { status: "in_progress" };
        break;
      case "409 IDEMPOTENCY_CONFLICT":
        return { status: "conflict" };
      case "413 PAYLOAD_TOO_LARGE":
        return { status: "rejected", message: reportOutcomeMessages.tooLarge };
      case "429 RATE_LIMITED":
        return { status: "throttled" };
      case "503 SERVICE_UNAVAILABLE":
        if (message === reportOutcomeMessages.failed) return { status: "rejected", message };
    }
  } catch {
    // Transport failures or malformed acknowledgements cannot rule out a commit.
  }
  return { status: "uncertain" };
}
