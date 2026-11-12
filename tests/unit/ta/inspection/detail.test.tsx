import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SubmissionDetail } from "@/components/ta/submission-detail";
import { id, submission } from "./evidence";
const renderer = vi.hoisted(() => ({ seen: vi.fn() }));
vi.mock("@/components/code-diff", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/code-diff")>();
  return { CodeDiffView: (props: Parameters<typeof actual.CodeDiffView>[0]) => {
    renderer.seen(props.code);
    return <actual.CodeDiffView {...props} />;
  } };
});
const ok = (view = submission()) => ({ status: "ok" as const, submission: view });
const action = (name: string) => screen.queryByRole("button", { name }) ?? screen.getByRole("link", { name });
function setup(readSubmission = vi.fn().mockResolvedValue(ok()), search = "") {
  return render(<SubmissionDetail submissionId={id(501)} search={search} readSubmission={readSubmission} />);
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("TA-01.4 SYS-04.2 shows pinned real diff with shared renderer, ordered comments and complete private answer evidence", async () => {
  const view = submission();
  setup(vi.fn().mockResolvedValue(ok(view)));
  await screen.findByRole("heading", { name: "Submission" });
  for (const value of ["Learner A", id(11), "Checkout totals", ...view.comments.map(c => c.body)]) expect(screen.getAllByText(value).length).toBeGreaterThan(0);
  expect(renderer.seen).toHaveBeenCalledWith(view.challenge.code);
  const source = screen.getByRole("region", { name: "Source" });
  expect(source.getAttribute("tabindex")).toBe("0");
  expect(source.textContent).toContain(view.answerKey[0].originalSnippet);
  expect(source.textContent).toContain(view.answerKey[0].replacementSnippet);
  expect(source.querySelector('[data-kind="added"]')?.textContent).toContain("3");
  const text = document.body.textContent!;
  expect(text.indexOf(view.comments[0].body)).toBeLessThan(text.indexOf(view.comments[1].body));
  for (const flaw of view.answerKey) for (const value of [flaw.originalSnippet, flaw.replacementSnippet, flaw.explanation, flaw.fix]) {
    expect(text).toContain(value);
  }
  expect(text).toMatch(/source/i); expect(text).toMatch(/final/i);
  expect(screen.getAllByText("Logic bug").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Edge case").length).toBeGreaterThan(0);
  expect(document.querySelector("textarea, [contenteditable=true]")).toBeNull();
  expect(screen.queryByRole("button", { name: /run|execute|edit (?:submission|answers)/i })).toBeNull();
  expect(screen.getByRole("link", { name: "Back to submissions" }).getAttribute("href")).toBe("/ta/submissions");
});
it("TA-01.5 keeps original 25/fail separate from effective override 70/pass and exposes matching, missed and unmatched evidence", async () => {
  setup();
  await screen.findByRole("heading", { name: "Original assessment" });
  // Each assessment is a labelled region so parallel grades cannot be confused.
  const original = within(screen.getByRole("region", { name: "Original assessment" }));
  const current = within(screen.getByRole("region", { name: "Current grade" }));
  expect(original.getByText("25 / 100")).toBeTruthy();
  expect(original.getByText("Not passed", { exact: true })).toBeTruthy();
  expect(original.getByText(/pass mark.*60|60.*pass mark/i)).toBeTruthy();
  for (const label of [/identification/i, /explanation/i, /fix/i, /matched/i, /missed/i]) expect(original.getAllByText(label).length).toBeGreaterThan(0);
  expect(current.getByText("70 / 100")).toBeTruthy();
  expect(current.getByText("TA override")).toBeTruthy();
  expect(current.getByText("Passed", { exact: true })).toBeTruthy();
  expect(screen.getAllByText("Not assessed").length).toBeGreaterThan(0);
  expect(document.body.textContent).toContain("The consequence and proposed fix are clear.");
  expect(document.body.textContent).toMatch(/unmatched/i);
  expect(document.body.textContent).toContain(submission().answerKey[1].explanation);
});
it("TA-01.5 labels duplicate comments without fabricated credits or feedback", async () => {
  const view = submission();
  view.comments.push({ id: id(607), ordinal: 2, line: 3, body: "Duplicate concern" });
  view.matching.duplicateCommentIds = [id(607)];
  view.grading.original!.duplicateCommentIds = [id(607)];
  view.grading.original!.comments.push({ commentId: id(607), matched: false, explanationCredit: null, fixCredit: null, feedback: null });
  setup(vi.fn().mockResolvedValue(ok(view)));
  await screen.findByText("Duplicate concern");
  expect(document.body.textContent).toMatch(/duplicate/i);
  expect(screen.getAllByText("Not assessed").length).toBeGreaterThan(0);

});
it.each(["pending", "running", "failed"] as const)("TA-01.6 retains code/comments with %s grading and refreshes only the stored read", async state => {
  const view = submission();
  view.grading = { ...view.grading, state, original: null, effective: null, failureCode: state === "failed" ? "AI_UNAVAILABLE" : null };
  const read = vi.fn().mockResolvedValueOnce(ok(view)).mockResolvedValueOnce(ok());
  setup(read);
  await screen.findByText("Assessment not available.");
  expect(screen.getByText(state[0].toUpperCase() + state.slice(1))).toBeTruthy();
  expect(screen.getByText("Not available")).toBeTruthy();
  expect(screen.queryByText("0 / 100")).toBeNull();
  expect(screen.getByRole("region", { name: "Source" })).toBeTruthy();
  expect(screen.getByText(view.comments[0].body)).toBeTruthy();
  fireEvent.click(action("Refresh submission"));
  await screen.findByText("25 / 100");
  expect(read.mock.calls).toEqual([[id(501)], [id(501)]]);
});
it("TA-01.4 TA-01.6 renders a completed zero grade and empty comments without unavailable placeholders", async () => {
  const view = submission(); view.comments = [];
  Object.assign(view.grading.original!, { score: 0, identificationPoints: 0, explanationPoints: 0, fixPoints: 0, comments: [], matchedCount: 0, missedCount: 2 });
  view.grading.effective = { score: 0, passed: false, source: "ai" };
  setup(vi.fn().mockResolvedValue(ok(view)));
  await screen.findByText("No comments submitted.");
  expect(screen.getAllByText("0 / 100")).toHaveLength(2);
  expect(screen.getByText("Original AI assessment")).toBeTruthy();
  expect(screen.queryByText("Assessment not available.")).toBeNull();
});
it("TA-01.7 announces loading, retries the same failed read and distinguishes missing records", async () => {
  let finish!: (value: { status: string }) => void;
  const read = vi.fn().mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce({ status: "not_found" });
  setup(read);
  expect(screen.getByText("Loading submission…").closest('[role="status"], [aria-live]')).not.toBeNull();
  await act(async () => { finish({ status: "unavailable" }); });
  await screen.findByText("We couldn't load this submission. Try again.");
  expect(screen.queryByText("Submission not found.")).toBeNull();
  expect(action("Back to submissions")).toBeTruthy();
  fireEvent.click(action("Try again"));
  await screen.findByText("Submission not found.");
  expect(read.mock.calls).toEqual([[id(501)], [id(501)]]);
});
it.each([
  ["", null, null], ["from=flags", "Back to flagged submissions", "/ta/flags"],
  [`from=learner&learnerId=${id(11)}`, "Back to learner", `/ta/learners/${id(11)}`],
  ["from=https://evil.example", null, null], [`from=learner&learnerId=bad`, null, null],
  [`from=learner&learnerId=${id(12)}`, null, null],
] as const)("TA-01.8 SYS-02.1 validates return context %s without initiating moderation", async (search, label, href) => {
  const read = vi.fn().mockResolvedValue(ok()); setup(read, search);
  await screen.findByRole("heading", { name: "Submission" });
  expect(action("Back to submissions")).toBeTruthy();
  if (label) expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(href);
  else expect(screen.queryByRole("link", { name: /Back to learner|Back to flagged submissions/ })).toBeNull();
  expect(document.querySelector('a[href^="https://evil.example"]')).toBeNull();
  expect(read).toHaveBeenCalledTimes(1);
});
it("SYS-02.2 TA-01.4 renders malicious names, comments, code and feedback as inert text", async () => {
  const view = submission(); const payload = '<img src="https://evil.example/pixel" onerror="alert(1)">';
  view.learner.displayName = payload; view.comments[0].body = payload;
  view.grading.original!.comments[0].feedback = payload; view.answerKey[0].explanation = payload;
  view.challenge.code = { ...view.challenge.code, hunks: [{ oldStart: 1, oldCount: 1, newStart: 1, newCount: 1,
    lines: [{ kind: "context", oldLine: 1, newLine: 1, text: payload }] }] };
  setup(vi.fn().mockResolvedValue(ok(view)));
  await waitFor(() => expect(screen.getAllByText(payload).length).toBeGreaterThanOrEqual(4));
  expect(document.querySelector("img, script, iframe")).toBeNull();
});
