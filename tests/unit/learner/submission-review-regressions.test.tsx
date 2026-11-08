import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceAccessBoundary } from "@/components/account/workspace-access-boundary";
import { RoleNavigation } from "@/components/account/role-navigation";
import { WorkspaceRoute } from "@/components/learner/workspace-route";
import type { ChallengeView } from "@/lib/learner/challenges";
import { submissionErrorMessages } from "@/lib/learner/submissions";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/learner/challenges/00000000-0000-4000-8000-000000000a01",
  useRouter: () => router,
}));

const account = { id: "00000000-0000-4000-8000-000000000011", displayName: "Learner A", role: "learner" as const };
const challengeId = "00000000-0000-4000-8000-000000000a01";
const revisionId = "00000000-0000-4000-8000-000000000201";
const submissionId = "00000000-0000-4000-8000-000000000501";
const commentId = "00000000-0000-4000-8000-000000000601";
const accountHeader = "X-LGTM-Workspace-Account-Id";
const comment = "Keep the original review text.";
const unknown = "We couldn't confirm submission. Check submission again before changing your review.";
const resultPath = `/learner/history/${submissionId}`;
const date = "2026-01-01T00:00:00Z";
const lines = ["function discounted(price, percent) {", "  const fraction = percent / 100;", "  return price * fraction;", "}"];
const challenge: ChallengeView = {
  id: challengeId, revisionId, title: "Checkout totals", description: "Review the changes to discounts and basket totals.",
  language: "javascript", difficulty: "easy", categories: ["edge_case", "logic_bug"], publishedAt: date,
  code: {
    path: "challenge.js", before: "", after: lines.join("\n") + "\n",
    hunks: [{ oldStart: 0, oldCount: 0, newStart: 1, newCount: lines.length,
      lines: lines.map((text, index) => ({ kind: "added", text, oldLine: null, newLine: index + 1 })) }],
  },
};

const post = vi.fn<(init: RequestInit) => Promise<Response>>();
const signOut = async () => {};
const readFirstAttemptAction = async () => ({ status: "ok", submissionId: null }) as const;

function response(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

function success(learner = account) {
  return Response.json({ data: {
    id: submissionId, challengeId, revisionId, learner: { id: learner.id, displayName: learner.displayName },
    attemptNumber: 1, previousSubmissionId: null, submittedAt: date, challenge,
    comments: [{ id: commentId, ordinal: 0, line: 3, body: comment }],
    grading: { state: "pending", failureCode: null, original: null, effective: null, overrides: [] },
    flags: [],
  } }, { status: 201 });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const path = input.toLowerCase();
    if (path === `/api/v1/challenges/${challengeId}`) {
      // Detail currently echoes the UUID casing in the URL, while create returns canonical UUIDs.
      const openedId = input.split("/").at(-1)!;
      return Response.json({ data: { ...challenge, id: openedId } });
    }
    if (path === `/api/v1/challenges/${challengeId}/submissions` && init?.method === "POST") return post(init);
    throw new Error("Unexpected request");
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function submitDraft(openedId = challengeId) {
  // The loaded account comes from the workspace server gate. Older G2 callers
  // may omit this new WorkspaceRoute prop.
  const workspaceProps = { challengeId: openedId, readFirstAttemptAction, accountId: account.id };
  render(<WorkspaceAccessBoundary signOutAction={signOut}>
    <RoleNavigation account={account} signOutAction={signOut} />
    <main>{createElement(WorkspaceRoute, workspaceProps)}</main>
  </WorkspaceAccessBoundary>);
  await screen.findByRole("heading", { name: challenge.title });
  fireEvent.click(screen.getByRole("button", { name: /add comment.*\b3\b/i }));
  fireEvent.change(screen.getByRole("textbox", { name: /comment/i }), { target: { value: comment } });
  fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Submit review?" }))
    .getByRole("button", { name: "Confirm submission" }));
}

function requestAt(index: number) {
  const request = post.mock.calls[index]?.[0];
  expect(request).toBeDefined();
  const headers = new Headers(request?.headers);
  return { accountId: headers.get(accountHeader), key: headers.get("Idempotency-Key"), body: request?.body };
}

function expectFrozen() {
  expect(screen.getByText(comment)).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: /comment/i })).toBeNull();
  for (const control of screen.getAllByRole<HTMLButtonElement>("button", { name: /^(add comment|edit|remove)\b/i })) {
    expect(control.disabled).toBe(true);
  }
  expect(screen.queryByRole<HTMLButtonElement>("button", { name: "Submit review" })?.disabled ?? true).toBe(true);
}

function expectResultNavigation() {
  expect([...router.push.mock.calls, ...router.replace.mock.calls].some(([path]) => path === resultPath)).toBe(true);
}

it.each([
  [429, "RATE_LIMITED", "Too many requests. Try again later."],
  [503, "SERVICE_UNAVAILABLE", submissionErrorMessages.submissionUnavailable],
])("LRN-04.4 REV-01 keeps the original outcome uncertain after a %s status check", async (status, code, message) => {
  post.mockRejectedValueOnce(new TypeError("Connection lost"))
    .mockResolvedValueOnce(response(status, code, message))
    .mockResolvedValueOnce(success());
  await submitDraft();
  await screen.findByText(unknown);
  fireEvent.click(screen.getByRole("button", { name: "Check submission" }));

  const checkAgain = await screen.findByRole<HTMLButtonElement>("button", { name: "Check submission" });
  expect(checkAgain.disabled).toBe(false);
  expect(screen.getByText(unknown)).toBeTruthy();
  expectFrozen();
  expect(post).toHaveBeenCalledTimes(2);
  expect(requestAt(1)).toEqual(requestAt(0));

  fireEvent.click(checkAgain);
  await waitFor(expectResultNavigation);
  expect(post).toHaveBeenCalledTimes(3);
  expect(requestAt(2)).toEqual(requestAt(0));
  expect(requestAt(0).key).toMatch(/^[\da-f-]{36}$/i);
  expect(JSON.parse(String(requestAt(0).body))).toEqual({ revisionId, comments: [{ line: 3, body: comment }] });
});

it("LRN-04.3 REV-04 opens the result when an uppercase workspace ID is returned canonically by create", async () => {
  post.mockResolvedValueOnce(success());
  await submitDraft(challengeId.toUpperCase());
  await waitFor(expectResultNavigation);
  expect(post).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Check submission" })).toBeNull();
});

it("LRN-04.4 SYS-09.3 SEC-REV-02 sends the loaded workspace account on initial submit and every replay", async () => {
  post.mockRejectedValueOnce(new TypeError("Connection lost"))
    .mockResolvedValueOnce(response(409, "INVALID_STATE", submissionErrorMessages.inProgress))
    .mockResolvedValueOnce(success());
  await submitDraft();
  await screen.findByText(unknown);
  fireEvent.click(screen.getByRole("button", { name: "Check submission" }));
  await screen.findByText(submissionErrorMessages.inProgress);
  fireEvent.click(screen.getByRole("button", { name: "Check submission" }));
  await waitFor(expectResultNavigation);

  expect(post).toHaveBeenCalledTimes(3);
  expect([requestAt(0).accountId, requestAt(1).accountId, requestAt(2).accountId]).toEqual(Array(3).fill(account.id));
});

it("ACC-03.4 SYS-09.3 SEC-REV-02 discards the frozen draft when the replay receives an account rejection", async () => {
  post.mockRejectedValueOnce(new TypeError("Connection lost"))
    .mockResolvedValueOnce(response(403, "FORBIDDEN", "This account cannot submit from the loaded workspace."));
  await submitDraft();
  await screen.findByText(unknown);
  fireEvent.click(screen.getByRole("button", { name: "Check submission" }));

  await screen.findByRole("heading", { name: /^(Account unavailable|Access denied|Sign in)$/i });
  expect(screen.queryByRole("region", { name: "Source" })).toBeNull();
  expect(screen.queryByText(comment)).toBeNull();
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(screen.queryByRole("button", { name: "Check submission" })).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Leave this review?" })).toBeNull();
  expect(router.push).not.toHaveBeenCalled();
  expect(post).toHaveBeenCalledTimes(2);
});
