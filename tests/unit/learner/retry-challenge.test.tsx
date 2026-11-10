/// <reference types="vite/client" />

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderToReadableStream } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { GradingResult } from "@/components/learner/grading-result";
import { ReviewDraft } from "@/components/learner/review-draft";
import { WorkspaceNavigationProvider } from "@/components/account/workspace-navigation";
import { submissionErrorMessages, type SubmissionView } from "@/lib/learner/submissions";
import { uid } from "../server/llm/fixtures";
import { challengeId, completed, failed, learnerId, pending, revisionId, running, submission, submissionId } from "./grading-fixture";

const retryServer = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/learner/history/${submissionId}/retry`,
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/server/auth/account", () => ({
  getAccount: async () => ({ status: "ok", account: { id: learnerId, displayName: "Learner A", role: "learner" } }),
}));
vi.mock("@/server/auth/actions", () => ({ signOutAction: async () => {} }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ rpc: retryServer.rpc }) }));

const retryPages = import.meta.glob<{ default: ComponentType<{ params: Promise<{ id: string }> }> }>(
  "/src/app/learner/history/*/retry/page.tsx",
);

const secondId = uid(502);
const resultHref = `/learner/history/${submissionId}`;
const retryHref = `${resultHref}/retry`;
const nextResult = `/learner/history/${secondId}`;
const resultEndpoint = `/api/v1/submissions/${submissionId}`;
const createEndpoint = `/api/v1/challenges/${challengeId}/submissions`;
const pendingReason = "Retry is available after your first assessment completes.";
const usedReason = "You have used your retry.";
const unpublishedReason = "Retry is unavailable while this challenge is not published.";
const originalComments = [
  { id: uid(601), ordinal: 0, line: 3, body: "First copied note." },
  { id: uid(602), ordinal: 1, line: 3, body: "Second copied note." },
  { id: uid(603), ordinal: 2, line: 5, body: "Later line copied note." },
];
const passed = {
  ...completed, original: { ...completed.original, score: 80, passed: true },
  effective: { score: 80, passed: true, source: "ai" },
};

function view(grading: unknown) {
  return { ...submission, grading } as SubmissionView;
}

function requestSpy() {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function renderResult(grading: unknown, published: boolean, secondSubmissionId: string | null) {
  const props = { submissionId, initialSubmission: view(grading), published, secondSubmissionId };
  return render(<GradingResult {...props} />);
}

function renderDraft(initialComments = originalComments) {
  const openSubmission = vi.fn<(href: string) => void>();
  const props = { accountId: learnerId, challenge: view(pending).challenge, openSubmission,
    previousSubmissionId: submissionId, initialComments };
  const rendered = render(<WorkspaceNavigationProvider><ReviewDraft {...props} /></WorkspaceNavigationProvider>);
  return { ...rendered, openSubmission };
}

const text = (value: string) => screen.getByText(value, { exact: true });
const button = (name: string | RegExp) => screen.getByRole<HTMLButtonElement>("button", { name });

function confirm() {
  fireEvent.click(button("Submit review"));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Submit review?" })).getByRole("button", { name: "Confirm submission" }));
}

function editFirstCopy(body: string) {
  fireEvent.click(screen.getAllByRole("button", { name: "Edit comment on line 3" })[0]);
  const editor = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Comment on line 3" });
  expect(editor.value).toBe(originalComments[0].body);
  fireEvent.change(editor, { target: { value: body } });
  fireEvent.click(button("Save comment"));
}

function addSameLine(body: string) {
  fireEvent.click(button("Add comment on line 3"));
  fireEvent.change(screen.getByRole("textbox", { name: "Comment on line 3" }), { target: { value: body } });
  fireEvent.click(button("Add comment"));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([
  { label: "a pending original precedes existing attempt and publication", grading: pending, published: false, second: secondId, reason: pendingReason },
  { label: "a failed original remains ineligible", grading: failed("AI_UNAVAILABLE"), published: true, second: null, reason: pendingReason },
  { label: "an override does not replace an original", grading: { ...pending, overrides: [{ id: uid(802), score: 100 }] },
    published: true, second: null, reason: pendingReason },
  { label: "the used retry precedes publication", grading: completed, published: false, second: secondId, reason: usedReason },
  { label: "an unpublished challenge is ineligible", grading: completed, published: false, second: null, reason: unpublishedReason },
])("LRN-06.5 orders Next actions reasons so $label", ({ grading, published, second, reason }) => {
  requestSpy().mockImplementation(() => new Promise<Response>(() => {}));
  renderResult(grading, published, second);
  expect(text(reason)).toBeDefined();
  expect(screen.queryByRole("link", { name: "Retry challenge" })).toBeNull();
  expect(screen.getByRole("link", { name: "Browse challenges" }).getAttribute("href")).toBe("/learner/challenges");
});

it("LRN-06.5 offers Retry challenge after a passing original for a published challenge with no retry", () => {
  renderResult(passed, true, null);
  expect(screen.getByRole("link", { name: "Retry challenge" }).getAttribute("href")).toBe(retryHref);
});

it("LRN-06.5 shows Retry challenge without reloading when grading completes while the result is open", async () => {
  const fetch = requestSpy();
  const status = Promise.withResolvers<Response>();
  fetch.mockReturnValue(status.promise);
  renderResult(running, true, null);
  expect(text(pendingReason)).toBeDefined();
  expect(screen.queryByRole("link", { name: "Retry challenge" })).toBeNull();
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(resultEndpoint, expect.objectContaining({ cache: "no-store" })),
    { timeout: 2000 });
  status.resolve(Response.json({ data: view(completed) }));
  const retry = await screen.findByRole("link", { name: "Retry challenge" });
  expect(retry.getAttribute("href")).toBe(retryHref);
  expect(screen.queryByText(pendingReason, { exact: true })).toBeNull();
  expect(fetch.mock.calls.map(([url, options]) => [url, options?.method ?? "GET"])).toEqual([[resultEndpoint, "GET"]]);
});

it("LRN-06.6 preserves independently editable copied comments and line and addition order in the frozen request and replay", async () => {
  const fetch = requestSpy();
  fetch.mockRejectedValueOnce(new TypeError("Connection interrupted"));
  const { openSubmission } = renderDraft();
  expect(text("return price * fraction;")).toBeDefined();
  editFirstCopy("Edited first copy.");
  addSameLine("New same-line note.");
  const ordered = [
    { line: 3, body: "Edited first copy." }, { line: 3, body: "Second copied note." },
    { line: 3, body: "New same-line note." }, { line: 5, body: "Later line copied note." },
  ];
  confirm();
  await screen.findByText("We couldn't confirm submission. Check submission again before changing your review.", { exact: true });
  for (const control of screen.getAllByRole<HTMLButtonElement>("button", { name: /^(Add comment|Edit comment|Remove comment)/ })) {
    expect(control.disabled).toBe(true);
  }
  expect(openSubmission).not.toHaveBeenCalled();

  fetch.mockResolvedValueOnce(Response.json({ data: {
    ...view(pending), id: secondId, attemptNumber: 2, previousSubmissionId: submissionId,
    comments: ordered.map((comment, ordinal) => ({ ...comment, id: uid(650 + ordinal), ordinal })),
  } }, { status: 201 }));
  fireEvent.click(button("Check submission"));
  await waitFor(() => expect(openSubmission).toHaveBeenCalledWith(nextResult));
  expect(fetch.mock.calls).toHaveLength(2);
  const requests = fetch.mock.calls.map(([url, options]) => ({
    url, method: options?.method, key: new Headers(options?.headers).get("Idempotency-Key"),
    account: new Headers(options?.headers).get("X-LGTM-Workspace-Account-Id"), body: options?.body,
  }));
  expect(requests[0]).toEqual({
    url: createEndpoint, method: "POST", key: expect.stringMatching(/^[\da-f-]{36}$/i), account: learnerId,
    body: expect.any(String),
  });
  expect(JSON.parse(String(requests[0].body))).toEqual({ revisionId, previousSubmissionId: submissionId, comments: ordered });
  expect(requests[1]).toEqual(requests[0]);
  expect(originalComments.map(({ body }) => body)).toEqual(["First copied note.", "Second copied note.", "Later line copied note."]);
});

it("LRN-06.6 discards in-memory edits on remount and uses zero-comment confirmation when copies are removed", () => {
  const fetch = requestSpy();
  const first = renderDraft();
  editFirstCopy("Temporary copy.");
  expect(text("Temporary copy.")).toBeDefined();
  first.unmount();

  renderDraft();
  expect(screen.queryByText("Temporary copy.")).toBeNull();
  expect(text(originalComments[0].body)).toBeDefined();
  for (const { line } of originalComments) {
    fireEvent.click(screen.getAllByRole("button", { name: `Remove comment on line ${line}` })[0]);
  }
  fireEvent.click(button("Submit review"));
  const dialog = within(screen.getByRole("dialog", { name: "Submit review?" }));
  expect(dialog.getByText("You haven't added any comments. Submit an empty review?", { exact: true })).toBeDefined();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  ["INVALID_STATE", submissionErrorMessages.lifecycleUnavailable, "Back to challenges"],
  ["ATTEMPT_LIMIT", "You can't submit another attempt for this challenge.", "Review history"],
])("LRN-06.7 preserves the editable pinned draft after %s eligibility loss", async (code, message, recovery) => {
  const fetch = requestSpy();
  fetch.mockResolvedValueOnce(Response.json({ error: { code, message } }, { status: 409 }));
  const { openSubmission } = renderDraft();
  editFirstCopy("Keep my revised comment.");
  confirm();
  expect(await screen.findByText(message, { exact: true })).toBeDefined();
  expect(text("Keep my revised comment.")).toBeDefined();
  expect(text(originalComments[1].body)).toBeDefined();
  expect(text("return price * fraction;")).toBeDefined();
  expect(screen.getAllByRole<HTMLButtonElement>("button", { name: "Edit comment on line 3" })[0].disabled).toBe(false);
  expect(button("Submit review").disabled).toBe(true);
  expect(screen.getByRole("link", { name: recovery })).toBeDefined();
  expect(openSubmission).not.toHaveBeenCalled();
});

it("LRN-06.7 SYS-09 shows Loading retry while the direct page waits for its authorized source", async () => {
  const path = "/src/app/learner/history/[id]/retry/page.tsx";
  const load = retryPages[path];
  if (!load) throw new Error(`Missing T-13 retry page: ${path}`);
  const { default: RetryPage } = await load();
  const source = Promise.withResolvers<{ data: { status: "not_found" }; error: null }>();
  retryServer.rpc.mockImplementation(name => {
    if (name === "read_learner_submission") return source.promise;
    if (name === "read_learner_retry_eligibility") return { data: { status: "not_found" }, error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
  const stream = await renderToReadableStream(<RetryPage params={Promise.resolve({ id: submissionId })} />);
  const reader = stream.getReader();
  try {
    const shell = await reader.read();
    expect(new TextDecoder().decode(shell.value)).toContain("Loading retry…");
  } finally {
    source.resolve({ data: { status: "not_found" }, error: null });
  }
  const decoder = new TextDecoder();
  let response = "";
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    response += decoder.decode(chunk.value, { stream: true });
  }
  expect(response + decoder.decode()).toContain("Review not found");
});
