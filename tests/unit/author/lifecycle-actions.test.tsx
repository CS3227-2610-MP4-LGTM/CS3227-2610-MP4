import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { AuthorChallengeDetail as Existing } from "@/components/author/challenge-detail";
import {
  action, archived, dialog, draft, expectAnnouncement, listHref, pending, published, queryAction, revisionId, uuid, type Draft,
} from "./evidence";

/**
 * T-23 interface: `AuthorChallengeDetail` gains optional
 * `unpublish(body: { expectedRowVersion }, idempotencyKey)` and `archive(body, idempotencyKey)`, each
 * resolving to `{ status, challenge? }` (client.unpublishChallenge / client.archiveChallenge), and
 * `onLifecycleChanged(challenge: { id, status, rowVersion })`, called once on success (the route then
 * returns to “My challenges”). Detail also links to the current published revision.
 */
const AuthorChallengeDetail = Existing as unknown as ComponentType<Record<string, unknown>>;

type Result = { id: string; status: string; rowVersion: number };
type Outcome = { status: string; challenge?: Result };
type Change = (body: { expectedRowVersion: number }, key: string) => Promise<Outcome>;

afterEach(cleanup);

const unpublished: Draft = { ...published, status: "unpublished" as never, rowVersion: 5 };
const unpublishText = "Unpublish this challenge? Learners won't be able to start or retry it.";
const archiveText = "Archive this challenge? This can't be undone. Editing, publishing and new attempts will be unavailable.";
const messages = {
  conflict: "This challenge changed. Reload it before continuing.",
  unpublishFailed: "We couldn't unpublish the challenge. Try again.",
  archiveFailed: "We couldn't archive the challenge. Try again.",
  uncertain: "We couldn't confirm the change. Refresh the challenge before continuing.",
};

function setup(initial: Draft, options: { unpublish?: Change; archive?: Change; read?: ReturnType<typeof vi.fn> } = {}) {
  const read = options.read ?? vi.fn().mockResolvedValue({ status: "ok", draft: initial });
  const unpublish = options.unpublish ?? vi.fn<Change>().mockResolvedValue({
    status: "ok", challenge: { id: initial.id, status: "unpublished", rowVersion: initial.rowVersion + 1 },
  });
  const archive = options.archive ?? vi.fn<Change>().mockResolvedValue({
    status: "ok", challenge: { id: initial.id, status: "archived", rowVersion: initial.rowVersion + 1 },
  });
  const onLifecycleChanged = vi.fn<(challenge: Result) => void>();
  const view = render(<AuthorChallengeDetail challengeId={initial.id} read={read} unpublish={unpublish} archive={archive}
    onLifecycleChanged={onLifecycleChanged} />);
  return {
    ...view, read, onLifecycleChanged,
    unpublish: unpublish as ReturnType<typeof vi.fn<Change>>, archive: archive as ReturnType<typeof vi.fn<Change>>,
  };
}

const loaded = (title = draft.title) => screen.findByRole("heading", { level: 1, name: title });
const unavailable = (name: string) => {
  const control = screen.queryByRole("button", { name }) as HTMLButtonElement | null;
  return control === null || control.disabled;
};

/** Opens the named lifecycle confirmation from its trigger, which keeps focus for the dialog to return it. */
function open(name: "Unpublish" | "Archive") {
  const trigger = screen.getByRole("button", { name });
  trigger.focus();
  fireEvent.click(trigger);
  const confirm = dialog();
  expect(confirm).not.toBeNull();
  return { trigger, confirm: confirm! };
}

async function confirmed(name: "Unpublish" | "Archive") {
  const { confirm } = open(name);
  await act(async () => fireEvent.click(within(confirm).getByRole("button", { name })));
}

it.each([
  ["a draft", draft, false, true],
  ["a published challenge", published, true, true],
  ["an unpublished challenge", unpublished, false, true],
  ["an archived challenge", archived, false, false],
] as const)("AUT-06.2 AUT-06.4 AUT-06.5 offers the allowed lifecycle actions for %s", async (_case, initial, canUnpublish, canArchive) => {
  setup(initial);
  await loaded();
  expect(screen.queryByRole("button", { name: "Unpublish" }) !== null).toBe(canUnpublish);
  expect(screen.queryByRole("button", { name: "Archive" }) !== null).toBe(canArchive);
});

it("AUT-06.4 an unpublished challenge still offers Edit draft for a new revision", async () => {
  setup(unpublished);
  await loaded();
  expect(action("Edit draft").getAttribute("href")).toBe(`${listHref}/${draft.id}/edit`);
});

it("AUT-06.5 an archived challenge is read-only with no restore or delete action", async () => {
  setup(archived);
  await screen.findByText("Archived challenges can't be edited.");
  expect(queryAction("Edit draft")).toBeNull();
  expect(screen.queryByRole("button", { name: /restore|delete|unarchive/i })).toBeNull();
  expect(screen.queryByRole("link", { name: /restore|delete|unarchive/i })).toBeNull();
});

it("AUT-06.2 links to the current published revision", async () => {
  setup(published);
  await loaded();
  expect(action("View published challenge").getAttribute("href")).toBe(`${listHref}/${draft.id}/revisions/${revisionId}`);
});

it("AUT-06.2 shows no published revision link before the first publication", async () => {
  setup(draft);
  await loaded();
  expect(queryAction("View published challenge")).toBeNull();
});

it.each([
  ["Unpublish", unpublishText],
  ["Archive", archiveText],
] as const)("AUT-06.4 AUT-06.5 SYS-17.1 %s asks for confirmation; Cancel makes no request and returns focus", async (name, text) => {
  const { unpublish, archive } = setup(published);
  await loaded();
  const { trigger, confirm } = open(name);
  expect(confirm.textContent).toContain(text);
  expect(within(confirm).getByRole("button", { name })).toBeTruthy();
  fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(dialog()).toBeNull());
  expect(document.activeElement).toBe(trigger);
  expect(unpublish).not.toHaveBeenCalled();
  expect(archive).not.toHaveBeenCalled();
});

it.each([
  ["Unpublish", "unpublish", "Unpublishing…", "unpublished"],
  ["Archive", "archive", "Archiving…", "archived"],
] as const)("AUT-06.4 AUT-06.5 AUT-06.6 %s shows its pending state once and hands over the result", async (name, call, pendingText, status) => {
  const request = pending<Outcome>();
  const change = vi.fn<Change>().mockReturnValue(request.promise);
  const { onLifecycleChanged } = setup(published, { [call]: change });
  await loaded();
  const { confirm } = open(name);
  const button = within(confirm).getByRole("button", { name });
  fireEvent.click(button);
  fireEvent.click(button);
  expectAnnouncement(pendingText);
  expect(unavailable("Unpublish")).toBe(true);
  expect(unavailable("Archive")).toBe(true);
  expect(change).toHaveBeenCalledTimes(1);
  expect(change.mock.calls[0][0]).toEqual({ expectedRowVersion: published.rowVersion });
  expect(change.mock.calls[0][1]).toMatch(uuid);
  const result = { id: published.id, status, rowVersion: published.rowVersion + 1 };
  await act(async () => request.resolve({ status: "ok", challenge: result }));
  expect(onLifecycleChanged).toHaveBeenCalledTimes(1);
  expect(onLifecycleChanged).toHaveBeenCalledWith(result);
});

it("AUT-06.6 a version conflict shows Reload challenge, which rereads without repeating the action", async () => {
  const read = vi.fn().mockResolvedValue({ status: "ok", draft: published });
  const unpublish = vi.fn<Change>().mockResolvedValue({ status: "conflict" });
  const { onLifecycleChanged } = setup(published, { read, unpublish });
  await loaded();
  await confirmed("Unpublish");
  expect(await screen.findByText(messages.conflict)).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reload challenge" })));
  await loaded();
  expect(read).toHaveBeenCalledTimes(2);
  expect(unpublish).toHaveBeenCalledTimes(1);
  expect(onLifecycleChanged).not.toHaveBeenCalled();
});

it.each([
  ["Unpublish", "unpublish", messages.unpublishFailed],
  ["Archive", "archive", messages.archiveFailed],
] as const)("AUT-06.6 a confirmed %s failure keeps the action available and a new attempt uses a new key", async (name, call, message) => {
  const change = vi.fn<Change>().mockResolvedValueOnce({ status: "failed" }).mockReturnValueOnce(new Promise(() => {}));
  const { onLifecycleChanged } = setup(published, { [call]: change });
  await loaded();
  await confirmed(name);
  const alert = await screen.findByText(message);
  expect(alert.closest('[role="alert"]')).not.toBeNull();
  expect(onLifecycleChanged).not.toHaveBeenCalled();
  await confirmed(name);
  expect(change).toHaveBeenCalledTimes(2);
  expect(change.mock.calls[1][1]).not.toBe(change.mock.calls[0][1]);
});

it("AUT-06.6 an uncertain outcome offers Refresh challenge, which resolves the same operation instead of a new action", async () => {
  const archive = vi.fn<Change>().mockResolvedValueOnce({ status: "uncertain" }).mockResolvedValueOnce({
    status: "ok", challenge: { id: published.id, status: "archived", rowVersion: published.rowVersion + 1 },
  });
  const { onLifecycleChanged } = setup(published, { archive });
  await loaded();
  await confirmed("Archive");
  expect(await screen.findByText(messages.uncertain)).toBeTruthy();
  expect(onLifecycleChanged).not.toHaveBeenCalled();
  // No uncertainty is retried as a new action: the lifecycle triggers stay unavailable until it resolves.
  expect(unavailable("Unpublish")).toBe(true);
  expect(unavailable("Archive")).toBe(true);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Refresh challenge" })));
  expect(archive).toHaveBeenCalledTimes(2);
  expect(archive.mock.calls[1]).toEqual(archive.mock.calls[0]);
  expect(onLifecycleChanged).toHaveBeenCalledTimes(1);
});

it("AUT-06.6 SYS-11 an account failure is reported without replaying the action", async () => {
  const unpublish = vi.fn<Change>().mockResolvedValue({ status: "unauthenticated" });
  const { onLifecycleChanged } = setup(published, { unpublish });
  await loaded();
  await confirmed("Unpublish");
  expect(unpublish).toHaveBeenCalledTimes(1);
  expect(onLifecycleChanged).not.toHaveBeenCalled();
});
