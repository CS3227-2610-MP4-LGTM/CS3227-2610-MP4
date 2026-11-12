import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GradingResult } from "@/components/learner/grading-result";
import { workspaceAccountHeader, type SubmissionView } from "@/lib/learner/submissions";
import { accountAccessHeader } from "@/lib/learner/challenges";
import { failed, pending, running, submission } from "./grading-fixture";
import {
  completedView, errorBody, json, learnerId, markupReason, reportCopy as copy, reportEndpoint, reportFlag, reportReason,
  resolvedReport, resultEndpoint, secondAttemptView, submissionId, unmatchedId,
} from "./report-fixture";

const [matchedComment, duplicateComment, unmatchedComment] = submission.comments;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function show(view: SubmissionView = completedView()) {
  return render(<GradingResult submissionId={view.id} initialSubmission={view} published secondSubmissionId={null} />);
}
function section(name: string) {
  const parent = screen.getByRole("heading", { name }).closest("section");
  expect(parent, `${name} must have a distinct section`).not.toBeNull();
  return parent as HTMLElement;
}
function commentItem(body: string) {
  const item = within(section("Earned credit")).getByText(body, { exact: true }).closest("li");
  expect(item, "each submitted comment must be a list item").not.toBeNull();
  return item as HTMLElement;
}
const reportButtons = () => screen.queryAllByRole("button", { name: copy.action });
const reason = () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Reason" });
const editable = (field: HTMLTextAreaElement | HTMLInputElement) => !field.disabled && !field.readOnly;
const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
const reads = () => fetchMock.mock.calls.filter(([url, init]) => String(url) === resultEndpoint && (init as RequestInit | undefined)?.method !== "POST");
function announced(text: string) {
  const element = screen.getByText(text, { exact: true });
  expect(element.closest('[role="status"], [role="alert"], [aria-live]'), `${text} must be announced`).not.toBeNull();
  return element;
}
function deferred() {
  let resolve!: (response: Response) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Response>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function openForm() {
  fireEvent.click(within(commentItem(unmatchedComment.body)).getByRole("button", { name: copy.action }));
  return reason();
}
function enter(text: string) {
  fireEvent.change(reason(), { target: { value: text } });
}
async function send(text = reportReason) {
  openForm();
  enter(text);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: copy.send })); });
}
function stableSections() {
  return ["Current grade", "Original assessment", "Override history", "Missed criteria", "Next actions"]
    .map(name => section(name).textContent)
    .concat([commentItem(matchedComment.body).textContent, commentItem(duplicateComment.body).textContent]);
}
function postedRequest(index = 0) {
  const [url, init] = posts()[index] as [string, RequestInit];
  return { url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) as unknown };
}

it("LRN-07.1 offers the action only on an unreported unmatched comment of completed grading", () => {
  show();
  expect(reportButtons()).toHaveLength(1);
  expect(within(commentItem(unmatchedComment.body)).getByRole("button", { name: copy.action })).toBeTruthy();
  for (const body of [matchedComment.body, duplicateComment.body]) {
    expect(within(commentItem(body)).queryByRole("button", { name: copy.action })).toBeNull();
    expect(within(commentItem(body)).queryByText(copy.reported, { exact: true })).toBeNull();
  }
  expect(screen.queryByRole("textbox")).toBeNull();
});

it.each([pending, running, failed("AI_UNAVAILABLE")])("LRN-07.1 offers no report action for $state grading", grading => {
  show({ ...completedView(), grading } as SubmissionView);
  expect(reportButtons()).toHaveLength(0);
});

it.each([["open", reportFlag()], ["resolved", resolvedReport()]] as const)(
  "LRN-07.5 LRN-07.6 shows a stored %s learner_report as Reported with no second, edit or withdraw action", (_label, flag) => {
    show(completedView([flag]));
    const item = commentItem(unmatchedComment.body);
    expect(within(item).getByText(copy.reported, { exact: true })).toBeTruthy();
    expect(reportButtons()).toHaveLength(0);
    expect(within(item).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("button", { name: /edit report|withdraw|report again/i })).toBeNull();
  });

it("LRN-07.1 applies eligibility independently to the second attempt", () => {
  show(secondAttemptView());
  expect(reportButtons()).toHaveLength(1);
  cleanup();
  show(secondAttemptView([reportFlag()]));
  expect(reportButtons()).toHaveLength(0);
  expect(within(commentItem(unmatchedComment.body)).getByText(copy.reported, { exact: true })).toBeTruthy();
});

it("LRN-07.2 opens the form with read-only evidence, required Reason and no owner, kind or grade controls", () => {
  show();
  const field = openForm();
  expect(document.activeElement).toBe(field);
  expect(field.required || field.getAttribute("aria-required") === "true").toBe(true);
  expect(screen.getByRole("heading", { name: copy.action })).toBeTruthy();
  const form = field.closest("form, [role='dialog'], section") as HTMLElement;
  expect(form).not.toBeNull();
  expect(within(form).getByText(copy.instructions, { exact: true })).toBeTruthy();
  expect(within(form).getByText(unmatchedComment.body, { exact: true })).toBeTruthy();
  expect(form.textContent).toMatch(/Line\s*6/);
  expect(form.textContent).toMatch(/2,?000/);
  expect(within(form).getAllByRole("textbox")).toEqual([field]);
  expect(within(form).queryAllByRole("combobox")).toHaveLength(0);
  expect(within(form).queryAllByRole("radio")).toHaveLength(0);
  expect(within(form).queryAllByRole("checkbox")).toHaveLength(0);
  expect(within(form).queryAllByRole("spinbutton")).toHaveLength(0);
  expect(within(form).getByRole("button", { name: copy.send })).toBeTruthy();
  expect(within(form).getByRole("button", { name: copy.cancel })).toBeTruthy();
  expect(form.querySelector("img, script")).toBeNull();
});

it.each([
  ["an empty", "", copy.blank],
  ["a whitespace-only", " \n\t ", copy.blank],
  ["a 2001-code-point", "🚲".repeat(2001), copy.tooLong],
])("LRN-07.3 rejects %s reason locally, keeps the text, focuses Reason and sends nothing", async (_label, text, message) => {
  show();
  openForm();
  enter(text);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: copy.send })); });
  expect(screen.getByText(message, { exact: true })).toBeTruthy();
  const field = reason();
  expect(field.value).toBe(text);
  expect(document.activeElement).toBe(field);
  expect(field.getAttribute("aria-invalid")).toBe("true");
  const described = (field.getAttribute("aria-describedby") ?? "").split(/\s+/).map(id => document.getElementById(id)?.textContent ?? "");
  expect(described.join(" ")).toContain(message);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("LRN-07.3 Cancel closes the form without a report and returns focus to the comment's action", () => {
  show();
  openForm();
  enter(reportReason);
  fireEvent.click(screen.getByRole("button", { name: copy.cancel }));
  expect(screen.queryByRole("textbox", { name: "Reason" })).toBeNull();
  const action = within(commentItem(unmatchedComment.body)).getByRole("button", { name: copy.action });
  expect(document.activeElement).toBe(action);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("LRN-07.4 sends one pending request, then shows Reported, the returned flag and an unchanged grade", async () => {
  show();
  const before = stableSections();
  const response = deferred();
  fetchMock.mockReturnValueOnce(response.promise);
  await send(`  ${reportReason}  `);
  const sending = screen.getByRole<HTMLButtonElement>("button", { name: copy.sending });
  expect(sending.disabled).toBe(true);
  expect(editable(reason())).toBe(false);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: copy.cancel }).disabled).toBe(true);
  await act(async () => { fireEvent.click(sending); });
  expect(posts()).toHaveLength(1);
  const request = postedRequest();
  expect(request.url).toBe(reportEndpoint);
  expect(request.headers.get("Idempotency-Key")).toMatch(uuid);
  expect(request.headers.get(workspaceAccountHeader)?.toLowerCase()).toBe(learnerId);
  expect(request.headers.get("Content-Type")).toMatch(/application\/json/);
  expect(request.body).toEqual({ commentId: unmatchedId, reason: reportReason });
  await act(async () => { response.resolve(json(201, { data: reportFlag() })); });
  announced(copy.sent);
  expect(screen.queryByRole("textbox", { name: "Reason" })).toBeNull();
  const reported = within(commentItem(unmatchedComment.body)).getByText(copy.reported, { exact: true });
  expect(document.activeElement?.textContent).toBe(copy.reported);
  expect(reported.contains(document.activeElement) || document.activeElement?.contains(reported)).toBe(true);
  expect(reportButtons()).toHaveLength(0);
  const flags = within(section("Moderation flags"));
  expect(flags.getByText("Learner reported an unmatched comment", { exact: true })).toBeTruthy();
  expect(flags.getByText(reportReason, { exact: true })).toBeTruthy();
  expect(stableSections()).toEqual(before);
  expect(reads()).toHaveLength(0);
});

it("SYS-02.2 LRN-07.4 renders a returned markup reason as inert text", async () => {
  show();
  fetchMock.mockResolvedValueOnce(json(201, { data: reportFlag({ reason: markupReason }) }));
  await send(markupReason);
  expect(within(section("Moderation flags")).getByText(markupReason, { exact: true })).toBeTruthy();
  expect(document.body.querySelector("img, script")).toBeNull();
});

it("LRN-07.5 shows a duplicate rejection and refreshes the result to the existing report", async () => {
  show();
  fetchMock.mockResolvedValueOnce(json(409, errorBody("INVALID_STATE", copy.duplicate)))
    .mockResolvedValueOnce(json(200, { data: completedView([reportFlag()]) }));
  await send();
  await waitFor(() => expect(within(commentItem(unmatchedComment.body)).getByText(copy.reported, { exact: true })).toBeTruthy());
  announced(copy.duplicate);
  expect(reads()).toHaveLength(1);
  expect(posts()).toHaveLength(1);
  expect(within(section("Moderation flags")).getByText(reportReason, { exact: true })).toBeTruthy();
  expect(reportButtons()).toHaveLength(0);
});

it.each([
  ["a transport failure", () => Promise.reject(new TypeError("Failed to fetch"))],
  ["an uncertain 503", () => Promise.resolve(json(503, errorBody("SERVICE_UNAVAILABLE", copy.uncertain)))],
  ["a malformed acknowledgement", () => Promise.resolve(json(201, { data: { ...reportFlag(), commentId: learnerId } }))],
])("LRN-07.6 treats %s as unknown and replays the same key and payload through Check report", async (_label, outcome) => {
  show();
  fetchMock.mockImplementationOnce(outcome);
  await send();
  announced(copy.uncertain);
  expect(screen.queryByRole("button", { name: copy.send })).toBeNull();
  const kept = screen.queryByRole<HTMLTextAreaElement>("textbox", { name: "Reason" });
  if (kept) { expect(kept.value).toBe(reportReason); expect(editable(kept)).toBe(false); }
  else expect(screen.getAllByText(reportReason, { exact: true }).length).toBeGreaterThan(0);
  expect(screen.getAllByText(unmatchedComment.body, { exact: true }).length).toBeGreaterThan(0);
  const replay = deferred();
  fetchMock.mockReturnValueOnce(replay.promise);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: copy.check })); });
  expect(screen.getByText(copy.checking, { exact: true })).toBeTruthy();
  expect(posts()).toHaveLength(2);
  const [first, second] = [postedRequest(0), postedRequest(1)];
  expect(second.headers.get("Idempotency-Key")).toBe(first.headers.get("Idempotency-Key"));
  expect(second.body).toEqual(first.body);
  await act(async () => { replay.resolve(json(201, { data: reportFlag() })); });
  announced(copy.sent);
  expect(within(commentItem(unmatchedComment.body)).getByText(copy.reported, { exact: true })).toBeTruthy();
});

it("LRN-07.6 keeps an in-progress replay checkable with the same key, then restores the form after a definitive failure", async () => {
  show();
  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(json(409, errorBody("INVALID_STATE", copy.inProgress)))
    .mockResolvedValueOnce(json(503, errorBody("SERVICE_UNAVAILABLE", copy.failed)));
  await send();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: copy.check })); });
  announced(copy.inProgress);
  expect(screen.queryByRole("button", { name: copy.send })).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: copy.check })); });
  expect(posts()).toHaveLength(3);
  expect(new Set(posts().map((_, index) => postedRequest(index).headers.get("Idempotency-Key"))).size).toBe(1);
  announced(copy.failed);
  expect(reason().value).toBe(reportReason);
  expect(editable(reason())).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: copy.send }).disabled).toBe(false);
});

it.each([
  ["definitive service failure", json(503, errorBody("SERVICE_UNAVAILABLE", copy.failed)), copy.failed],
  ["throttling", json(429, errorBody("RATE_LIMITED", copy.throttled)), copy.throttled],
])("LRN-07.7 keeps the reason editable after %s and uses a new key for the next explicit send", async (_label, response, message) => {
  show();
  fetchMock.mockResolvedValueOnce(response);
  await send();
  announced(message);
  expect(reason().value).toBe(reportReason);
  expect(editable(reason())).toBe(true);
  const sendButton = screen.getByRole<HTMLButtonElement>("button", { name: copy.send });
  expect(sendButton.disabled).toBe(false);
  expect(screen.queryByRole("button", { name: copy.check })).toBeNull();
  expect(posts()).toHaveLength(1);
  fetchMock.mockResolvedValueOnce(json(201, { data: reportFlag() }));
  await act(async () => { fireEvent.click(sendButton); });
  expect(posts()).toHaveLength(2);
  expect(postedRequest(1).headers.get("Idempotency-Key")).not.toBe(postedRequest(0).headers.get("Idempotency-Key"));
  announced(copy.sent);
});

it.each([
  ["ineligible", json(409, errorBody("INVALID_STATE", copy.unavailable))],
  ["not found", json(404, errorBody("NOT_FOUND", "We couldn't find this comment."))],
])("LRN-07.7 shows an %s comment as unavailable and Back to result reloads without reporting", async (_label, response) => {
  show();
  fetchMock.mockResolvedValueOnce(response);
  await send();
  announced(copy.unavailable);
  expect(screen.queryByRole("button", { name: copy.send })).toBeNull();
  fetchMock.mockResolvedValueOnce(json(200, { data: completedView() }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: copy.back })); });
  expect(reads()).toHaveLength(1);
  expect(posts()).toHaveLength(1);
  expect(screen.queryByText(copy.unavailable, { exact: true })).toBeNull();
});

it("LRN-07.7 offers Refresh result after an idempotency conflict instead of sending again", async () => {
  show();
  fetchMock.mockResolvedValueOnce(json(409, errorBody("IDEMPOTENCY_CONFLICT", "This request key was already used.")));
  await send();
  announced(copy.conflict);
  expect(screen.queryByRole("button", { name: copy.send })).toBeNull();
  expect(screen.queryByRole("button", { name: copy.check })).toBeNull();
  fetchMock.mockResolvedValueOnce(json(200, { data: completedView([reportFlag()]) }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: copy.refresh })); });
  expect(reads()).toHaveLength(1);
  expect(posts()).toHaveLength(1);
  await waitFor(() => expect(within(commentItem(unmatchedComment.body)).getByText(copy.reported, { exact: true })).toBeTruthy());
});

it.each([
  ["401", json(401, errorBody("UNAUTHENTICATED", "Sign in to continue."), { [accountAccessHeader]: "unauthenticated" })],
  ["403 account", json(403, errorBody("FORBIDDEN", "This item isn't available to your account."), { [accountAccessHeader]: "account_unavailable" })],
  ["403 role", json(403, errorBody("FORBIDDEN", "This item isn't available to your account."), { [accountAccessHeader]: "role_denied" })],
  ["503 account", json(503, errorBody("SERVICE_UNAVAILABLE", "We can't check your account right now. Try again."), { [accountAccessHeader]: "account_service_unavailable" })],
])("LRN-07.7 ACC-03 hands a %s outcome to account recovery without replaying the report", async (_label, response) => {
  show();
  fetchMock.mockResolvedValueOnce(response);
  await send();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(posts()).toHaveLength(1);
  expect(screen.queryByText(copy.sent, { exact: true })).toBeNull();
  expect(screen.queryByRole("button", { name: copy.check })).toBeNull();
  expect(screen.queryByRole("button", { name: copy.send })).toBeNull();
});

it("LRN-07.4 LRN-08.6 merges only the returned flag and keeps other attempts' state independent", async () => {
  show(secondAttemptView());
  const flag = { ...reportFlag(), submissionId: secondAttemptView().id };
  fetchMock.mockResolvedValueOnce(json(201, { data: flag }));
  await send();
  expect(postedRequest().url).toBe(`/api/v1/submissions/${secondAttemptView().id}/reports`);
  announced(copy.sent);
  expect(within(section("Moderation flags")).getAllByText("Learner reported an unmatched comment", { exact: true })).toHaveLength(1);
  expect(submissionId).not.toBe(secondAttemptView().id);
});
