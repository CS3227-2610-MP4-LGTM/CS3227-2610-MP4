import { expect, it } from "vitest";
import { aggregateCategoryProgress, selectRecommendations } from "@/lib/ta/progress";
import { categories, challenge, firstAttempt, id, progress, type Evidence } from "./evidence";

it("TA-05.1 TA-05.2 returns five ordered categories from original first-attempt matches, distinguishing zero and null", () => {
  expect(aggregateCategoryProgress(id(11), [firstAttempt()])).toEqual(progress());
  expect(aggregateCategoryProgress(id(11), [])).toEqual(progress([]));
});
it.each(["pending", "running", "failed"] as const)("TA-05.2 excludes %s first attempts and every retry, including a completed retry without eligible first evidence", state => {
  const base = firstAttempt();
  const ignored: Evidence[] = [{ ...base, gradingState: state }, { ...base, id: id(502), attemptNumber: 2,
    matchedFlawIds: base.flaws.map(f => f.id) }, { ...base, learnerId: id(12) }];
  expect(aggregateCategoryProgress(id(11), ignored)).toEqual(progress([]));
  expect(aggregateCategoryProgress(id(11), [base, ...ignored])).toEqual(progress());
});
it("TA-05.2 counts each containing first attempt once per category, not each flaw; retains all five categories and four-decimal rates", () => {
  const evidence: Evidence[] = [0, 1, 2].map(n => ({ id: id(8000 + n), learnerId: id(11), attemptNumber: 1,
    gradingState: "completed", flaws: categories.flatMap((category, index) =>
      Array.from({ length: index === 0 ? 2 : 1 }, (_, j) => ({ id: id(9000 + n * 20 + index * 2 + j), category }))),
    matchedFlawIds: n === 0 ? categories.map((_, index) => id(9000 + index * 2)) : [] }));
  expect(aggregateCategoryProgress(id(11), evidence)).toEqual(progress([[1, 6, 3], [1, 3, 3], [1, 3, 3], [1, 3, 3], [1, 3, 3]]));
});
it("TA-05.3 selects weakest categories using unrounded ratios before denominator and enum tie-breaks", () => {
  // All DTO rates round to .5000; security is strictly weakest, performance next.
  const p = progress([[50001, 100000, 20000], [50000, 100000, 20000], [50000, 100000, 20000], [49999, 100000, 20000], [99999, 200000, 40000]]);
  const candidates = categories.map((c, i) => ({ challenge: challenge(6001 + i, [c]), status: "published" as const }));
  expect(selectRecommendations(p, candidates, [], 5).items.map((r: { targetCategories: string[] }) => r.targetCategories)).toEqual([["security"], ["performance"]]);
  const tied = progress([[1, 2, 1], [2, 4, 2], [1, 2, 1], [1, 2, 1], [0, 0, 0]]);
  expect(selectRecommendations(tied, candidates, [], 5).items.map((r: { targetCategories: string[] }) => r.targetCategories)).toEqual([["logic_bug"], ["edge_case"]]);
});
it("TA-05.3 orders coverage before difficulty then ID, returning only target intersection in enum order", () => {
  const cards = [challenge(6005, ["edge_case"]), challenge(6004, ["logic_bug", "edge_case"], "hard"),
    challenge(6003, ["logic_bug", "edge_case", "security"], "easy"), challenge(6002, ["logic_bug", "edge_case"], "easy"),
    challenge(6001, ["edge_case"], "medium")];
  const result = selectRecommendations(progress(), cards.map(challenge => ({ challenge, status: "published" as const })), [], 5);
  expect(result.items.map((r: { challenge: { id: string } }) => r.challenge.id)).toEqual([6002, 6003, 6004, 6005, 6001].map(id));
  expect(result.items[1].targetCategories).toEqual(["logic_bug", "edge_case"]);
  expect(result.items[1].challenge).toEqual(cards[2]);
});
it("TA-05.3 TA-05.4 excludes all prior-attempt IDs and nonlive candidates; bounds results without padding or fallback weaknesses", () => {
  const candidates = Array.from({ length: 12 }, (_, n) => ({ challenge: challenge(6001 + n), status: "published" as const }));
  expect(selectRecommendations(progress(), candidates, []).items).toHaveLength(5);
  expect(selectRecommendations(progress(), candidates, [], 1).items).toHaveLength(1);
  expect(selectRecommendations(progress(), candidates, [], 10).items).toHaveLength(10);
  expect(selectRecommendations(progress(), candidates, candidates.map(c => c.challenge.id)).items).toEqual([]);
  for (const status of ["draft", "unpublished", "archived"] as const) {
    expect(selectRecommendations(progress(), [{ ...candidates[0], status }], []).items).toEqual([]);
  }
  expect(selectRecommendations(progress([]), candidates, []).items).toEqual([]);
  expect(selectRecommendations(progress(), [{ challenge: challenge(6020, ["security"]), status: "published" }], []).items).toEqual([]);
  expect(selectRecommendations(progress(), candidates.slice(0, 2), []).items).toHaveLength(2);
});
