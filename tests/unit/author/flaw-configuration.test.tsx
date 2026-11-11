import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FlawConfiguration } from "@/components/author/flaw-configuration";
import {
  action, archived, categoryBox, categoryLabels, dialog, draft, expectAnnouncement, expectFlawCountRange,
  listHref, pending, queryAction, withProposals, type Draft,
} from "./evidence";

type Result = { status: string; draft?: Draft; fieldErrors?: Record<string, string[]> };
type Save = (patch: Record<string, unknown>) => Promise<Result>;
type Reload = () => Promise<{ status: string; draft?: Draft }>;

afterEach(cleanup);

function setup(initial: Draft = draft, save = vi.fn<Save>(), reload = vi.fn<Reload>()) {
  const navigate = vi.fn<(href: string) => void>();
  const view = render(<FlawConfiguration draft={initial} save={save} reload={reload} navigate={navigate} />);
  return { ...view, save, reload, navigate };
}

const count = () => screen.getByLabelText("Flaw count") as HTMLInputElement | HTMLSelectElement;
const difficulty = () => screen.getByRole("combobox", { name: "Difficulty" }) as HTMLSelectElement;
const saveButton = () => screen.getByRole("button", { name: "Save configuration" }) as HTMLButtonElement;

it("AUT-02.1 shows the saved count, categories and difficulty with the allowed range and navigation", () => {
  setup();
  expect(count().value).toBe("2");
  expectFlawCountRange(count());
  expect(difficulty().value).toBe("easy");
  expect(Array.from(difficulty().options).filter((o) => o.value).map((o) => o.text)).toEqual(["Easy", "Medium", "Hard"]);
  for (const label of categoryLabels) {
    expect(categoryBox(label).checked).toBe(["Logic bug", "Edge case"].includes(label));
  }
  expect(saveButton()).toBeTruthy();
  expect(action("Back to challenges").getAttribute("href") ?? listHref).toBe(listHref);
  expect(screen.getByRole("heading", { name: "Flaw configuration" })).toBeTruthy();
});

it("AUT-02.3 offers no save until a saved choice changes", () => {
  setup();
  expect(saveButton().disabled).toBe(true);
  fireEvent.change(count(), { target: { value: "3" } });
  expect(saveButton().disabled).toBe(false);
  fireEvent.change(count(), { target: { value: "2" } });
  expect(saveButton().disabled).toBe(true);
});

it("AUT-02.2 rejects an empty category selection without saving and keeps the other entered values", async () => {
  const { save } = setup();
  fireEvent.change(count(), { target: { value: "4" } });
  fireEvent.click(categoryBox("Logic bug"));
  fireEvent.click(categoryBox("Edge case"));
  fireEvent.click(saveButton());
  await screen.findByText("Choose supported flaw categories without duplicates.");
  expect(save).not.toHaveBeenCalled();
  expect(count().value).toBe("4");
});

it("AUT-02.2 shows server configuration errors and keeps the entered values", async () => {
  const save = vi.fn<Save>().mockResolvedValue({
    status: "invalid", fieldErrors: { flawCount: ["Choose a whole-number flaw count within the allowed range."] },
  });
  setup(draft, save);
  fireEvent.change(count(), { target: { value: "5" } });
  fireEvent.click(saveButton());
  await screen.findByText("Choose a whole-number flaw count within the allowed range.");
  expect(count().value).toBe("5");
  expect(screen.queryByText("Configuration saved.")).toBeNull();
});

it("AUT-02.3 saves only the changed choices with expected versions and shows the persisted result", async () => {
  const request = pending<Result>();
  const save = vi.fn<Save>().mockReturnValue(request.promise);
  setup(draft, save);
  fireEvent.change(count(), { target: { value: "3" } });
  fireEvent.click(categoryBox("Security"));
  fireEvent.click(saveButton());
  expectAnnouncement("Saving configuration…");
  expect((screen.getByRole("button", { name: /Sav/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Sav/ }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0]).toEqual({
    expectedRowVersion: 1, expectedDraftVersion: 1, flawCount: 3,
    categories: expect.arrayContaining(["logic_bug", "edge_case", "security"]),
  });
  const persisted = { ...draft, rowVersion: 2, draftVersion: 2, flawCount: 3, categories: ["security", "logic_bug", "edge_case"] };
  await act(async () => request.resolve({ status: "ok", draft: persisted }));
  await screen.findByText("Configuration saved.");
  expectAnnouncement("Configuration saved.");
  expect(count().value).toBe("3");
  expect(categoryBox("Security").checked).toBe(true);
  expect(saveButton().disabled).toBe(true);
});

it("AUT-02.1 AUT-02.3 sends a difficulty change as the shared challenge difficulty", async () => {
  const save = vi.fn<Save>().mockResolvedValue({ status: "ok", draft: { ...draft, difficulty: "hard" as never, rowVersion: 2, draftVersion: 2 } });
  setup(draft, save);
  fireEvent.change(difficulty(), { target: { value: "hard" } });
  fireEvent.click(saveButton());
  await waitFor(() => expect(save).toHaveBeenCalledWith({ expectedRowVersion: 1, expectedDraftVersion: 1, difficulty: "hard" }));
});

it("AUT-02.4 asks before saving over proposals; Cancel keeps the saved set and saves nothing", async () => {
  const { save } = setup(withProposals);
  fireEvent.change(count(), { target: { value: "3" } });
  fireEvent.click(saveButton());
  const confirm = await waitFor(() => {
    const element = dialog();
    expect(element).not.toBeNull();
    return within(element!);
  });
  expect(confirm.getByText("Saving changes clears the current proposals and decisions.")).toBeTruthy();
  fireEvent.click(confirm.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(dialog()).toBeNull());
  expect(save).not.toHaveBeenCalled();
  expect(count().value).toBe("3");
});

it("AUT-02.4 confirming the save clears proposals and asks for new ones", async () => {
  const cleared = { ...withProposals, rowVersion: 4, draftVersion: 3, flawCount: 3, generationId: null, proposals: [] };
  const save = vi.fn<Save>().mockResolvedValue({ status: "ok", draft: cleared });
  setup(withProposals, save);
  fireEvent.change(count(), { target: { value: "3" } });
  fireEvent.click(saveButton());
  const confirm = await waitFor(() => within(dialog()!));
  fireEvent.click(confirm.getByRole("button", { name: "Save configuration" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ expectedRowVersion: 3, expectedDraftVersion: 2, flawCount: 3 }));
  await screen.findByText("Generate new proposals to continue.");
  expectAnnouncement("Configuration saved.");
});

it("AUT-02.4 saving without a current proposal set needs no confirmation", async () => {
  const save = vi.fn<Save>().mockResolvedValue({ status: "ok", draft: { ...draft, flawCount: 3 } });
  setup(draft, save);
  fireEvent.change(count(), { target: { value: "3" } });
  fireEvent.click(saveButton());
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(dialog()).toBeNull();
});

it("AUT-02.5 a version conflict offers Reload draft, which rereads without saving again", async () => {
  const newer = { ...draft, rowVersion: 2, draftVersion: 2, flawCount: 4 };
  const save = vi.fn<Save>().mockResolvedValue({ status: "conflict" });
  const reload = vi.fn<Reload>().mockResolvedValue({ status: "ok", draft: newer });
  setup(draft, save, reload);
  fireEvent.change(count(), { target: { value: "3" } });
  fireEvent.click(saveButton());
  await screen.findByText("This draft changed. Reload it before saving.");
  expectAnnouncement("This draft changed. Reload it before saving.");
  expect(screen.queryByText("Configuration saved.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reload draft" }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(count().value).toBe("4"));
  expect(save).toHaveBeenCalledTimes(1);
});

it("AUT-02.5 a confirmed failure keeps local inputs for an explicit retry", async () => {
  const save = vi.fn<Save>().mockResolvedValue({ status: "failed" });
  setup(draft, save);
  fireEvent.change(count(), { target: { value: "3" } });
  fireEvent.click(saveButton());
  await screen.findByText("We couldn't save the configuration. Try again.");
  expectAnnouncement("We couldn't save the configuration. Try again.");
  expect(count().value).toBe("3");
  expect(saveButton().disabled).toBe(false);
});

it("AUT-02.5 an uncertain save offers Refresh draft, which rereads and makes no new mutation", async () => {
  const save = vi.fn<Save>().mockResolvedValue({ status: "uncertain" });
  const reload = vi.fn<Reload>().mockResolvedValue({ status: "ok", draft: { ...draft, rowVersion: 2, draftVersion: 2, flawCount: 3 } });
  setup(draft, save, reload);
  fireEvent.change(count(), { target: { value: "3" } });
  fireEvent.click(saveButton());
  await screen.findByText("We couldn't confirm the save. Refresh the draft before continuing.");
  expect(screen.queryByText("Configuration saved.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Refresh draft" }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(count().value).toBe("3"));
  expect(save).toHaveBeenCalledTimes(1);
});

it("AUT-02.6 shows archived configuration read-only with no save", () => {
  const { save } = setup(archived);
  expect(screen.getByText("Archived challenges can't be edited.")).toBeTruthy();
  const control = count();
  expect(control.disabled || control.getAttribute("aria-readonly") === "true" || control.hasAttribute("readonly")).toBe(true);
  expect(categoryBox("Logic bug").disabled).toBe(true);
  const button = queryAction("Save configuration") as HTMLButtonElement | null;
  expect(button === null || button.disabled).toBe(true);
  expect(save).not.toHaveBeenCalled();
});

it("AUT-02.6 an edit that loses to archiving shows the archived state without saving again", async () => {
  const save = vi.fn<Save>().mockResolvedValue({ status: "invalid_state" });
  const reload = vi.fn<Reload>().mockResolvedValue({ status: "ok", draft: archived });
  setup(draft, save, reload);
  fireEvent.change(count(), { target: { value: "3" } });
  fireEvent.click(saveButton());
  await waitFor(() => expect(screen.queryByText("Configuration saved.")).toBeNull());
  const reloadAction = await screen.findByRole("button", { name: /Reload draft|Refresh draft/ });
  fireEvent.click(reloadAction);
  await screen.findByText("Archived challenges can't be edited.");
  expect(save).toHaveBeenCalledTimes(1);
});
