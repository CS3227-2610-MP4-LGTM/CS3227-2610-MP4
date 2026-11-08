import type { CodeDiff } from "@/lib/code-diff";
import type { WorkspaceAccessFailure } from "@/lib/auth/workspace-access";

export const languageLabels = { python: "Python", java: "Java", javascript: "JavaScript", typescript: "TypeScript" };
export const difficultyLabels = { easy: "Easy", medium: "Medium", hard: "Hard" };
export const categoryLabels = {
  logic_bug: "Logic bug",
  edge_case: "Edge case",
  error_handling: "Error handling",
  security: "Security",
  performance: "Performance",
};

export type Language = keyof typeof languageLabels;
export type Difficulty = keyof typeof difficultyLabels;
export type Category = keyof typeof categoryLabels;

export const catalogueHref = "/learner/challenges";

export type ChallengeCard = {
  id: string;
  revisionId: string;
  title: string;
  description: string;
  language: Language;
  difficulty: Difficulty;
  categories: Category[];
  publishedAt: string;
};
export type ChallengeView = ChallengeCard & { code: CodeDiff };
export type ChallengePage = { items: ChallengeCard[]; nextCursor: string | null };

export type ReadFailure = { status: "unauthenticated" | "forbidden" | "not_found" | "unavailable" | "invalid" };
type WorkspaceReadFailure = ReadFailure | WorkspaceAccessFailure;
export type CatalogueResult = { status: "ok"; page: ChallengePage } | WorkspaceReadFailure;
export type ChallengeResult = { status: "ok"; challenge: ChallengeView } | WorkspaceReadFailure;
export type AttemptResult = { status: "ok"; submissionId: string | null } | WorkspaceReadFailure;

// The v1 error envelope uses the same codes for account and record/data failures.
export const accountAccessHeader = "X-LGTM-Account-Access";

export function genericReadFailure({ status }: WorkspaceAccessFailure): ReadFailure {
  if (status === "account_service_unavailable") return { status: "unavailable" };
  return { status: status === "unauthenticated" ? status : "forbidden" };
}
