import { id, submission } from "../inspection/evidence";

export { id };
export const categories = ["logic_bug", "edge_case", "error_handling", "security", "performance"] as const;
export type Category = typeof categories[number];
export const labels = ["Logic bug", "Edge case", "Error handling", "Security", "Performance"];
export type Evidence = {
  id: string; learnerId: string; attemptNumber: number;
  gradingState: "pending" | "running" | "failed" | "completed";
  flaws: { id: string; category: Category }[]; matchedFlawIds: string[];
};
export function firstAttempt(): Evidence {
  const s = submission();
  return { id: s.id, learnerId: s.learner.id, attemptNumber: s.attemptNumber,
    gradingState: s.grading.state, flaws: s.answerKey.map(({ id, category }) => ({ id, category })),
    matchedFlawIds: s.matching.matches.map(m => m.flawId) };
}
export function progress(counts: [number, number, number][] = [[1, 1, 1], [0, 1, 1]]) {
  return { learnerId: id(11), categories: categories.map((category, index) => {
    const [identifiedFlaws, totalFlaws, completedFirstAttempts] = counts[index] ?? [0, 0, 0];
    return { category, identifiedFlaws, totalFlaws, completedFirstAttempts,
      identificationRate: totalFlaws ? Math.round(identifiedFlaws / totalFlaws * 10000) / 10000 : null };
  }) };
}
export function challenge(n = 6001, selected: Category[] = ["edge_case"], difficulty: "easy" | "medium" | "hard" = "easy") {
  return { id: id(n), revisionId: id(n + 1000), title: `Practice ${n}`, description: "Review the changes.",
    language: "typescript" as const, difficulty, categories: selected, publishedAt: "2026-01-01T00:00:00Z" };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
