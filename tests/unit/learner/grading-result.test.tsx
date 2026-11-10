import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import type { SubmissionView } from "@/lib/learner/submissions";
import { completed, failed, pending, running, submission, submissionId } from "./grading-fixture";

const resultModule = "../../../src/components/learner/grading-result.tsx";
const { GradingResult } = await import(resultModule) as {
  GradingResult: ComponentType<{ submissionId: string; initialSubmission?: SubmissionView }>;
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const exact = (text: string) => screen.getByText(text, { exact: true });
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
const endpoint = `/api/v1/submissions/${submissionId}`;

function view(grading: unknown) {
  return { ...submission, grading } as SubmissionView;
}
function withGrade(grading: unknown) {
  return render(<GradingResult submissionId={submissionId} initialSubmission={view(grading)} />);
}
function requestSpy() {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

it("LRN-05.1 SYS-02.2 shows the pinned result and read-only submitted text with the two navigation links", () => {
  const { container } = withGrade(completed);
  expect(screen.getByRole("heading", { name: "Review result" })).toBeDefined();
  expect(exact("Checkout totals")).toBeDefined();
  expect(screen.getByText(/\bAttempt\b/)).toBeDefined();
  expect(screen.getByText(/^Submitted(?:\s|$)/, { selector: ":not(h2)" })).toBeDefined();
  expect(exact("return price * fraction;")).toBeDefined();
  expect(exact(submission.comments[2].body)).toBeDefined();
  expect(container.querySelector('img[src*="attacker.example.test"]')).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: /^(Edit|Remove|Add comment|Submit review)\b/ })).toBeNull();
  expect(href("Review history")).toBe("/learner/history");
  expect(href("Browse challenges")).toBe("/learner/challenges");
});

it.each([
  { grading: pending, label: "Grading pending" },
  { grading: running, label: "Grading your review…" },
])("LRN-05.2 SYS-17.2 announces $label without a score, result or editable comment", ({ grading, label }) => {
  requestSpy().mockImplementation(() => new Promise<Response>(() => {}));
  withGrade(grading);
  const status = exact(label);
  expect(status.closest('[role="status"], [aria-live]')).not.toBeNull();
  expect(screen.queryByText(/^\d+ \/ 100$/)).toBeNull();
  expect(screen.queryByText(/^(Passed|Not passed)$/)).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
});

it("LRN-05.4 LRN-05.5 renders the original score, components, classifications and credits once", () => {
  withGrade({ ...completed, effective: { score: 70, passed: true, source: "ta" } });
  expect(screen.queryByText("70 / 100", { exact: true })).toBeNull();
  for (const text of [
    "Original assessment", "Score", "25 / 100", "Pass mark", "Not passed",
    "Component points", "Identification", "Explanation", "Actionable fix", "Matched flaws", "Missed flaws",
  ]) expect(screen.getAllByText(text, { exact: true })).toHaveLength(1);
  const statuses = [
    { name: "Matched", note: null },
    { name: "Duplicate", note: "Another comment already counts for this flaw." },
    { name: "Unmatched", note: "No flaw matched this comment's location." },
  ];
  for (const [index, { name, note }] of statuses.entries()) {
    expect(screen.getAllByText(name, { exact: true })).toHaveLength(1);
    const item = exact(submission.comments[index].body).closest("li");
    expect(item).not.toBeNull();
    const comment = within(item!);
    expect(comment.getByText(name, { exact: true })).toBeDefined();
    if (note) {
      expect(comment.getByText(note, { exact: true })).toBeDefined();
      expect(comment.getByText("No credit", { exact: true })).toBeDefined();
      expect(comment.getAllByText(/^[—–-]$/)).toHaveLength(2);
    } else {
      expect(comment.getAllByText(/^1(?:\.0+)?$/)).toHaveLength(2);
    }
    expect(comment.getAllByText("Explanation credit", { exact: true })).toHaveLength(1);
    expect(comment.getAllByText("Fix credit", { exact: true })).toHaveLength(1);
  }
  expect(screen.queryByText(completed.original.comments[0].feedback!, { exact: true })).toBeNull();
});

it.each([
  ["RATE_LIMITED", "Grading usage limit reached. Try grading again later.", true],
  ["PAYLOAD_TOO_LARGE", "This review is too large for grading. Your submitted review is saved.", false],
  ["INVALID_AI_OUTPUT", "We couldn't produce a valid assessment. Try grading again.", true],
  ["AI_UNAVAILABLE", "AI grading is unavailable. Try grading again.", true],
  ["AI_TIMEOUT", "Grading timed out. Try grading again.", true],
  ["SERVICE_UNAVAILABLE", "Grading is unavailable. Try grading again later.", true],
] as const)("LRN-05.3 LRN-05.6 renders %s without automatically starting a retry", (code, message, retryable) => {
  const fetch = requestSpy();
  withGrade(failed(code));
  expect(exact("Grading failed. Your review is still saved.")).toBeDefined();
  expect(exact(message)).toBeDefined();
  expect(Boolean(screen.queryByRole("button", { name: "Retry grading" }))).toBe(retryable);
  expect(screen.queryByText(/^\d+ \/ 100$/)).toBeNull();
  expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
});

it("LRN-05.3 starts one explicit retry for the same submission and disables it until the response", async () => {
  const fetch = requestSpy();
  const response = Promise.withResolvers<Response>();
  fetch.mockReturnValueOnce(response.promise);
  withGrade(failed("AI_UNAVAILABLE"));
  fireEvent.click(button("Retry grading"));
  const retry = button("Retrying grading…");
  expect(retry.disabled).toBe(true);
  fireEvent.click(retry);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledWith(endpoint + "/grade", expect.objectContaining({ method: "POST" }));
  response.resolve(Response.json({ data: completed }));
  expect(await screen.findByText("25 / 100", { exact: true })).toBeDefined();
});

it("LRN-05.7 shows a loading status then retries a failed initial read for the same submission", async () => {
  const fetch = requestSpy();
  const response = Promise.withResolvers<Response>();
  fetch.mockReturnValueOnce(response.promise);
  render(<GradingResult submissionId={submissionId} />);
  expect(exact("Loading review result…")).toBeDefined();
  response.resolve(Response.json({ error: { code: "SERVICE_UNAVAILABLE", message: "Try again." } }, { status: 503 }));
  expect(await screen.findByText("We couldn't load this review result. Try again.", { exact: true })).toBeDefined();
  fetch.mockResolvedValueOnce(Response.json({ data: view(completed) }));
  fireEvent.click(button("Try again"));
  expect(await screen.findByText("25 / 100", { exact: true })).toBeDefined();
  expect(fetch.mock.calls.map(([input, init]) => [input, init?.method ?? "GET"])).toEqual([
    [endpoint, "GET"], [endpoint, "GET"],
  ]);
});

it("LRN-05.7 reports a missing submission without rendering or starting grading", async () => {
  const fetch = requestSpy();
  fetch.mockResolvedValueOnce(Response.json({ error: { code: "NOT_FOUND", message: "Review not found." } }, { status: 404 }));
  render(<GradingResult submissionId={submissionId} />);
  expect(await screen.findByRole("heading", { name: "Review not found" })).toBeDefined();
  expect(exact("We couldn't find this review.")).toBeDefined();
  expect(href("Review history")).toBe("/learner/history");
  expect(screen.queryByText("Grading pending", { exact: true })).toBeNull();
  expect(fetch).toHaveBeenCalledOnce();
});

it("LRN-05.3 LRN-05.7 observes the same submission after an uncertain retry response", async () => {
  const fetch = requestSpy();
  fetch.mockRejectedValueOnce(new TypeError("Network disconnected"));
  fetch.mockResolvedValueOnce(Response.json({ data: view(completed) }));
  withGrade(failed("AI_UNAVAILABLE"));
  fireEvent.click(button("Retry grading"));

  expect(await screen.findByText("25 / 100", { exact: true })).toBeDefined();
  expect(fetch.mock.calls.map(([input, init]) => [input, init?.method ?? "GET"])).toEqual([
    [endpoint + "/grade", "POST"], [endpoint, "GET"],
  ]);
});
