import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FlagQueue } from "@/components/ta/flag-queue";
import { id, submission } from "../inspection/evidence";
const labels = ["Score near the pass mark", "AI grading output needed a retry", "Location match and AI assessment disagree", "Learner reported an unmatched comment"];
const flags = ["near_pass_mark", "grading_output_retried", "assessment_disagreement", "learner_report"].map((kind, i) => ({ ...submission().flags[0], id: id(810 + i), kind,
  status: "open" as const, resolutions: [], source: i === 3 ? "learner" : "rule", reason: i === 3 ? "<script>report()</script> Full report" : null, commentId: i === 3 ? id(602) : null }));
const ok = (items = flags, nextCursor: string | null = null) => ({ status: "ok" as const, page: { items, nextCursor } });
const action = (name: string) => screen.queryByRole("button", { name }) ?? screen.getByRole("link", { name });
function setup(readPage = vi.fn().mockResolvedValue(ok()), search = "") {
  const navigate = vi.fn((href: string) => { view.rerender(<FlagQueue search={new URL(href, "http://localhost").search.slice(1)} readPage={readPage} navigate={navigate} />); });
  const view = render(<FlagQueue search={search} readPage={readPage} navigate={navigate} />);
  return { ...view, navigate };
}
afterEach(cleanup);
it("TA-02.1 TA-02.2 shows four distinct flags, full inert report and selected-flag evidence links with timezone", async () => {
  setup(); await screen.findByText(labels[0]);
  expect(screen.getByRole("heading", { name: "Flagged submissions" })).toBeTruthy();
  for (const label of ["Submission", "Flag reason", "Status", "Recorded", ...labels]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("link", { name: "View submission" }).map(el => el.getAttribute("href"))).toEqual(flags.map(f => `/ta/submissions/${f.submissionId}?from=flags&flagId=${f.id}`));
  expect(screen.getByText(flags[3].reason!)).toBeTruthy(); expect(document.querySelector("script")).toBeNull();
  for (const time of document.querySelectorAll("time")) expect(time.textContent).toMatch(/2026.*\d{1,2}:\d{2}.*(?:UTC|GMT|[+-]\d{2}:?\d{2})/);
  expect(document.querySelectorAll("time")).toHaveLength(4);
});
it("TA-02.2 TA-02.3 applies URL filters atomically, resets cursor, restores search and retains filters on next/first", async () => {
  const read = vi.fn().mockResolvedValue(ok(flags, "next"));
  const { rerender, navigate } = setup(read, "status=resolved&kind=learner_report&cursor=old");
  await screen.findByText(labels[0]);
  expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("resolved");
  expect(Array.from((screen.getByLabelText("Flag reason") as HTMLSelectElement).options, o => o.text)).toEqual(["All", ...labels]);
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "open" } });
  fireEvent.click(action("Apply filters"));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  expect(Object.fromEntries(new URLSearchParams(read.mock.calls[1][0]))).toEqual({ status: "open", kind: "learner_report" });
  fireEvent.click(action("Next page")); await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
  expect(new URLSearchParams(read.mock.calls[2][0]).get("kind")).toBe("learner_report");
  expect(new URLSearchParams(read.mock.calls[2][0]).get("cursor")).toBe("next");
  fireEvent.click(action("First page")); await waitFor(() => expect(read).toHaveBeenCalledTimes(4));
  expect(new URLSearchParams(read.mock.calls[3][0]).has("cursor")).toBe(false);
  rerender(<FlagQueue search="status=resolved" readPage={read} navigate={navigate} />);
  await waitFor(() => expect(read).toHaveBeenLastCalledWith("status=resolved"));
  expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("resolved");
});
it.each([["", "No flagged submissions."], ["kind=learner_report", "No flags match these filters."]])("TA-02.1 TA-02.3 distinguishes empty %s", async (search, message) => {
  const { navigate } = setup(vi.fn().mockResolvedValue(ok([])), search); await screen.findByText(message);
  expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  if (search) { fireEvent.click(action("Show open flags")); expect(navigate).toHaveBeenLastCalledWith("/ta/flags"); }
});
it("TA-02.3 announces loading, disables paging, retries same failed query and recovers invalid cursor", async () => {
  let finish!: (value: ReturnType<typeof ok>) => void;
  const read = vi.fn().mockResolvedValueOnce(ok(flags, "next")).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValueOnce({ status: "invalid" }).mockResolvedValue(ok());
  setup(read, "kind=learner_report"); await screen.findByText(labels[0]); fireEvent.click(action("Next page"));
  expect(screen.getByText("Loading flagged submissions…").closest('[role="status"], [aria-live]')).not.toBeNull();
  expect(action("First page").matches(':disabled, [aria-disabled="true"]')).toBe(true);
  await act(async () => finish(ok(flags, "last"))); fireEvent.click(action("Next page"));
  await screen.findByText("We couldn't load flagged submissions. Try again."); fireEvent.click(action("Try again"));
  await screen.findByText("This queue page isn't valid."); expect(read.mock.calls[2]).toEqual(read.mock.calls[3]);
  fireEvent.click(action("First page")); await waitFor(() => expect(read).toHaveBeenLastCalledWith("kind=learner_report"));
});
it("TA-02.3 SYS-09 discards an older response that completes after filters change", async () => {
  let old!: (result: ReturnType<typeof ok>) => void, current!: (result: ReturnType<typeof ok>) => void;
  const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { old = resolve; })).mockImplementationOnce(() => new Promise(resolve => { current = resolve; }));
  const { rerender } = setup(read);
  rerender(<FlagQueue search="status=resolved" readPage={read} navigate={vi.fn()} />);
  await act(async () => current(ok([{ ...flags[3], reason: "Current response" }])));
  await screen.findByText("Current response");
  await act(async () => old(ok([{ ...flags[3], reason: "Stale protected response" }])));
  expect(screen.queryByText("Stale protected response")).toBeNull(); expect(screen.getByText("Current response")).toBeTruthy();
});
