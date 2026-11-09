import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LearnerList } from "@/components/ta/learner-list";
import { deferred, id } from "./evidence";
const learners = [{ id: id(11), displayName: "Same name" }, { id: id(12), displayName: "Same name" }];
const ok = (items = learners, nextCursor: string | null = null) => ({ status: "ok" as const, page: { items, nextCursor } });
const action = (name: string) => screen.queryByRole("button", { name }) ?? screen.getByRole("link", { name });
function setup(readPage = vi.fn().mockResolvedValue(ok()), search = "") {
  const navigate = vi.fn((href: string) => view.rerender(<LearnerList search={new URL(href, "http://localhost").search.slice(1)} readPage={readPage} navigate={navigate} />));
  const view = render(<LearnerList search={search} readPage={readPage} navigate={navigate} />);
  return { ...view, navigate };
}
afterEach(cleanup);
it("TA-04.1 SYS-12.2 shows permitted identities, duplicate names distinguished by IDs, inert names and detail links", async () => {
  setup(vi.fn().mockResolvedValue(ok([...learners, { id: id(31), displayName: '<img src=x onerror="window.pwned=true">' }])));
  await screen.findAllByText("Same name");
  expect(screen.getByRole("heading", { name: "Learners" })).toBeTruthy();
  for (const label of ["Learner", "Learner ID"]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  for (const learner of learners) expect(screen.getByText(learner.id)).toBeTruthy();
  expect(screen.getAllByRole("link", { name: "View learner" }).map(el => el.getAttribute("href")))
    .toEqual([11, 12, 31].map(n => `/ta/learners/${id(n)}`));
  expect(document.querySelector("img,script")).toBeNull();
  expect(document.body.textContent).not.toContain("@example.test");
});
it("TA-04.2 announces loading, disables pagination, persists cursor in navigation and restores URL changes", async () => {
  const pending = deferred<ReturnType<typeof ok>>();
  const read = vi.fn().mockResolvedValueOnce(ok(learners, "opaque-next")).mockReturnValueOnce(pending.promise).mockResolvedValue(ok());
  const { navigate, rerender } = setup(read, "limit=1");
  await screen.findAllByText("Same name"); fireEvent.click(action("Next page"));
  expect(navigate).toHaveBeenLastCalledWith("/ta/learners?limit=1&cursor=opaque-next");
  expect(screen.getByText("Loading learners…").closest('[role="status"],[aria-live]')).not.toBeNull();
  expect(action("First page").matches(':disabled,[aria-disabled="true"]')).toBe(true);
  await act(async () => pending.resolve(ok()));
  expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  fireEvent.click(action("First page"));
  await waitFor(() => expect(read).toHaveBeenLastCalledWith("limit=1"));
  rerender(<LearnerList search="limit=1&cursor=opaque-next" readPage={read} navigate={navigate} />);
  await waitFor(() => expect(read).toHaveBeenLastCalledWith("limit=1&cursor=opaque-next"));
});
it("TA-04.1 TA-04.2 distinguishes empty, unavailable and invalid-cursor states and retries the same page explicitly", async () => {
  const read = vi.fn().mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValueOnce({ status: "invalid" }).mockResolvedValue(ok([]));
  setup(read, "cursor=bad");
  await screen.findByText("We couldn't load learners. Try again.");
  expect(screen.queryByText("No learners yet.")).toBeNull();
  fireEvent.click(action("Try again")); await screen.findByText("This learners page isn't valid.");
  expect(read.mock.calls).toEqual([["cursor=bad"], ["cursor=bad"]]);
  fireEvent.click(action("First page")); await screen.findByText("No learners yet.");
  expect(read).toHaveBeenLastCalledWith("");
});
