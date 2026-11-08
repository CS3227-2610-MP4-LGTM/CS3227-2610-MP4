import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceAccessBoundary } from "@/components/account/workspace-access-boundary";
import { RoleNavigation } from "@/components/account/role-navigation";
import { WorkspaceRoute } from "@/components/learner/workspace-route";
import type { ChallengeView } from "@/lib/learner/challenges";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/learner/challenges/00000000-0000-4000-8000-000000000101",
  useRouter: () => router,
}));

const challengeId = "00000000-0000-4000-8000-000000000101";
const revisionId = "00000000-0000-4000-8000-000000000201";
const submissionId = "00000000-0000-4000-8000-000000000511";
const commentId = "00000000-0000-4000-8000-000000000611";
const account = { id: "00000000-0000-4000-8000-000000000011", displayName: "Learner A", role: "learner" as const };
const materialPath = "/api/v1/challenges/" + challengeId;
const resultPath = "/learner/history/" + submissionId;
const timestamp = "2026-01-01T00:00:00Z";

const lines = [
  "function discounted(price, percent) {",
  "  const fraction = percent / 100;",
  "  return price * fraction;",
  "}",
  "",
  "// Basket totals use whole currency units.",
  "",
  "function basketTotal(items) {",
  "  const prices = items.map(item => item.price);",
  "  return prices.reduce((sum, price) => sum + price);",
  "}",
];
const challenge: ChallengeView = {
  id: challengeId, revisionId, title: "Checkout totals", description: "Review the changes to discounts and basket totals.",
  language: "javascript", difficulty: "easy", categories: ["edge_case", "logic_bug"], publishedAt: timestamp,
  code: {
    path: "challenge.js", before: "", after: lines.join("\n") + "\n",
    hunks: [{ oldStart: 0, oldCount: 0, newStart: 1, newCount: lines.length,
      lines: lines.map((text, index) => ({ kind: "added", text, oldLine: null, newLine: index + 1 })) }],
  },
};

const create = vi.fn<(init: RequestInit | undefined) => Promise<Response>>();
const signOut = vi.fn<() => Promise<void>>();
const noAttempt = async () => ({ status: "ok", submissionId: null }) as const;
const comment = "Multiply by one minus fraction.";
const temporaryText = "Unsaved editor text.";
const liveRegion = '[role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]';

const draftNotice = "Comments are saved only on this page until you submit. Reloading or leaving will discard them.";
const leaveNotice = "Your unsaved comments will be lost.";
const emptyWarning = "You haven't added any comments. Submit an empty review?";
const unknownMessage = "We couldn't confirm submission. Check submission again before changing your review.";
const submissionErrorMessages = {
  lifecycleUnavailable: "This challenge is no longer available for submission.",
  inProgress: "Submission is still being confirmed. Check again.",
  submissionUnavailable: "We couldn't submit your review. Try again.",
  accountServiceUnavailable: "We can't check your account right now. Try again.",
};
const frozenMessage = "This submission request couldn't be reused. Open Review history to check your attempts.";

function failure(status: number, code: string, message: string, fieldErrors?: Record<string, string[]>) {
  return Response.json({ error: { code, message, ...(fieldErrors && { fieldErrors }) } }, { status });
}

function success() {
  return Response.json({ data: {
    id: submissionId, challengeId, revisionId, learner: { id: account.id, displayName: account.displayName },
    attemptNumber: 1, previousSubmissionId: null, submittedAt: timestamp, challenge,
    comments: [{ id: commentId, ordinal: 0, line: 3, body: comment }],
    grading: { state: "pending", failureCode: null, original: null, effective: null, overrides: [] },
    flags: [],
  } }, { status: 201 });
}

async function openWorkspace() {
  const view = render(<WorkspaceAccessBoundary signOutAction={signOut}>
    <RoleNavigation account={account} signOutAction={signOut} />
    <main><WorkspaceRoute challengeId={challengeId} readFirstAttemptAction={noAttempt} /></main>
  </WorkspaceAccessBoundary>);
  await screen.findByRole("heading", { name: challenge.title });
  return view;
}

function click(name: string, scope: HTMLElement = document.body) {
  fireEvent.click(within(scope).getByRole("button", { name }));
}

function lineAction(line: number) {
  return screen.getByRole("button", { name: new RegExp(`add comment.*\\b${line}\\b`, "i") });
}

function openEditor(line = 3) {
  fireEvent.click(lineAction(line));
  return screen.getByRole<HTMLTextAreaElement>("textbox", { name: /comment/i });
}

function write(body: string, editor = screen.getByRole("textbox", { name: /comment/i })) {
  fireEvent.change(editor, { target: { value: body } });
}

function addComment(body = comment, line = 3) {
  write(body, openEditor(line));
  click("Add comment");
}

function confirmReview() {
  click("Submit review");
  const dialog = screen.getByRole("dialog", { name: "Submit review?" });
  click("Confirm submission", dialog);
}

function sentRequest(index = 0) {
  const request = create.mock.calls[index]?.[0];
  expect(request?.method).toBe("POST");
  expect(new Headers(request?.headers).get("idempotency-key")).toMatch(
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,
  );
  return { key: new Headers(request?.headers).get("idempotency-key"), body: JSON.parse(String(request?.body)) };
}

function expectLockedDraft(body = comment) {
  expect(screen.getByText(body)).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: /comment/i })).toBeNull();
  for (const control of screen.queryAllByRole<HTMLButtonElement>("button", { name: /^(add comment|edit|remove)\b/i })) {
    expect(control.disabled).toBe(true);
  }
}

function expectAnnouncement(message: string) {
  expect(screen.getByText(message).closest(liveRegion)).not.toBeNull();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (input === materialPath) return Promise.resolve(Response.json({ data: challenge }));
    if (input === materialPath + "/submissions") return create(init);
    return Promise.reject(new Error("Unexpected request: " + input));
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("LRN-03.1 LRN-03.2 LRN-03.5 SYS-17.1 drafts multiple comments per line and keeps addition order through edits and removals", async () => {
  await openWorkspace();
  for (const line of [1, 2, 3, 4, 10, 11]) expect(lineAction(line)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /add comment.*\b12\b/i })).toBeNull();

  const editor = openEditor(4);
  expect(document.activeElement).toBe(editor);
  expect(editor.required || editor.getAttribute("aria-required") === "true").toBe(true);
  write("Later line.", editor);
  click("Add comment");
  expect(document.activeElement).toBe(lineAction(4));

  addComment("Earlier comment.", 2);
  addComment("Second on line two.", 2);
  fireEvent.click(screen.getAllByRole("button", { name: /^edit\b/i })[0]!);
  expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: /comment/i }).value).toBe("Earlier comment.");
  for (const control of screen.getAllByRole<HTMLButtonElement>("button", { name: /^(add comment|edit|remove)\b/i })) {
    expect(control.disabled).toBe(true);
  }
  write(temporaryText);
  click("Cancel");
  expect(screen.getByText("Earlier comment.")).toBeTruthy();
  expect(screen.queryByDisplayValue(temporaryText)).toBeNull();

  fireEvent.click(screen.getAllByRole("button", { name: /^edit\b/i })[0]!);
  write("Edited earlier comment.");
  click("Save comment");
  const first = screen.getByText("Edited earlier comment.");
  const second = screen.getByText("Second on line two.");
  const third = screen.getByText("Later line.");
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(second.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  fireEvent.click(screen.getAllByRole("button", { name: /^remove\b/i })[0]!);
  expect(document.activeElement).toBe(lineAction(2));
  expect(screen.queryByText("Edited earlier comment.")).toBeNull();
  expect(screen.getByText("Second on line two.")).toBeTruthy();
  expect(screen.getByText("Later line.")).toBeTruthy();
  expect(create).not.toHaveBeenCalled();
});

it("LRN-03.3 SYS-02.2 validates trimmed Unicode text, retains invalid input and renders saved markup inertly", async () => {
  const view = await openWorkspace();
  const editor = openEditor();
  write("   \n ", editor);
  click("Add comment");
  expectAnnouncement("Enter a comment.");
  expect(editor.value).toBe("   \n ");
  const limit = "🚲".repeat(2000);
  write(limit + "x", editor);
  click("Add comment");
  expectAnnouncement("Comment is too long.");
  expect(editor.value).toBe(limit + "x");
  write("  " + limit + "  ", editor);
  click("Add comment");
  expect(screen.getByText(limit)).toBeTruthy();

  const markup = '<img src="https://example.test/review.png" onerror="alert(1)">';
  addComment("  " + markup + "  ");
  expect(screen.getByText(markup)).toBeTruthy();
  expect(view.container.querySelector("img")).toBeNull();
});

it("LRN-03.3 disables new comments at the count cap while existing comments can still be edited and removed", async () => {
  await openWorkspace();
  for (let index = 1; index <= 50; index++) addComment(`Review observation ${index}.`);
  expectAnnouncement("Comment limit reached. Remove a comment to add another.");
  expect((lineAction(3) as HTMLButtonElement).disabled).toBe(true);
  const edit = screen.getAllByRole<HTMLButtonElement>("button", { name: /^edit\b/i })[0]!;
  expect(edit.disabled).toBe(false);
  fireEvent.click(edit);
  write("Revised observation.");
  click("Save comment");
  expect(screen.getByText("Revised observation.")).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: /^remove\b/i })[0]!);
  expect((lineAction(3) as HTMLButtonElement).disabled).toBe(false);
});

it("LRN-03.4 ACC-02.5 retains open editor text and saved drafts on Keep reviewing, then permits the requested sign-out", async () => {
  const view = await openWorkspace();
  expect(screen.getByText(draftNotice)).toBeTruthy();
  addComment();
  const editor = openEditor(2);
  write(temporaryText, editor);
  click("Sign out");
  const dialog = screen.getByRole("dialog", { name: "Leave this review?" });
  expect(within(dialog).getByText(leaveNotice)).toBeTruthy();
  expect(signOut).not.toHaveBeenCalled();
  click("Keep reviewing", dialog);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(editor.value).toBe(temporaryText);
  expect(screen.getByText(comment)).toBeTruthy();

  click("Sign out");
  click("Leave review", screen.getByRole("dialog", { name: "Leave this review?" }));
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  view.unmount();
  await openWorkspace();
  expect(screen.queryByText(comment)).toBeNull();
  expect(screen.queryByDisplayValue(temporaryText)).toBeNull();
  expect(create).not.toHaveBeenCalled();
});

it("LRN-03.4 prompts when unsaved editor text is the only draft work", async () => {
  await openWorkspace();
  write(temporaryText, openEditor());
  click("Sign out");
  click("Keep reviewing", screen.getByRole("dialog", { name: "Leave this review?" }));
  expect(screen.getByDisplayValue(temporaryText)).toBeTruthy();
  expect(signOut).not.toHaveBeenCalled();
});

it("LRN-03.6 focuses an unfinished editor instead of opening review confirmation", async () => {
  await openWorkspace();
  const editor = openEditor();
  write(temporaryText, editor);
  click("Submit review");
  expectAnnouncement("Add or save your comment, or cancel editing, before submitting.");
  expect(document.activeElement).toBe(editor);
  expect(screen.queryByRole("dialog", { name: "Submit review?" })).toBeNull();
  expect(create).not.toHaveBeenCalled();
});

it("LRN-04.1 SYS-17.1 shows the empty warning and lets the Learner cancel confirmation with the draft intact", async () => {
  await openWorkspace();
  click("Submit review");
  const empty = screen.getByRole("dialog", { name: "Submit review?" });
  expect(within(empty).getByText(emptyWarning)).toBeTruthy();
  expect(within(empty).getByText("Submitted comments cannot be changed.")).toBeTruthy();
  expect(empty === document.activeElement || empty.contains(document.activeElement)).toBe(true);
  click("Keep reviewing", empty);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Submit review" }));

  addComment();
  click("Submit review");
  const nonempty = screen.getByRole("dialog", { name: "Submit review?" });
  expect(nonempty.textContent).toMatch(/\b1\s+comment\b/i);
  expect(within(nonempty).queryByText(emptyWarning)).toBeNull();
  click("Keep reviewing", nonempty);
  expect(screen.getByText(comment)).toBeTruthy();
  expect(create).not.toHaveBeenCalled();
});

it("LRN-04.2 LRN-03.5 locks a pending confirmation and submits only the pinned revision and ordered comments", async () => {
  create.mockReturnValue(new Promise(() => {}));
  await openWorkspace();
  addComment(comment, 3);
  addComment("Check line two.", 2);
  addComment("Second on line three.", 3);
  confirmReview();
  expectAnnouncement("Submitting review…");
  expectLockedDraft();
  const dialog = screen.getByRole("dialog", { name: "Submit review?" });
  const keepReviewing = within(dialog).getByRole<HTMLButtonElement>("button", { name: "Keep reviewing" });
  expect(keepReviewing.disabled).toBe(true);
  const pendingButton = within(dialog).queryByRole<HTMLButtonElement>("button", { name: /confirm submission|submitting review/i });
  if (pendingButton) {
    expect(pendingButton.disabled).toBe(true);
    fireEvent.click(pendingButton);
  }
  expect(create).toHaveBeenCalledTimes(1);
  expect(sentRequest().body).toEqual({ revisionId, comments: [
    { line: 2, body: "Check line two." }, { line: 3, body: comment }, { line: 3, body: "Second on line three." },
  ] });
});

it("LRN-04.4 LRN-04.3 freezes an uncertain snapshot, replays the same key and body and opens the result without a guard", async () => {
  let finishCheck!: (response: Response) => void;
  create.mockRejectedValueOnce(new TypeError("Connection lost"))
    .mockReturnValueOnce(new Promise<Response>(resolve => { finishCheck = resolve; }))
    .mockImplementationOnce(async () => success());
  await openWorkspace();
  addComment();
  confirmReview();
  await screen.findByText(unknownMessage);
  expectAnnouncement(unknownMessage);
  expectLockedDraft();
  expect(within(screen.getByRole("main")).getByRole("link", { name: "Review history" }).getAttribute("href")).toBe("/learner/history");

  click("Check submission");
  expectAnnouncement("Checking submission…");
  expectLockedDraft();
  await act(async () => {
    finishCheck(failure(409, "INVALID_STATE", submissionErrorMessages.inProgress));
  });
  expectAnnouncement("Submission is still being confirmed. Check again.");
  click("Check submission");
  await waitFor(() => expect([...router.push.mock.calls, ...router.replace.mock.calls].some(([path]) => path === resultPath)).toBe(true));

  expect(create).toHaveBeenCalledTimes(3);
  expect(sentRequest(1)).toEqual(sentRequest());
  expect(sentRequest(2)).toEqual(sentRequest());
  expect(screen.queryByRole("dialog", { name: "Leave this review?" })).toBeNull();
  expect(screen.queryByRole("textbox", { name: /comment/i })).toBeNull();
});

it.each([
  ["VERSION_CONFLICT", "This challenge changed since you opened it. Your review has not been submitted.", "Back to challenges"],
  ["INVALID_STATE", "This challenge is no longer available for submission.", "Back to challenges"],
  ["ATTEMPT_LIMIT", "You can't submit another attempt for this challenge.", "Review history"],
])("LRN-04.5 keeps an editable draft and disables submission for %s", async (code, message, recovery) => {
  create.mockImplementationOnce(async () =>
    failure(409, code, code === "INVALID_STATE" ? submissionErrorMessages.lifecycleUnavailable : message),
  );
  await openWorkspace();
  addComment();
  confirmReview();
  await screen.findByText(message);
  expectAnnouncement(message);
  expect(screen.queryByRole("dialog", { name: "Submit review?" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Access denied" })).toBeNull();
  expect(screen.getByRole("region", { name: "Source" }).textContent).toContain(lines[2]!.trim());
  expect(screen.getByText(comment)).toBeTruthy();
  expect(within(screen.getByRole("main")).getAllByRole("link", { name: recovery }).length).toBeGreaterThan(0);
  expect(screen.queryByRole<HTMLButtonElement>("button", { name: "Submit review" })?.disabled ?? true).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /^edit\b/i }));
  expect(screen.getByDisplayValue(comment)).toBeTruthy();
});

it.each([
  [413, "PAYLOAD_TOO_LARGE", "This review is too large to submit. Shorten or remove comments and try again."],
  [503, "SERVICE_UNAVAILABLE", "We couldn't submit your review. Try again."],
  [429, "RATE_LIMITED", "Too many requests. Try again later."],
] as const)("LRN-04.5 LRN-04.6 restores the editable draft after %s %s and uses a fresh key on explicit retry", async (status, code, message) => {
  create.mockImplementationOnce(async () =>
    failure(status, code, code === "SERVICE_UNAVAILABLE" ? submissionErrorMessages.submissionUnavailable : message),
  ).mockReturnValueOnce(new Promise(() => {}));
  await openWorkspace();
  addComment();
  confirmReview();
  await screen.findByText(message);
  expectAnnouncement(message);
  expect(screen.queryByRole("dialog", { name: "Submit review?" })).toBeNull();
  expect(screen.getByText(comment)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^edit\b/i }));
  expect(screen.getByDisplayValue(comment)).toBeTruthy();
  click("Cancel");
  confirmReview();
  expect(sentRequest(1).body).toEqual(sentRequest().body);
  expect(sentRequest(1).key).not.toBe(sentRequest().key);
});

it("LRN-04.5 applies field validation while retaining the rejected comment text", async () => {
  create.mockImplementationOnce(async () =>
    failure(400, "VALIDATION_ERROR", "The review request is invalid.", { "comments.0.body": ["Comment is too long."] }),
  );
  await openWorkspace();
  addComment();
  confirmReview();
  await screen.findByText("Comment is too long.");
  expect(screen.queryByRole("dialog", { name: "Submit review?" })).toBeNull();
  expect(screen.queryByText(comment) ?? screen.getByDisplayValue(comment)).toBeTruthy();
  expect((lineAction(2) as HTMLButtonElement).disabled).toBe(false);
});

it("LRN-04.6 leaves an idempotency conflict read-only and offers history without retrying", async () => {
  create.mockImplementationOnce(async () => failure(409, "IDEMPOTENCY_CONFLICT", frozenMessage));
  await openWorkspace();
  addComment();
  confirmReview();
  await screen.findByText(frozenMessage);
  expectAnnouncement(frozenMessage);
  expectLockedDraft();
  expect(within(screen.getByRole("main")).getByRole("link", { name: "Review history" }).getAttribute("href")).toBe("/learner/history");
  expect(screen.queryByRole("button", { name: "Check submission" })).toBeNull();
  expect(create).toHaveBeenCalledTimes(1);
});

it("LRN-04.6 ACC-03.7 distinguishes account service outage from definitive submission failure", async () => {
  create.mockImplementationOnce(async () =>
    failure(503, "SERVICE_UNAVAILABLE", submissionErrorMessages.accountServiceUnavailable),
  );
  await openWorkspace();
  addComment();
  confirmReview();
  await screen.findByRole("heading", { name: "Service unavailable" });
  expect(screen.getByText("We can't check your account right now. Try again.")).toBeTruthy();
  expect(screen.queryByText(comment)).toBeNull();
  expect(screen.queryByRole("navigation")).toBeNull();
});

it("LRN-04.6 LRN-03.4 ACC-03.4 discards protected draft on unrefreshable session expiry without the leave dialog", async () => {
  create.mockImplementationOnce(async () => failure(401, "UNAUTHENTICATED", "Sign in to continue."));
  await openWorkspace();
  addComment();
  confirmReview();
  await waitFor(() => expect(screen.queryByRole("region", { name: "Source" })).toBeNull());
  expect(screen.queryByText(comment)).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Leave this review?" })).toBeNull();
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(create).toHaveBeenCalledTimes(1);
});

it.each([
  [409, "INVALID_STATE", submissionErrorMessages.lifecycleUnavailable + " Extra diagnostic."],
  [503, "SERVICE_UNAVAILABLE", submissionErrorMessages.accountServiceUnavailable + " Extra diagnostic."],
] as const)("LRN-04.4 LRN-04.5 LRN-04.6 does not classify free-form text as an exact %s %s outcome", async (status, code, message) => {
  create.mockImplementationOnce(async () => failure(status, code, message));
  await openWorkspace();
  addComment();
  confirmReview();
  await screen.findByText(unknownMessage);
  expectLockedDraft();
  expect(screen.getByRole("button", { name: "Check submission" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Service unavailable" })).toBeNull();
});

it("LRN-04.3 LRN-04.4 keeps the outcome unknown when a 201 response lacks the required submission projection", async () => {
  create.mockImplementationOnce(async () => Response.json({ data: { id: submissionId } }, { status: 201 }));
  await openWorkspace();
  addComment();
  confirmReview();
  await screen.findByText(unknownMessage);
  expectLockedDraft();
  expect(router.push).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});
