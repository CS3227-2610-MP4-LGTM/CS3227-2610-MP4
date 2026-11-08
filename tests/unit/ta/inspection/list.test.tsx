import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SubmissionList } from "@/components/ta/submission-list";
import { card, id } from "./evidence";

const base = "/ta/submissions";
const ok = (items = [card()], nextCursor: string | null = null) => ({ status: "ok" as const, page: { items, nextCursor } });
const action = (name: string) => screen.queryByRole("button", { name }) ?? screen.getByRole("link", { name });
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function setup(readPage = vi.fn().mockResolvedValue(ok()), search = "") {
  const navigate = vi.fn((href: string) => {
    const url = new URL(href, "https://example.test");
    view.rerender(<SubmissionList search={url.search.slice(1)} readPage={readPage} navigate={navigate} />);
  });
  const view = render(<SubmissionList search={search} readPage={readPage} navigate={navigate} />);
  return { ...view, navigate };
}
function announced(message: string) {
  expect(screen.getByText(message).closest('[role="status"], [role="alert"], [aria-live]')).not.toBeNull();
}
afterEach(cleanup);

it("TA-01.1 separates attempts with labelled metadata, ID, timezone and detail links without emails", async () => {
  setup(vi.fn().mockResolvedValue(ok([card(), { ...card(), id: id(502), attemptNumber: 2 }])));
  await screen.findAllByRole("link", { name: "View submission" });
  for (const label of ["Learner", "Challenge", "Attempt", "Submitted", "Grading status", "Effective score", "Open flags"]) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  }
  expect(screen.getAllByText("Learner A")).toHaveLength(2);
  expect(screen.getAllByText(id(11))).toHaveLength(2);
  expect(screen.getAllByRole("link", { name: "View submission" }).map(el => el.getAttribute("href")))
    .toEqual([`${base}/${id(501)}`, `${base}/${id(502)}`]);
  const dates = document.querySelectorAll("time");
  expect(dates).toHaveLength(2);
  for (const date of dates) expect(date.textContent).toMatch(/2026.*\d{1,2}:\d{2}.*(?:UTC|GMT|[+-]\d{2}:?\d{2})/);
  expect(document.body.textContent).not.toContain("@example.test");
});

it("TA-01.2 applies all filters together, resets cursor, rejects invalid IDs beside inputs and clears", async () => {
  const read = vi.fn().mockResolvedValue(ok());
  const { navigate } = setup(read, `learnerId=${id(11)}&cursor=opaque`);
  await screen.findByText("Checkout totals");
  expect(Array.from((screen.getByLabelText("Grading status") as HTMLSelectElement).options, o => o.text))
    .toEqual(["All", "Pending", "Running", "Failed", "Completed"]);
  fireEvent.change(screen.getByLabelText("Learner ID"), { target: { value: "bad" } });
  fireEvent.click(action("Apply filters"));
  const input = screen.getByLabelText("Learner ID");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toContain("Enter a valid ID.");
  expect(read).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: id(12) } });
  fireEvent.change(screen.getByLabelText("Challenge ID"), { target: { value: id(101) } });
  fireEvent.change(screen.getByLabelText("Grading status"), { target: { value: "completed" } });
  expect(read).toHaveBeenCalledTimes(1);
  fireEvent.click(action("Apply filters"));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  expect(Object.fromEntries(new URLSearchParams(read.mock.calls[1][0]))).toEqual({ learnerId: id(12), challengeId: id(101), gradingState: "completed" });
  fireEvent.click(action("Clear filters"));
  expect(navigate).toHaveBeenLastCalledWith(base);
  await waitFor(() => expect(read).toHaveBeenLastCalledWith(""));
});
it("TA-01.2 restores URL filters when search changes, including browser back navigation", async () => {
  const read = vi.fn().mockResolvedValue(ok());
  const { rerender } = setup(read, `learnerId=${id(11)}&gradingState=pending&cursor=opaque`);
  await screen.findByText("Checkout totals");
  expect((screen.getByLabelText("Learner ID") as HTMLInputElement).value).toBe(id(11));
  expect(read).toHaveBeenLastCalledWith(`learnerId=${id(11)}&gradingState=pending&cursor=opaque`);
  rerender(<SubmissionList search={`challengeId=${id(101)}`} readPage={read} navigate={vi.fn()} />);
  await waitFor(() => expect(read).toHaveBeenLastCalledWith(`challengeId=${id(101)}`));
  expect((screen.getByLabelText("Learner ID") as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText("Challenge ID") as HTMLInputElement).value).toBe(id(101));
});
it.each([["", "No submissions yet."], [`learnerId=${id(11)}`, "No submissions match these filters."]])(
  "TA-01.1 TA-01.2 distinguishes empty results for %s", async (search, message) => {
    setup(vi.fn().mockResolvedValue(ok([])), search);
    await screen.findByText(message);
    if (search) expect(action("Clear filters")).toBeTruthy();
  },
);
it("TA-01.3 announces pending, disables page controls, retains filters", async () => {
  const later = pending<ReturnType<typeof ok>>();
  const read = vi.fn().mockResolvedValueOnce(ok([card()], "opaque-next")).mockReturnValueOnce(later.promise).mockResolvedValue(ok());
  setup(read, `learnerId=${id(11)}`);
  await screen.findByText("Checkout totals");
  fireEvent.click(action("Next page"));
  announced("Loading submissions…");
  expect(action("First page").matches(':disabled, [aria-disabled="true"]')).toBe(true);
  expect(Object.fromEntries(new URLSearchParams(read.mock.calls[1][0]))).toEqual({ learnerId: id(11), cursor: "opaque-next" });
  await act(async () => { later.resolve(ok()); });
  await screen.findByText("Checkout totals");
  expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  fireEvent.click(action("First page"));
  await waitFor(() => expect(read).toHaveBeenLastCalledWith(`learnerId=${id(11)}`));
});
it("TA-01.3 retries failed reads with the same query and treats invalid cursors separately", async () => {
  const read = vi.fn().mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValueOnce({ status: "invalid" }).mockResolvedValue(ok([]));
  const search = `learnerId=${id(11)}&cursor=opaque`;
  setup(read, search);
  await screen.findByText("We couldn't load submissions. Try again.");
  announced("We couldn't load submissions. Try again.");
  expect(screen.queryByText("No submissions match these filters.")).toBeNull();
  fireEvent.click(action("Try again"));
  await screen.findByText("This submissions page isn't valid.");
  expect(read.mock.calls.slice(0, 2)).toEqual([[search], [search]]);
  fireEvent.click(action("First page"));
  await waitFor(() => expect(read).toHaveBeenLastCalledWith(`learnerId=${id(11)}`));
});
it.each(["pending", "running", "failed"] as const)("TA-01.6 labels %s without a zero placeholder", async state => {
  setup(vi.fn().mockResolvedValue(ok([{ ...card(), gradingState: state, effectiveScore: null }])));
  await screen.findByText(state[0].toUpperCase() + state.slice(1));
  expect(screen.getByText("Not available")).toBeTruthy();
  expect(screen.queryByText("0 / 100")).toBeNull();
});
it("TA-01.2 TA-01.3 discards an older read completing after URL filters change", async () => {
  const old = pending<ReturnType<typeof ok>>(), current = pending<ReturnType<typeof ok>>();
  const read = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const { rerender } = setup(read, `learnerId=${id(11)}`);
  rerender(<SubmissionList search={`learnerId=${id(12)}`} readPage={read} navigate={vi.fn()} />);
  await act(async () => { current.resolve(ok([{ ...card(), title: "Current query" }])); });
  await screen.findByText("Current query");
  await act(async () => { old.resolve(ok([{ ...card(), title: "Stale protected result" }])); });
  expect(screen.queryByText("Stale protected result")).toBeNull();
  expect(screen.getByText("Current query")).toBeTruthy();
});
