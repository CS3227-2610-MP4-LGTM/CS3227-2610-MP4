import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LearnerDetail } from "@/components/ta/learner-detail";
import { challenge, deferred, id, labels, progress } from "./evidence";
const okProgress = (value = progress()) => ({ status: "ok" as const, progress: value });
const recommendations = () => ({ status: "ok" as const, recommendations: { items: [{ challenge: challenge(6001, ["logic_bug", "edge_case", "security"]), targetCategories: ["edge_case"] }] } });
function setup(options: { readLearner?: ReturnType<typeof vi.fn>; readProgress?: ReturnType<typeof vi.fn>; readRecommendations?: ReturnType<typeof vi.fn> } = {}) {
  const props = { learnerId: id(11), readLearner: vi.fn().mockResolvedValue({ status: "ok", learner: { id: id(11), displayName: "Learner A" } }),
    readProgress: vi.fn().mockResolvedValue(okProgress()), readRecommendations: vi.fn().mockResolvedValue(recommendations()),
    summarySlot: <p>Summary composition sentinel</p>, ...options };
  return { ...render(<LearnerDetail {...props} />), ...props };
}
afterEach(cleanup);
it("TA-04.1 TA-05.1 TA-05.3 TA-05.7 composes permitted identity, separate summary region and deterministic sections without generation or review actions", async () => {
  setup(); await screen.findByText("Learner A");
  expect(screen.getByRole("heading", { name: "Learner performance" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Performance summary" }).textContent).toContain("Summary composition sentinel");
  expect(screen.getByRole("link", { name: "View submissions" }).getAttribute("href")).toBe(`/ta/submissions?learnerId=${id(11)}`);
  expect(screen.getByRole("link", { name: "Back to learners" }).getAttribute("href")).toBe("/ta/learners");
  const table = await screen.findByRole("region", { name: "Category progress" });
  for (const label of ["Category", "Identified flaws", "Total flaws", "Identification rate", "Completed first attempts", ...labels]) expect(within(table).getAllByText(label).length).toBeGreaterThan(0);
  expect(within(table).getByText("100.00%")).toBeTruthy(); expect(within(table).getByText("0.00%")).toBeTruthy();
  expect(within(table).getAllByText("Not observed")).toHaveLength(3);
  expect(screen.getByText("Progress uses completed first attempts. Retries and grade overrides do not change these identification counts.")).toBeTruthy();
  const rec = screen.getByRole("region", { name: "Recommended challenges" });
  for (const label of ["Challenge", "Language", "Difficulty", "Practice categories", "TypeScript", "Easy", "Edge case"]) expect(within(rec).getAllByText(label).length).toBeGreaterThan(0);
  expect(within(rec).queryByText("Security")).toBeNull(); expect(within(rec).queryByText("Logic bug")).toBeNull();
  expect(screen.getByText("Rule-based recommendations from observed category progress.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Generate|Regenerate|Review|Start/ })).toBeNull();
  expect(within(rec).queryByRole("link", { name: /Review|Start/ })).toBeNull();
});
it("TA-04.2 waits for identity and treats a missing learner separately without revealing evidence", async () => {
  const pending = deferred<{ status: string }>(); const readProgress = vi.fn(); const readRecommendations = vi.fn();
  setup({ readLearner: vi.fn().mockReturnValue(pending.promise), readProgress, readRecommendations });
  expect(screen.getByText("Loading learner performance…").closest('[role="status"],[aria-live]')).not.toBeNull();
  expect(readProgress).not.toHaveBeenCalled(); expect(readRecommendations).not.toHaveBeenCalled();
  await act(async () => pending.resolve({ status: "not_found" }));
  await screen.findByText("Learner not found."); expect(screen.getByRole("link", { name: "Back to learners" })).toBeTruthy();
  expect(screen.queryByText("Summary composition sentinel")).toBeNull();
});
it("TA-05.2 TA-05.4 retains all unobserved rows and honest empty recommendations without invented weakness", async () => {
  setup({ readProgress: vi.fn().mockResolvedValue(okProgress(progress([]))), readRecommendations: vi.fn().mockResolvedValue({ status: "ok", recommendations: { items: [] } }) });
  await screen.findByText("No completed first-attempt category evidence yet.");
  expect(screen.getAllByText("Not observed")).toHaveLength(5);
  expect(screen.queryByText("0.00%")).toBeNull();
  await screen.findByText("No eligible recommendations right now.");
  expect(screen.getAllByRole("link", { name: "View submissions" }).length).toBeGreaterThan(0);
});
it.each(["progress", "recommendations"] as const)("TA-05.5 TA-05.6 loads %s independently, announces failure, retains previous data on refresh and retries only that section", async failed => {
  const slowProgress = deferred<ReturnType<typeof okProgress>>();
  const slowRecs = deferred<ReturnType<typeof recommendations>>();
  const readProgress = vi.fn().mockReturnValueOnce(slowProgress.promise);
  const readRecommendations = vi.fn().mockReturnValueOnce(slowRecs.promise);
  setup({ readProgress, readRecommendations });
  await screen.findByText("Loading category progress…"); await screen.findByText("Loading recommendations…");
  for (const message of ["Loading category progress…", "Loading recommendations…"]) expect(screen.getByText(message).closest('[role="status"],[aria-live]')).not.toBeNull();
  if (failed === "progress") {
    await act(async () => slowRecs.resolve(recommendations()));
    await screen.findByText("Practice 6001"); expect(screen.getByText("Loading category progress…")).toBeTruthy();
    await act(async () => slowProgress.resolve(okProgress()));
  } else {
    await act(async () => slowProgress.resolve(okProgress()));
    await screen.findByText("100.00%"); expect(screen.getByText("Loading recommendations…")).toBeTruthy();
    await act(async () => slowRecs.resolve(recommendations()));
  }
  const failedReader = failed === "progress" ? readProgress : readRecommendations;
  const successfulReader = failed === "progress" ? readRecommendations : readProgress;
  failedReader.mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValue(failed === "progress" ? okProgress(progress([[0, 1, 1]])) : { status: "ok", recommendations: { items: [] } });
  successfulReader.mockResolvedValue(failed === "progress" ? recommendations() : okProgress());
  const refresh = screen.getByRole("button", { name: "Refresh progress and recommendations" });
  fireEvent.click(refresh);
  const message = failed === "progress" ? "We couldn't load category progress. Try again." : "We couldn't load recommendations. Try again.";
  await screen.findByText(message);
  expect(screen.getByText(message).closest('[role="alert"],[aria-live]')).not.toBeNull();
  expect(screen.getByText(`Previously loaded ${failed}`)).toBeTruthy();
  expect(screen.getByText("Practice 6001")).toBeTruthy(); expect(screen.getByText("100.00%")).toBeTruthy();
  expect(screen.getByText("Summary composition sentinel")).toBeTruthy();
  const successfulCalls = successfulReader.mock.calls.length;
  const section = screen.getByRole("region", { name: failed === "progress" ? "Category progress" : "Recommended challenges" });
  fireEvent.click(within(section).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(failedReader).toHaveBeenCalledTimes(3));
  expect(successfulReader).toHaveBeenCalledTimes(successfulCalls);
  await waitFor(() => expect(screen.queryByText(`Previously loaded ${failed}`)).toBeNull());
});
it("TA-05.5 disables refresh until both reads settle and replaces successful content only", async () => {
  const readProgress = vi.fn().mockResolvedValue(okProgress()); const readRecommendations = vi.fn().mockResolvedValue(recommendations());
  setup({ readProgress, readRecommendations }); await screen.findByText("Practice 6001");
  const later = deferred<ReturnType<typeof recommendations>>(); readRecommendations.mockReturnValueOnce(later.promise);
  readProgress.mockResolvedValue(okProgress(progress([[0, 1, 1]])));
  const refresh = screen.getByRole("button", { name: "Refresh progress and recommendations" }); fireEvent.click(refresh);
  await waitFor(() => expect(refresh.matches(":disabled")).toBe(true));
  await waitFor(() => expect(screen.queryByText("100.00%")).toBeNull());
  await act(async () => later.resolve({ status: "ok", recommendations: { items: [] } }));
  await screen.findByText("No eligible recommendations right now."); expect(refresh.matches(":disabled")).toBe(false);
});
it.each(["progress", "recommendations"] as const)("TA-05.6 initial %s failure never becomes an empty successful state", async failed => {
  setup({ [failed === "progress" ? "readProgress" : "readRecommendations"]: vi.fn().mockResolvedValue({ status: "unavailable" }) });
  await screen.findByText(failed === "progress" ? "We couldn't load category progress. Try again." : "We couldn't load recommendations. Try again.");
  expect(screen.queryByText("No completed first-attempt category evidence yet.")).toBeNull();
  expect(screen.queryByText("No eligible recommendations right now.")).toBeNull();
  expect(screen.getByText("Summary composition sentinel")).toBeTruthy();
});
