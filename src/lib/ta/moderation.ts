import type { TaSubmissionView, ReadFailure } from "./submissions";
export type GradingView = TaSubmissionView["grading"];
export type FlagView = TaSubmissionView["flags"][number];
export type MutationFailure = ReadFailure | { status: "invalid_state" | "conflict" | "idempotency_conflict" };
export type OverrideResult = { status: "ok"; override: GradingView["overrides"][number]; grading: GradingView } | MutationFailure;
export type ResolutionResult = { status: "ok"; flag: FlagView } | MutationFailure;
export type FlagPageResult = { status: "ok"; page: { items: FlagView[]; nextCursor: string | null } } | ReadFailure;
export const flagLabels: Record<string,string> = { near_pass_mark: "Score near the pass mark", grading_output_retried: "AI grading output needed a retry", assessment_disagreement: "Location match and AI assessment disagree", learner_report: "Learner reported an unmatched comment" };
