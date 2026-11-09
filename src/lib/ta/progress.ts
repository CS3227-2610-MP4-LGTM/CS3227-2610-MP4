import type { Category, ChallengeCard } from "@/lib/learner/challenges";
import type { ReadFailure } from "./submissions";
export const categories: Category[] = ["logic_bug", "edge_case", "error_handling", "security", "performance"];
export type LearnerIdentity = { id: string; displayName: string };
export type CategoryProgress = { learnerId: string; categories: { category: Category; totalFlaws: number; identifiedFlaws: number; identificationRate: number | null; completedFirstAttempts: number }[] };
export type Evidence = { id: string; learnerId: string; attemptNumber: number; gradingState: "pending" | "running" | "failed" | "completed"; flaws: { id: string; category: Category }[]; matchedFlawIds: string[] };
export type Recommendations = { items: { challenge: ChallengeCard; targetCategories: Category[] }[] };
export type LearnerPageResult = { status: "ok"; page: { items: LearnerIdentity[]; nextCursor: string | null } } | ReadFailure;
export type LearnerResult = { status: "ok"; learner: LearnerIdentity } | ReadFailure;
export type ProgressResult = { status: "ok"; progress: CategoryProgress } | ReadFailure;
export type RecommendationResult = { status: "ok"; recommendations: Recommendations } | ReadFailure;
export function aggregateCategoryProgress(learnerId: string, evidence: Evidence[]): CategoryProgress {
  const eligible = [...new Map(evidence.filter(s => s.learnerId === learnerId && s.attemptNumber === 1 && s.gradingState === "completed").map(s => [s.id, s])).values()];
  return { learnerId, categories: categories.map(category => {
    let totalFlaws = 0, identifiedFlaws = 0, completedFirstAttempts = 0;
    for (const submission of eligible) {
      const flaws = [...new Map(submission.flaws.filter(f => f.category === category).map(f => [f.id, f])).values()];
      totalFlaws += flaws.length;
      identifiedFlaws += flaws.filter(f => submission.matchedFlawIds.includes(f.id)).length;
      if (flaws.length) completedFirstAttempts++;
    }
    return { category, totalFlaws, identifiedFlaws, identificationRate: totalFlaws ? Math.round(identifiedFlaws / totalFlaws * 10000) / 10000 : null, completedFirstAttempts };
  }) };
}
export function selectRecommendations(progress: CategoryProgress, candidates: { challenge: ChallengeCard; status: "draft" | "published" | "unpublished" | "archived" }[], attemptedChallengeIds: string[], limit = 5): Recommendations {
  const weakest = progress.categories.filter(c => c.totalFlaws > 0).sort((a, b) =>
    a.identifiedFlaws / a.totalFlaws - b.identifiedFlaws / b.totalFlaws || b.totalFlaws - a.totalFlaws || categories.indexOf(a.category) - categories.indexOf(b.category)).slice(0, 2).map(c => c.category);
  const attempted = new Set(attemptedChallengeIds), seen = new Set<string>();
  const difficulty = { easy: 0, medium: 1, hard: 2 };
  return { items: candidates.filter(c => c.status === "published" && !attempted.has(c.challenge.id)).map(({ challenge }) => ({ challenge, targetCategories: categories.filter(c => weakest.includes(c) && challenge.categories.includes(c)) }))
    .filter(c => c.targetCategories.length && !seen.has(c.challenge.id) && !!seen.add(c.challenge.id))
    .sort((a, b) => b.targetCategories.length - a.targetCategories.length || difficulty[a.challenge.difficulty] - difficulty[b.challenge.difficulty] || a.challenge.id.localeCompare(b.challenge.id)).slice(0, limit) };
}
