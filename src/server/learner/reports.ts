import "server-only";
import { z } from "zod";
import type { WorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { challengeIdSchema } from "@/lib/learner/challenge-schema";
import { learnerFlagSchema } from "@/lib/learner/grading";
import { matchesReport, reportBodyLimit, reportInputSchema, type ReportFlag } from "@/lib/learner/reports";
import { matchesRequestOrigin, readJsonBody } from "@/server/http/request";
import { checkLearnerAccount, type LearnerClient } from "./access";
import { matchesWorkspaceAccount, submissionCaller } from "./submissions";

const reportResultSchema = z.union([
  z.strictObject({ status: z.literal("ok"), flag: learnerFlagSchema }),
  z.strictObject({ status: z.enum([
    "invalid", "forbidden", "not_found", "ineligible", "already_reported", "in_progress", "idempotency_conflict",
  ]) }),
]);

type Invalid = { status: "invalid"; fieldErrors?: Record<string, string[]> };
export type CreateReportResult =
  | { status: "ok"; flag: ReportFlag }
  | { status: "forbidden" | "not_found" | "ineligible" | "already_reported" | "in_progress" | "idempotency_conflict"
      | "too_large" | "rate_limited" | "unavailable" | "uncertain" }
  | Invalid | WorkspaceAccessFailure;

/** After a database denial, recheck the caller; a still-valid Learner keeps the record denial. */
async function afterReportDenial(client: LearnerClient, denial: "forbidden" | "unavailable") {
  const caller = await checkLearnerAccount(client);
  return caller.status === "ok" ? { status: denial } as const : caller;
}

function validationFailure(error: z.ZodError): Invalid {
  // Only the fixed reason messages are returned; strict-object messages can name unknown fields.
  const reason = error.issues.filter(issue => issue.code === "custom" && issue.path.join(".") === "reason")
    .map(issue => issue.message);
  return reason.length ? { status: "invalid", fieldErrors: { reason } } : { status: "invalid" };
}

export async function createLearnerReport(id: string, request: Request): Promise<CreateReportResult> {
  const caller = await submissionCaller();
  if (caller.status !== "ok") return caller;
  const url = new URL(request.url);
  if (!matchesRequestOrigin(request, url)) return { status: "forbidden" };
  if (!matchesWorkspaceAccount(request, caller.account.id)) return { status: "account_unavailable" };
  const submissionId = challengeIdSchema.safeParse(id);
  const key = challengeIdSchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!submissionId.success || !key.success || url.searchParams.size) return { status: "invalid" };
  const raw = await readJsonBody(request, reportBodyLimit);
  if (raw.status !== "ok") return raw;
  const input = reportInputSchema.safeParse(raw.value);
  if (!input.success) return validationFailure(input.error);

  try {
    const { data, error, status } = await caller.client.rpc("create_learner_report", {
      p_submission_id: submissionId.data, p_idempotency_key: key.data, p_payload: input.data,
    });
    if (error) {
      if (status === 401 || status === 403) return afterReportDenial(caller.client, "unavailable");
      if (status === 429) return { status: "rate_limited" };
      // A PostgreSQL error confirms rollback. A network error, gateway failure
      // or malformed acknowledgement may have lost the committed outcome.
      const rolledBack = /^[0-9A-Z]{5}$/.test(error.code) && !error.code.startsWith("08") && error.code !== "40003";
      return { status: rolledBack ? "unavailable" : "uncertain" };
    }
    const result = reportResultSchema.parse(data);
    if (result.status === "forbidden") return afterReportDenial(caller.client, "forbidden");
    if (result.status !== "ok") return { status: result.status };
    return matchesReport(result.flag, submissionId.data, input.data) ? result : { status: "uncertain" };
  } catch {
    return { status: "uncertain" };
  }
}
