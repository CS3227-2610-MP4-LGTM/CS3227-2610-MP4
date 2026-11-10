import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceAccessBoundary } from "@/components/account/workspace-access-boundary";
import { GradingResult } from "@/components/learner/grading-result";
import type { LearnerGrade } from "@/lib/learner/grading";
import type { SubmissionView } from "@/lib/learner/submissions";
import { uid } from "../server/llm/fixtures";
import { completed, learnerId, original, submission, submissionId } from "./grading-fixture";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const endpoint = `/api/v1/submissions/${submissionId}`;
const hints = [
  { hintId: uid(402), category: "edge_case" },
  { hintId: uid(401), category: "logic_bug" },
  { hintId: uid(404), category: "edge_case" },
] as const;
const feedback = '<script>window.leaked = true</script> [open](https://attacker.example.test/feedback)';
const firstHint = '<img src="https://attacker.example.test/hint" onerror="alert(1)">';
const secondHint = "Consider an empty basket.";
const result = (grade: LearnerGrade): SubmissionView => ({
  ...submission, attemptNumber: 1,
  grading: { ...completed, original: grade, overrides: [] },
}) as SubmissionView;

function grade(changes: Partial<LearnerGrade> = {}): LearnerGrade {
  return {
    ...original, unmatchedCommentIds: [...original.unmatchedCommentIds], duplicateCommentIds: [...original.duplicateCommentIds],
    comments: [{ ...original.comments[0], feedback }, original.comments[1], original.comments[2]],
    eligibleHints: [...hints], missedCount: hints.length, ...changes,
  };
}

function mount(value = grade()) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const view = render(<WorkspaceAccessBoundary signOutAction={async () => {}}>
    <GradingResult submissionId={submissionId} accountId={learnerId} initialSubmission={result(value)} />
  </WorkspaceAccessBoundary>);
  return { ...view, fetch };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function section(name: string) {
  const heading = screen.getByRole("heading", { name });
  const area = heading.closest("section");
  expect(area).not.toBeNull();
  return within(area!);
}
const reveal = (category: string) => screen.getByRole("button", { name: new RegExp(`Show hint.*${category}|${category}.*Show hint`, "i") });
const hintUrl = (id: string) => `${endpoint}/hints/${id}`;
const hintResponse = (id: string, text: string) => Response.json({ data: { hintId: id, category: "edge_case", text } });
const failure = (status: number, code: string, headers?: HeadersInit) =>
  Response.json({ error: { code, message: "Read failed." } }, { status, headers });
const exact = (text: string) => screen.getByText(text, { exact: true });

it("LRN-06.1 SEC-02.2 shows one matched feedback as inert text alongside the original credits and statuses", () => {
  const { container, fetch } = mount();
  const earned = section("Earned credit");
  section("Missed criteria");
  section("Next actions");
  expect(earned.getByText(feedback, { exact: true })).toBeDefined();
  expect(screen.getAllByText("Feedback", { exact: true })).toHaveLength(1);
  expect(screen.getAllByText(feedback, { exact: true })).toHaveLength(1);
  const item = exact(submission.comments[0].body).closest("li");
  expect(item).not.toBeNull();
  const matched = within(item!);
  for (const name of ["Feedback", feedback, "Matched", "Explanation credit", "Fix credit"]) {
    expect(matched.getByText(name, { exact: true })).toBeDefined();
  }
  for (const name of ["Original assessment", "Component points", "Matched", "Duplicate", "Unmatched"]) {
    expect(screen.getAllByText(name, { exact: true })).toHaveLength(1);
  }
  for (const { body } of submission.comments.slice(1)) {
    const other = exact(body).closest("li");
    expect(within(other!).queryByText("Feedback", { exact: true })).toBeNull();
    expect(within(other!).getByText("No credit", { exact: true })).toBeDefined();
  }
  expect(container.querySelector('script, a[href*="attacker.example.test"], img[src*="attacker.example.test"]')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it("LRN-06.2 groups missed flaw counts in vocabulary order and separately identifies partial explanation and fix", () => {
  const value = grade();
  value.comments[0] = { ...original.comments[0], feedback, explanationCredit: 0.5, fixCredit: 0 };
  mount(value);
  const missed = section("Missed criteria");
  expect(missed.getByText(/\bExplanation\b/)).toBeDefined();
  expect(missed.getByText(/\bActionable fix\b/)).toBeDefined();
  const logic = missed.getByText(/^Logic bug\b/i);
  const edge = missed.getByText(/^Edge case\b/i);
  expect((logic.closest("li, section, [role=group]") ?? logic.parentElement)?.textContent).toMatch(/\b1\b/);
  expect((edge.closest("li, section, [role=group]") ?? edge.parentElement)?.textContent).toMatch(/\b2\b/);
  expect(logic.compareDocumentPosition(edge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  for (const { hintId } of hints) expect(screen.queryByText(hintId)).toBeNull();
});

it("LRN-06.2 LRN-06.3 shows the empty criteria and hints states for full credit with no missed flaws", () => {
  mount(grade({ eligibleHints: [], missedCount: 0 }));
  expect(exact("No missed criteria in this assessment.")).toBeDefined();
  expect(exact("No hints needed for missed flaws.")).toBeDefined();
  expect(screen.queryByRole("button", { name: /Show hint/i })).toBeNull();
});

it("LRN-06.3 SEC-02.2 reveals one ordered hint per activation, keeps prior text, and starts collapsed on reopen", async () => {
  const { container, fetch, unmount } = mount();
  expect(fetch).not.toHaveBeenCalled();
  const first = Promise.withResolvers<Response>();
  fetch.mockReturnValueOnce(first.promise);
  const control = reveal("Edge case");
  control.focus();
  fireEvent.click(control);
  const loading = screen.getByRole<HTMLButtonElement>("button", { name: /Loading hint…/i });
  expect(loading.disabled || loading.getAttribute("aria-disabled") === "true").toBe(true);
  expect(document.activeElement).toBe(loading);
  fireEvent.click(loading);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe(hintUrl(hints[0].hintId));
  expect(new Headers(fetch.mock.calls[0][1]?.headers).get("X-LGTM-Workspace-Account-Id")).toBe(learnerId);
  first.resolve(hintResponse(hints[0].hintId, firstHint));
  expect(await screen.findByText(firstHint, { exact: true })).toBeDefined();
  expect(container.querySelector('img[src*="attacker.example.test"]')).toBeNull();

  const second = Promise.withResolvers<Response>();
  fetch.mockReturnValueOnce(second.promise);
  fireEvent.click(reveal("Edge case"));
  expect(exact(firstHint)).toBeDefined();
  const loadingAgain = screen.getByRole<HTMLButtonElement>("button", { name: /Loading hint…/i });
  expect(loadingAgain.disabled || loadingAgain.getAttribute("aria-disabled") === "true").toBe(true);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([hintUrl(hints[0].hintId), hintUrl(hints[2].hintId)]);
  second.resolve(hintResponse(hints[2].hintId, secondHint));
  expect(await screen.findByText(secondHint, { exact: true })).toBeDefined();
  expect(exact("All hints shown")).toBeDefined();
  expect(reveal("Logic bug")).toBeDefined();
  unmount();

  const reopened = mount();
  expect(screen.queryByText(firstHint, { exact: true })).toBeNull();
  expect(reopened.fetch).not.toHaveBeenCalled();
  reopened.fetch.mockResolvedValueOnce(hintResponse(hints[0].hintId, firstHint));
  fireEvent.click(reveal("Edge case"));
  expect(await screen.findByText(firstHint, { exact: true })).toBeDefined();
  expect(reopened.fetch.mock.calls[0][0]).toBe(hintUrl(hints[0].hintId));
});

it.each([[403, "FORBIDDEN"], [404, "NOT_FOUND"]] as const)(
  "LRN-06.4 retries the same failed hint and refreshes result eligibility after hint error %s", async (status, code) => {
    const { fetch } = mount();
    fetch.mockResolvedValueOnce(failure(503, "SERVICE_UNAVAILABLE"));
    fireEvent.click(reveal("Edge case"));
    expect(await screen.findByText("We couldn't load this hint. Try again.", { exact: true })).toBeDefined();
    fetch.mockResolvedValueOnce(hintResponse(hints[0].hintId, firstHint));
    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(await screen.findByText(firstHint, { exact: true })).toBeDefined();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(Array(2).fill(hintUrl(hints[0].hintId)));

    fetch.mockResolvedValueOnce(failure(status, code));
    fireEvent.click(reveal("Edge case"));
    expect(await screen.findByText("This hint isn't available for this review.", { exact: true })).toBeDefined();
    fetch.mockResolvedValueOnce(Response.json({ data: result(grade({ eligibleHints: [], missedCount: 0 })) }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh result" }));
    // Refresh can reload the page's server reads or read the existing result endpoint.
    if (!router.refresh.mock.calls.length) {
      expect(await screen.findByText("No hints needed for missed flaws.", { exact: true })).toBeDefined();
    }
    expect(fetch.mock.calls.map(([url]) => url).slice(0, 3)).toEqual([
      hintUrl(hints[0].hintId), hintUrl(hints[0].hintId), hintUrl(hints[2].hintId),
    ]);
    expect(fetch.mock.calls.every(([url]) => url !== hintUrl(hints[1].hintId))).toBe(true);
  });

it.each([
  [403, "FORBIDDEN", "account_unavailable", "Account unavailable"],
  [503, "SERVICE_UNAVAILABLE", "account_service_unavailable", "Service unavailable"],
] as const)("LRN-06.4 ACC-03 removes protected result content after hint account error %s %s", async (status, code, access, title) => {
  const { fetch } = mount();
  fetch.mockResolvedValueOnce(failure(status, code, { "X-LGTM-Account-Access": access }));
  fireEvent.click(reveal("Edge case"));
  expect(await screen.findByRole("heading", { name: title })).toBeDefined();
  expect(screen.queryByRole("heading", { name: "Review result" })).toBeNull();
  expect(screen.queryByText(submission.comments[0].body)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
