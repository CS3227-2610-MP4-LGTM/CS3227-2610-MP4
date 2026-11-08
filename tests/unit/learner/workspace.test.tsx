import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChallengeWorkspace } from "@/components/learner/challenge-workspace";

const catalogue = "/learner/challenges";
const challengeId = "00000000-0000-4000-8000-000000000101";
const firstAttemptId = "00000000-0000-4000-8000-000000000501";
const revision1 = "00000000-0000-4000-8000-000000000201";
const revision2 = "00000000-0000-4000-8000-000000000211";

function challenge(revisionId: string, source: string) {
  return {
    id: challengeId,
    revisionId,
    title: "Checkout totals <em>review</em>",
    description: '<img src="https://example.test/header.png" onerror="alert(1)">',
    language: "javascript" as const,
    difficulty: "easy" as const,
    categories: ["edge_case", "logic_bug"] as Array<"edge_case" | "logic_bug">,
    publishedAt: "2026-01-01T00:00:00Z",
    code: {
      path: "challenge.js",
      before: "",
      after: source,
      hunks: [{
        oldStart: 0, oldCount: 0, newStart: 1, newCount: 1,
        lines: [{ kind: "added" as const, text: source, oldLine: null, newLine: 1 }],
      }],
    },
  };
}

const opened = challenge(revision1, "return price * fraction;");
const updated = { ...challenge(revision2, "return price / fraction;"), title: "Revised checkout totals" };
const found = (view = opened) => ({ status: "ok" as const, challenge: view });
const noAttempt = { status: "ok" as const, submissionId: null };

function expectReadOnly() {
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: /add (?:a )?comment|submit|retry review|start (?:a )?review/i })).toBeNull();
}

function expectAnnouncement(message: string) {
  const element = screen.getByText(message);
  expect(element.closest('[role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]')).not.toBeNull();
}

afterEach(cleanup);

it("LRN-02.1 LRN-02.2 LRN-02.3 SYS-17.1 focuses an inert PR header and shows the authorized source below it", async () => {
  const view = render(<ChallengeWorkspace challengeId={challengeId}
    readChallenge={vi.fn().mockResolvedValue(found())} readFirstAttempt={vi.fn().mockResolvedValue(noAttempt)} />);
  const heading = await screen.findByRole("heading", { name: opened.title });
  expect(document.activeElement).toBe(heading);
  expect(screen.getByRole("link", { name: "Back to challenges" }).getAttribute("href")).toBe(catalogue);
  for (const value of ["Description", "Language", "Difficulty", "Flaw categories", opened.description, "JavaScript", "Easy", "Edge case", "Logic bug"]) {
    expect(screen.getByText(value)).toBeTruthy();
  }
  expect(screen.queryByText(/^(repository|branch|commit|author)$/i)).toBeNull();
  const source = screen.getByRole("region", { name: "Source" });
  expect(screen.getAllByRole("region", { name: "Source" })).toHaveLength(1);
  expect(heading.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(source).getByText("challenge.js")).toBeTruthy();
  expect(within(source).getByText("1", { exact: true })).toBeTruthy();
  expect(source.textContent).toContain(opened.code.after);
  expect(view.container.querySelector("em, img")).toBeNull();
  expect(screen.queryByRole("button", { name: /run|build|execute/i })).toBeNull();
});

it("LRN-02.4 keeps the opened source through a publication and uses the new source on a fresh entry", async () => {
  const readFirstAttempt = vi.fn().mockResolvedValue(noAttempt);
  const firstRead = vi.fn().mockResolvedValue(found(opened));
  const refreshedRead = vi.fn().mockResolvedValue(found(updated));
  const view = render(<ChallengeWorkspace challengeId={challengeId}
    readChallenge={firstRead} readFirstAttempt={readFirstAttempt} />);
  const source = await screen.findByRole("region", { name: "Source" });
  expect(source.textContent).toContain(opened.code.after);

  // Simulate a parent refresh after the live pointer has advanced at the same URL.
  await act(async () => {
    view.rerender(<ChallengeWorkspace challengeId={challengeId}
      readChallenge={refreshedRead} readFirstAttempt={readFirstAttempt} />);
  });
  expect(screen.getByRole("heading", { name: opened.title })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: updated.title })).toBeNull();
  expect(screen.getByRole("region", { name: "Source" }).textContent).toContain(opened.code.after);
  expect(screen.getByRole("region", { name: "Source" }).textContent).not.toContain(updated.code.after);
  view.unmount();

  render(<ChallengeWorkspace challengeId={challengeId}
    readChallenge={refreshedRead} readFirstAttempt={readFirstAttempt} />);
  expect(await screen.findByRole("heading", { name: updated.title })).toBeTruthy();
  const reopened = screen.getByRole("region", { name: "Source" });
  expect(reopened.textContent).toContain(updated.code.after);
  expect(reopened.textContent).not.toContain(opened.code.after);
});

it("LRN-02.5 links an existing first attempt and offers no new editor or submission action", async () => {
  render(<ChallengeWorkspace challengeId={challengeId} readChallenge={vi.fn().mockResolvedValue(found(updated))}
    readFirstAttempt={vi.fn().mockResolvedValue({ status: "ok", submissionId: firstAttemptId })} />);
  expect(await screen.findByText("You have already submitted a review of this challenge.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "View first attempt" }).getAttribute("href"))
    .toBe(`/learner/history/${firstAttemptId}`);
  expectReadOnly();
});

it.each(["material", "attempt"] as const)("LRN-02.6 waits for both reads, announces a %s failure and repeats both reads on retry", async (failingRead) => {
  const unavailable = { status: "unavailable" as const };
  let fail!: (value: typeof unavailable) => void;
  const pendingFailure = new Promise<typeof unavailable>((resolve) => { fail = resolve; });
  const readChallenge = vi.fn().mockReturnValueOnce(failingRead === "material" ? pendingFailure : Promise.resolve(found()))
    .mockResolvedValue(found());
  const readFirstAttempt = vi.fn().mockReturnValueOnce(failingRead === "attempt" ? pendingFailure : Promise.resolve(noAttempt))
    .mockResolvedValue(noAttempt);
  render(<ChallengeWorkspace challengeId={challengeId} readChallenge={readChallenge} readFirstAttempt={readFirstAttempt} />);
  expectAnnouncement("Loading challenge…");
  await waitFor(() => expect(failingRead === "material" ? readChallenge : readFirstAttempt).toHaveBeenCalledWith(challengeId));
  expectReadOnly();
  expect(screen.queryByRole("link", { name: "View first attempt" })).toBeNull();

  await act(async () => { fail(unavailable); });
  expectAnnouncement("We couldn't load this challenge. Try again.");
  expectReadOnly();
  const readsBeforeRetry = [readChallenge.mock.calls.length, readFirstAttempt.mock.calls.length];
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: opened.title });
  for (const [index, read] of [readChallenge, readFirstAttempt].entries()) {
    expect(read).toHaveBeenCalledTimes(readsBeforeRetry[index]! + 1);
    expect(read).toHaveBeenLastCalledWith(challengeId);
  }
});

it.each([
  ["not_found", "Challenge not found", "We couldn't find this challenge.", "Back to challenges"],
  ["forbidden", "Access denied", "This item isn't available to your account.", "Go to my workspace"],
] as const)("LRN-02.7 shows the %s recovery screen without a source or editor", async (status, title, message, link) => {
  render(<ChallengeWorkspace challengeId={challengeId} readChallenge={vi.fn().mockResolvedValue({ status })}
    readFirstAttempt={vi.fn().mockResolvedValue(noAttempt)} />);
  expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
  expect(screen.getByText(message)).toBeTruthy();
  expect(screen.getByRole("link", { name: link }).getAttribute("href")).toBe(catalogue);
  expect(screen.queryByRole("region", { name: "Source" })).toBeNull();
  expectReadOnly();
});
