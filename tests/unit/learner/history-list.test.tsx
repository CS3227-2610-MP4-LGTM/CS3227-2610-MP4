import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { card, page, type HistoryResult } from "./history-fixture";
import { challengeId, submissionId } from "./grading-fixture";
import { uid } from "../server/llm/fixtures";

// T-14 acceptance interface, following the existing catalogue's injectable boundary.
const historyModule = "../../../src/components/learner/history-list.tsx";
const { HistoryList } = await import(historyModule) as { HistoryList: ComponentType<{
  search: string; readPage: (search: string) => Promise<HistoryResult>; navigate: (href: string) => void;
}> };
afterEach(cleanup);
const cursor = "opaque-history-cursor";
const action = (name: string) => screen.queryByRole("button", { name }) ?? screen.getByRole("link", { name });
function setup(readPage = vi.fn<(search: string) => Promise<HistoryResult>>().mockResolvedValue(page()), search = "") {
  const navigate = vi.fn((href: string) => {
    const url = new URL(href, "https://app.example.test");
    expect(url.pathname).toBe("/learner/history");
    result.rerender(<HistoryList search={url.search.slice(1)} readPage={readPage} navigate={navigate} />);
  });
  const result = render(<HistoryList search={search} readPage={readPage} navigate={navigate} />);
  return { ...result, navigate, readPage };
}
function announced(text: string) {
  expect(screen.getByText(text, { exact: true }).closest('[role="status"], [role="alert"], [aria-live]')).not.toBeNull();
}
it("LRN-08.1 shows separate attempts with contract labels, counts, inert titles and independent result links", async () => {
  const title = '<img src="https://attacker.example.test/title" onerror="alert(1)">';
  const { container } = setup(vi.fn().mockResolvedValue(page([card({ title }), card({ id: uid(502), attemptNumber: 2, effectiveScore: 25 })])));
  await screen.findByRole("heading", { name: "Review history" });
  await screen.findByText(title, { exact: true });
  for (const label of ["Challenge", "Attempt", "Submitted", "Grading status", "Effective score", "Open flags"]) expect(screen.getAllByText(label, { exact: true }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("link", { name: "View result" }).map(link => link.getAttribute("href"))).toEqual([`/learner/history/${submissionId}`, `/learner/history/${uid(502)}`]);
  expect(screen.getByRole("link", { name: title }).getAttribute("href")).toBe(`/learner/history/${submissionId}`);
  expect(container.textContent).toContain("59 / 100");
  expect(container.textContent).toContain("25 / 100");
  expect(container.textContent).toMatch(/(?:UTC|GMT|[+-]\d\d:\d\d)/);
  expect(container.textContent).toMatch(/2026/);
  expect(container.textContent).toMatch(/\d{1,2}:\d{2}/);
  expect(container.querySelector("img, script")).toBeNull();
  const first = screen.getAllByRole("link", { name: "View result" })[0].closest("tr, li, article");
  expect(first, "Each attempt must have a distinct readable row or entry").not.toBeNull();
  expect(within(first as HTMLElement).getByText("3", { exact: true })).toBeTruthy();
});
it("LRN-08.2 distinguishes all four states and a completed zero from unavailable scores", async () => {
  setup(vi.fn().mockResolvedValue(page(["pending", "running", "failed", "completed"].map((gradingState, index) => card({ id: uid(510 + index), gradingState, effectiveScore: gradingState === "completed" ? 0 : null })))));
  for (const label of ["Pending", "Running", "Failed", "Completed"]) await screen.findByText(label, { exact: true });
  expect(screen.getAllByText("Not available", { exact: true })).toHaveLength(3);
  expect(screen.getAllByText("0 / 100", { exact: true })).toHaveLength(1);
});
it("LRN-08.2 ACC-03.8 preserves history heading and catalogue navigation in empty history", async () => {
  setup(vi.fn().mockResolvedValue(page([])));
  await screen.findByText("No reviews yet.", { exact: true });
  expect(screen.getByRole("heading", { name: "Review history" })).toBeTruthy();
  expect(screen.getByRole("link", { name: /^(Browse challenges|Challenges)$/ }).getAttribute("href")).toBe("/learner/challenges");
});
it("LRN-08.3 announces loading, disables pagination, preserves filter and focuses the list heading", async () => {
  const next = Promise.withResolvers<HistoryResult>();
  const read = vi.fn().mockResolvedValueOnce(page([card()], cursor)).mockReturnValueOnce(next.promise).mockResolvedValueOnce(page());
  const { navigate } = setup(read, `challengeId=${challengeId}&limit=1`);
  await screen.findByText("59 / 100", { exact: true });
  fireEvent.click(action("Next page"));
  announced("Loading review history…");
  const first = action("First page");
  expect(first.matches(':disabled, [aria-disabled="true"]')).toBe(true);
  fireEvent.click(first);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(Object.fromEntries(new URLSearchParams(read.mock.calls[1][0]))).toEqual({ challengeId, limit: "1", cursor });
  await act(async () => next.resolve(page([card({ title: "Second page title" })])));
  await screen.findByText("Second page title", { exact: true });
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Review history" }));
  expect(screen.queryByRole("button", { name: "Next page" }) ?? screen.queryByRole("link", { name: "Next page" })).toBeNull();
  fireEvent.click(action("First page"));
  expect(Object.fromEntries(new URLSearchParams(read.mock.calls[2][0]))).toEqual({ challengeId, limit: "1" });
});
it("LRN-08.3 retries the same failed cursor URL and never substitutes the empty message", async () => {
  const search = `challengeId=${challengeId}&cursor=${cursor}`;
  const read = vi.fn().mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValueOnce(page());
  const { navigate } = setup(read, search);
  await screen.findByText("We couldn't load review history. Try again.", { exact: true });
  announced("We couldn't load review history. Try again.");
  expect(screen.queryByText("No reviews yet.")).toBeNull();
  fireEvent.click(action("Try again"));
  await screen.findByText("59 / 100", { exact: true });
  expect(read.mock.calls).toEqual([[search], [search]]);
  expect(navigate).not.toHaveBeenCalled();
});
it("LRN-08.3 returns an invalid page to the clean history URL", async () => {
  const { navigate } = setup(vi.fn().mockResolvedValueOnce({ status: "invalid" }).mockResolvedValueOnce(page()), `challengeId=${challengeId}&cursor=broken`);
  await screen.findByText("This history page isn't valid.", { exact: true });
  announced("This history page isn't valid.");
  fireEvent.click(action("First page"));
  expect(navigate).toHaveBeenCalledWith("/learner/history");
});
it("LRN-08.3 restores incoming URL state and suppresses a late response for the previous page", async () => {
  const old = Promise.withResolvers<HistoryResult>();
  const read = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(page([card({ title: "Restored page" })]));
  const { rerender, navigate } = setup(read);
  rerender(<HistoryList search={`cursor=${cursor}`} readPage={read} navigate={navigate} />);
  await screen.findByText("Restored page");
  await act(async () => old.resolve(page([card({ title: "Stale page" })])));
  expect(screen.queryByText("Stale page")).toBeNull();
  expect(read.mock.calls).toEqual([[""], [`cursor=${cursor}`]]);
  await waitFor(() => expect(screen.getByText("Restored page")).toBeTruthy());
});
