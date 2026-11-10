import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EditDraftForm } from "@/components/author/edit-draft-form";
import {
  action, archived, categoryBox, dialog, draft, expectAnnouncement, expectFieldError, listHref, pending,
  published, queryAction, withProposals, type Draft,
} from "./evidence";

type Result = { status: string; draft?: Draft; fieldErrors?: Record<string, string[]> };
type Save = (patch: Record<string, unknown>) => Promise<Result>;
type Reload = () => Promise<{ status: string; draft?: Draft }>;

afterEach(cleanup);

function setup(initial: Draft = draft, save = vi.fn<Save>(), reload = vi.fn<Reload>()) {
  const navigate = vi.fn<(href: string) => void>();
  const view = render(<EditDraftForm draft={initial} save={save} reload={reload} navigate={navigate} />);
  return { ...view, save, reload, navigate };
}

const title = () => screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement;
const code = () => screen.getByRole("textbox", { name: "Working code" }) as HTMLTextAreaElement;
const saveButton = () => screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;

it("AUT-06.2 AUT-06.3 exposes the saved metadata, code and configuration with Save changes and Cancel", () => {
  setup();
  expect(title().value).toBe(draft.title);
  expect((screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement).value).toBe(draft.description);
  expect((screen.getByRole("combobox", { name: "Language" }) as HTMLSelectElement).value).toBe("javascript");
  expect((screen.getByRole("combobox", { name: "Difficulty" }) as HTMLSelectElement).value).toBe("easy");
  expect(code().value).toBe(draft.workingCode);
  expect((screen.getByLabelText("Flaw count") as HTMLInputElement).value).toBe("2");
  expect(categoryBox("Logic bug").checked).toBe(true);
  expect(categoryBox("Security").checked).toBe(false);
  expect(saveButton()).toBeTruthy();
  expect(action("Cancel")).toBeTruthy();
});

it("AUT-06.3 saves only changed fields with expected versions and announces the saved draft", async () => {
  const request = pending<Result>();
  const save = vi.fn<Save>().mockReturnValue(request.promise);
  setup(draft, save);
  fireEvent.change(title(), { target: { value: "Checkout totals v2" } });
  fireEvent.change(code(), { target: { value: "function total() {\r\n  return 0;\r\n}\r\n" } });
  fireEvent.click(saveButton());
  expectAnnouncement("Saving changes…");
  expect((screen.getByRole("button", { name: /Sav/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Sav/ }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(Object.keys(save.mock.calls[0][0]).sort())
    .toEqual(["expectedDraftVersion", "expectedRowVersion", "title", "workingCode"]);
  expect(save.mock.calls[0][0]).toMatchObject({ expectedRowVersion: 1, expectedDraftVersion: 1, title: "Checkout totals v2" });
  await act(async () => request.resolve({
    status: "ok", draft: { ...draft, title: "Checkout totals v2", rowVersion: 2, draftVersion: 2 },
  }));
  await screen.findByText("Draft changes saved.");
  expectAnnouncement("Draft changes saved.");
  expect(title().value).toBe("Checkout totals v2");
});

it("AUT-06.3 offers no save when nothing changed", () => {
  setup();
  expect(saveButton().disabled).toBe(true);
  fireEvent.change(title(), { target: { value: "Changed" } });
  expect(saveButton().disabled).toBe(false);
});

it("AUT-06.3 uses AUT-01 and AUT-02 validation and saves nothing invalid", async () => {
  const { save } = setup();
  fireEvent.change(title(), { target: { value: "   " } });
  fireEvent.click(categoryBox("Logic bug"));
  fireEvent.click(categoryBox("Edge case"));
  fireEvent.click(saveButton());
  await screen.findByText("Enter a title.");
  expectFieldError(title(), "Enter a title.");
  expect(screen.getByText("Choose supported flaw categories without duplicates.")).toBeTruthy();
  expect(document.activeElement).toBe(title());
  expect(save).not.toHaveBeenCalled();
});

it("AUT-06.3 asks before clearing proposals and Cancel saves nothing", async () => {
  const cleared = { ...withProposals, title: "Renamed", rowVersion: 4, draftVersion: 3, generationId: null, proposals: [] };
  const save = vi.fn<Save>().mockResolvedValue({ status: "ok", draft: cleared });
  setup(withProposals, save);
  fireEvent.change(title(), { target: { value: "Renamed" } });
  fireEvent.click(saveButton());
  let confirm = await waitFor(() => within(dialog()!));
  expect(confirm.getByText("Saving changes clears the current proposals and decisions.")).toBeTruthy();
  fireEvent.click(confirm.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(dialog()).toBeNull());
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(saveButton());
  confirm = await waitFor(() => within(dialog()!));
  fireEvent.click(confirm.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ expectedRowVersion: 3, expectedDraftVersion: 2, title: "Renamed" }));
  await screen.findByText("Draft changes saved.");
});

it("AUT-06.3 explains that a published revision stays live while its draft is edited", () => {
  setup(published);
  expect(screen.getByText("The published revision stays live until you publish a new revision.")).toBeTruthy();
});

it("AUT-06.3 Cancel leaves without saving", () => {
  const { save, navigate } = setup();
  fireEvent.change(title(), { target: { value: "Unsaved" } });
  const cancel = action("Cancel");
  if (cancel.tagName === "A") {
    expect(cancel.getAttribute("href")).toMatch(new RegExp(`^${listHref}(/${draft.id})?$`));
  } else {
    fireEvent.click(cancel);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0]).toMatch(new RegExp(`^${listHref}(/${draft.id})?$`));
  }
  expect(save).not.toHaveBeenCalled();
});

it("AUT-06.6 a version conflict offers Reload challenge without overwriting newer state", async () => {
  const newer = { ...draft, title: "Saved elsewhere", rowVersion: 2, draftVersion: 2 };
  const save = vi.fn<Save>().mockResolvedValue({ status: "conflict" });
  const reload = vi.fn<Reload>().mockResolvedValue({ status: "ok", draft: newer });
  setup(draft, save, reload);
  fireEvent.change(title(), { target: { value: "Mine" } });
  fireEvent.click(saveButton());
  await screen.findByText("This challenge changed. Reload it before continuing.");
  expectAnnouncement("This challenge changed. Reload it before continuing.");
  fireEvent.click(screen.getByRole("button", { name: "Reload challenge" }));
  await waitFor(() => expect(title().value).toBe("Saved elsewhere"));
  expect(save).toHaveBeenCalledTimes(1);
});

it("AUT-06.6 a confirmed save failure keeps the unsaved edit values", async () => {
  const save = vi.fn<Save>().mockResolvedValue({ status: "failed" });
  setup(draft, save);
  fireEvent.change(title(), { target: { value: "Kept" } });
  fireEvent.click(saveButton());
  await screen.findByText("We couldn't save the changes. Try again.");
  expect(title().value).toBe("Kept");
  expect(screen.queryByText("Draft changes saved.")).toBeNull();
});

it("AUT-06.6 an uncertain save offers Refresh challenge and never reports success", async () => {
  const save = vi.fn<Save>().mockResolvedValue({ status: "uncertain" });
  const reload = vi.fn<Reload>().mockResolvedValue({ status: "ok", draft: { ...draft, title: "Kept", rowVersion: 2, draftVersion: 2 } });
  setup(draft, save, reload);
  fireEvent.change(title(), { target: { value: "Kept" } });
  fireEvent.click(saveButton());
  await screen.findByText("We couldn't confirm the change. Refresh the challenge before continuing.");
  expect(screen.queryByText("Draft changes saved.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Refresh challenge" }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledTimes(1);
});

it("AUT-02.6 archived drafts cannot be edited", () => {
  const { save } = setup(archived);
  expect(screen.getByText("Archived challenges can't be edited.")).toBeTruthy();
  expect(title().disabled || title().readOnly).toBe(true);
  const button = queryAction("Save changes") as HTMLButtonElement | null;
  expect(button === null || button.disabled).toBe(true);
  expect(save).not.toHaveBeenCalled();
});
