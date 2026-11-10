import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CreateChallengeForm } from "@/components/author/create-challenge-form";
import {
  action, categoryBox, categoryGroup, categoryLabels, draft, expectAnnouncement, expectFieldError,
  expectFlawCountRange, listHref, pending, queryAction, uuid,
} from "./evidence";

type Result = { status: string; draft?: typeof draft; fieldErrors?: Record<string, string[]> };
type Create = (input: Record<string, unknown>, idempotencyKey: string) => Promise<Result>;

afterEach(cleanup);

function setup(create = vi.fn<Create>()) {
  const navigate = vi.fn<(href: string) => void>();
  const view = render(<CreateChallengeForm create={create} navigate={navigate} />);
  return { ...view, create, navigate };
}

const field = {
  title: () => screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement,
  description: () => screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement,
  language: () => screen.getByRole("combobox", { name: "Language" }) as HTMLSelectElement,
  difficulty: () => screen.getByRole("combobox", { name: "Difficulty" }) as HTMLSelectElement,
  code: () => screen.getByRole("textbox", { name: "Working code" }) as HTMLTextAreaElement,
  count: () => screen.getByLabelText("Flaw count") as HTMLInputElement | HTMLSelectElement,
};

function fill(values: Partial<Record<"title" | "description" | "language" | "difficulty" | "code" | "count", string>> = {}) {
  const all = {
    title: "Checkout totals", description: "Review the changes to discounts and basket totals.",
    language: "javascript", difficulty: "easy", code: draft.workingCode, count: "2", ...values,
  };
  for (const [name, value] of Object.entries(all)) {
    fireEvent.change(field[name as keyof typeof field](), { target: { value } });
  }
  if (!categoryBox("Logic bug").checked) fireEvent.click(categoryBox("Logic bug"));
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
}

it("AUT-01.1 AUT-02.1 shows required metadata, working code and flaw configuration with product vocabularies only", () => {
  const { container } = setup();
  for (const control of [field.title(), field.description(), field.language(), field.difficulty(), field.code(), field.count()]) {
    expect(control.required || control.getAttribute("aria-required") === "true").toBe(true);
  }
  expect(Array.from(field.language().options).filter((o) => o.value).map((o) => [o.value, o.text])).toEqual([
    ["python", "Python"], ["java", "Java"], ["javascript", "JavaScript"], ["typescript", "TypeScript"],
  ]);
  expect(Array.from(field.difficulty().options).filter((o) => o.value).map((o) => [o.value, o.text])).toEqual([
    ["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"],
  ]);
  expectFlawCountRange(field.count());
  expect(categoryGroup().getAllByRole("checkbox")).toHaveLength(categoryLabels.length);
  for (const label of categoryLabels) expect(categoryBox(label).checked).toBe(false);
  expect(container.querySelector('input[type="file"], input[type="url"]')).toBeNull();
  expect(screen.queryByRole("button", { name: /run|execute|upload/i })).toBeNull();
  expect(screen.queryByRole("textbox", { name: /repository|url/i })).toBeNull();
  expect(action("Save draft")).toBeTruthy();
  expect(action("Cancel")).toBeTruthy();
});

it("AUT-01.2 AUT-02.2 shows every missing-field message beside its field, focuses the first and creates nothing", async () => {
  const { create } = setup();
  save();
  await screen.findByText("Enter a title.");
  expectFieldError(field.title(), "Enter a title.");
  expectFieldError(field.description(), "Enter a description.");
  expectFieldError(field.language(), "Choose a supported language.");
  expectFieldError(field.difficulty(), "Choose a difficulty.");
  expectFieldError(field.code(), "Paste working code.");
  expect(screen.getByText("Choose supported flaw categories without duplicates.")).toBeTruthy();
  expect(document.activeElement).toBe(field.title());
  expect(create).not.toHaveBeenCalled();
});

it("AUT-01.2 rejects whitespace-only and oversized input, retaining every entered value", async () => {
  const { create } = setup();
  const longDescription = "d".repeat(4001);
  const oversized = "é".repeat(10_000) + "a";
  fill({ title: "t".repeat(121), description: longDescription, code: oversized });
  save();
  await screen.findByText("Title is too long.");
  expectFieldError(field.title(), "Title is too long.");
  expectFieldError(field.description(), "Description is too long.");
  expectFieldError(field.code(), "Working code exceeds the size limit.");
  expect(field.title().value).toBe("t".repeat(121));
  expect(field.description().value).toBe(longDescription);
  expect(field.code().value).toBe(oversized);
  expect(create).not.toHaveBeenCalled();

  fill({ title: "   ", code: " \n\t " });
  save();
  await waitFor(() => expectFieldError(field.title(), "Enter a title."));
  expectFieldError(field.code(), "Paste working code.");
  expect(create).not.toHaveBeenCalled();
});

it("AUT-01.2 accepts code at the 20,000-byte cap after CRLF normalization", async () => {
  const create = vi.fn<Create>().mockResolvedValue({ status: "ok", draft });
  setup(create);
  const half = "x".repeat(9_999);
  fill({ code: `${half}\r\n${half}\r\n` });
  save();
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
});

it("AUT-01.2 shows server field errors beside their fields and keeps the values", async () => {
  const create = vi.fn<Create>().mockResolvedValue({
    status: "invalid", fieldErrors: { workingCode: ["Working code contains invalid characters."] },
  });
  setup(create);
  fill();
  save();
  await screen.findByText("Working code contains invalid characters.");
  expectFieldError(field.code(), "Working code contains invalid characters.");
  expect(field.code().value).toBe(draft.workingCode);
  expect(screen.queryByText("Draft saved.")).toBeNull();
});

it("AUT-01.3 announces saving, blocks repeat submission and opens the saved draft's Flaw configuration", async () => {
  const request = pending<Result>();
  const create = vi.fn<Create>().mockReturnValue(request.promise);
  const { navigate } = setup(create);
  fill({ count: "3" });
  fireEvent.click(categoryBox("Security"));
  save();
  expectAnnouncement("Saving draft…");
  expect((screen.getByRole("button", { name: /Sav/ }) as HTMLButtonElement).disabled).toBe(true);
  save();
  fireEvent.submit(field.title().closest("form")!);
  expect(create).toHaveBeenCalledTimes(1);
  const [input, key] = create.mock.calls[0];
  expect(key).toMatch(uuid);
  expect(input).toEqual({
    title: "Checkout totals", description: "Review the changes to discounts and basket totals.",
    language: "javascript", difficulty: "easy", workingCode: draft.workingCode, flawCount: 3,
    categories: expect.arrayContaining(["logic_bug", "security"]),
  });
  expect((input.categories as string[]).length).toBe(2);
  await act(async () => request.resolve({ status: "ok", draft }));
  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  expect(new URL(navigate.mock.calls[0][0], "https://app.example.test").pathname)
    .toBe(`${listHref}/${draft.id}/configuration`);
});

it("AUT-01.4 Cancel returns to My challenges without creating a draft", async () => {
  const { create, navigate } = setup();
  fill();
  const cancel = action("Cancel");
  if (cancel.tagName === "A") {
    expect(cancel.getAttribute("href")).toBe(listHref);
  } else {
    fireEvent.click(cancel);
    expect(navigate).toHaveBeenCalledWith(listHref);
  }
  expect(create).not.toHaveBeenCalled();
});

it("AUT-01.5 a confirmed failure keeps the values and an explicit retry starts a new save", async () => {
  const create = vi.fn<Create>().mockResolvedValueOnce({ status: "failed" }).mockResolvedValueOnce({ status: "ok", draft });
  const { navigate } = setup(create);
  fill();
  save();
  await screen.findByText("We couldn't save the draft. Try again.");
  expectAnnouncement("We couldn't save the draft. Try again.");
  expect(screen.queryByText("Draft saved.")).toBeNull();
  expect(field.title().value).toBe("Checkout totals");
  expect(field.code().value).toBe(draft.workingCode);
  expect(navigate).not.toHaveBeenCalled();
  save();
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  expect(create.mock.calls[1][1]).toMatch(uuid);
  expect(create.mock.calls[1][1]).not.toBe(create.mock.calls[0][1]);
});

it("AUT-01.5 an uncertain save offers Check save, which resolves the same save before any new creation", async () => {
  const create = vi.fn<Create>().mockResolvedValueOnce({ status: "uncertain" }).mockResolvedValueOnce({ status: "ok", draft });
  const { navigate } = setup(create);
  fill();
  save();
  await screen.findByText("We couldn't confirm whether the draft was saved.");
  expectAnnouncement("We couldn't confirm whether the draft was saved.");
  expect(screen.queryByText("Draft saved.")).toBeNull();
  const saveDraft = queryAction("Save draft") as HTMLButtonElement | null;
  expect(saveDraft === null || saveDraft.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Check save" }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  expect(new URL(navigate.mock.calls[0][0], "https://app.example.test").pathname)
    .toBe(`${listHref}/${draft.id}/configuration`);
});
