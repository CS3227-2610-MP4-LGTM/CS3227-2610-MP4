import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChallengeCatalogue } from "@/components/learner/challenge-catalogue";

const catalogue = "/learner/challenges";
const checkout = {
  id: "00000000-0000-4000-8000-000000000101",
  revisionId: "00000000-0000-4000-8000-000000000201",
  title: "Checkout totals",
  description: "Review the changes to discounts and basket totals.",
  language: "javascript" as const,
  difficulty: "easy" as const,
  categories: ["edge_case", "logic_bug"] as Array<"edge_case" | "logic_bug">,
  publishedAt: "2026-01-01T00:00:00Z",
};
const cursor = "opaque-test-cursor";
const response = (items = [checkout], nextCursor: string | null = null) =>
  ({ status: "ok" as const, page: { items, nextCursor } });

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function setup(readPage = vi.fn<(search: string) => Promise<
  ReturnType<typeof response> | { status: "invalid" | "unavailable" }
>>(), initialSearch = "") {
  const navigate = vi.fn((href: string) => {
    const url = new URL(href, "https://app.example.test");
    expect(url.pathname).toBe(catalogue);
    view.rerender(<ChallengeCatalogue search={url.search.slice(1)} readPage={readPage} navigate={navigate} />);
  });
  const view = render(<ChallengeCatalogue search={initialSearch} readPage={readPage} navigate={navigate} />);
  return { ...view, navigate };
}

function filters() {
  return {
    language: screen.getByRole("combobox", { name: "Language" }) as HTMLSelectElement,
    difficulty: screen.getByRole("combobox", { name: "Difficulty" }) as HTMLSelectElement,
    category: screen.getByRole("combobox", { name: "Flaw category" }) as HTMLSelectElement,
  };
}

function action(name: string) {
  return screen.queryByRole("button", { name }) ?? screen.getByRole("link", { name });
}

function results() {
  return within(screen.getByRole("region", { name: /results/i }));
}

function expectAnnouncement(message: string) {
  const element = screen.getByText(message);
  expect(element.closest('[role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]')).not.toBeNull();
}

afterEach(cleanup);

it("LRN-01.1 LRN-01.2 shows single-select contract choices and a linked catalogue card", async () => {
  setup(vi.fn().mockResolvedValue(response()));
  const selections = filters();
  const options = {
    language: [["", "All languages"], ["python", "Python"], ["java", "Java"], ["javascript", "JavaScript"], ["typescript", "TypeScript"]],
    difficulty: [["", "All difficulties"], ["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]],
    category: [["", "All categories"], ["logic_bug", "Logic bug"], ["edge_case", "Edge case"], ["error_handling", "Error handling"], ["security", "Security"], ["performance", "Performance"]],
  };
  for (const key of ["language", "difficulty", "category"] as const) {
    const select = selections[key];
    expect(select.value).toBe("");
    expect(select.multiple).toBe(false);
    expect(Array.from(select.options, (option) => [option.value, option.text])).toEqual(
      expect.arrayContaining(options[key]),
    );
    expect(select.options).toHaveLength(options[key].length);
  }
  await results().findByText(checkout.title);
  for (const value of [checkout.description, "JavaScript", "Easy", "Edge case", "Logic bug"]) {
    expect(results().getByText(value)).toBeTruthy();
  }
  expect(results().getByRole("link", { name: "View challenge" }).getAttribute("href")).toBe(`${catalogue}/${checkout.id}`);
});

it("LRN-01.2 LRN-01.5 SYS-02.2 renders inert card text and offers clearing even when results match", async () => {
  const description = '<img src="https://example.test/catalogue.png" onerror="alert(1)">';
  const title = "Checkout <script>alert(1)</script>";
  setup(vi.fn().mockResolvedValue(response([{ ...checkout, title, description }])), "language=javascript");
  const region = screen.getByRole("region", { name: /results/i });
  await within(region).findByText(title);
  expect(within(region).getByText(description)).toBeTruthy();
  expect(region.querySelector("script, img")).toBeNull();
  expect(action("Clear filters")).toBeTruthy();
});

it("LRN-01.3 LRN-01.6 SYS-17.1 replaces pending selections, drops the cursor and keeps filter focus", async () => {
  const original = pending<ReturnType<typeof response>>();
  const obsolete = pending<ReturnType<typeof response>>();
  const latest = pending<ReturnType<typeof response>>();
  const readPage = vi.fn()
    .mockReturnValueOnce(original.promise).mockReturnValueOnce(obsolete.promise)
    .mockReturnValueOnce(latest.promise).mockResolvedValueOnce(response());
  setup(readPage, `language=javascript&cursor=${cursor}`);
  expectAnnouncement("Loading challenges…");
  expect(new URLSearchParams(readPage.mock.calls[0]?.[0]).get("cursor")).toBe(cursor);

  const { difficulty, category } = filters();
  difficulty.focus();
  fireEvent.change(difficulty, { target: { value: "easy" } });
  expect(document.activeElement).toBe(difficulty);
  category.focus();
  fireEvent.change(category, { target: { value: "logic_bug" } });
  expect(document.activeElement).toBe(category);
  expect(Object.fromEntries(new URLSearchParams(readPage.mock.calls[1]?.[0]))).toEqual({
    language: "javascript", difficulty: "easy",
  });
  expect(Object.fromEntries(new URLSearchParams(readPage.mock.calls[2]?.[0]))).toEqual({
    language: "javascript", difficulty: "easy", category: "logic_bug",
  });
  await act(async () => { obsolete.resolve(response([{ ...checkout, title: "Superseded result" }])); });
  expect(results().queryByText("Superseded result")).toBeNull();
  expectAnnouncement("Loading challenges…");
  await act(async () => { latest.resolve(response()); });
  expect(results().getByText(checkout.title)).toBeTruthy();
  await act(async () => { original.resolve(response([{ ...checkout, title: "Original result" }])); });
  expect(results().queryByText("Original result")).toBeNull();
  expect(results().getByText(checkout.title)).toBeTruthy();

  fireEvent.change(category, { target: { value: "" } });
  expect(Object.fromEntries(new URLSearchParams(readPage.mock.calls[3]?.[0]))).toEqual({
    language: "javascript", difficulty: "easy",
  });
  await results().findByText(checkout.title);
});

it("LRN-01.4 LRN-01.6 SYS-17.1 uses the next cursor, disables pending pagination and focuses the results heading", async () => {
  const nextPage = pending<ReturnType<typeof response>>();
  const readPage = vi.fn().mockResolvedValueOnce(response([checkout], cursor))
    .mockReturnValueOnce(nextPage.promise).mockResolvedValueOnce(response([checkout], cursor));
  const { navigate } = setup(readPage, "language=javascript");
  await results().findByText(checkout.title);
  fireEvent.click(action("Next page"));
  expectAnnouncement("Loading challenges…");
  const first = action("First page");
  expect(first.matches(":disabled, [aria-disabled='true']")).toBe(true);
  fireEvent.click(first);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(Object.fromEntries(new URLSearchParams(readPage.mock.calls[1]?.[0]))).toEqual({
    language: "javascript", cursor,
  });

  await act(async () => { nextPage.resolve(response([{ ...checkout, title: "Later result" }])); });
  expect(results().getByText("Later result")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Next page" })).toBeNull();
  expect(document.activeElement).toBe(results().getByRole("heading", { name: /results/i }));
  fireEvent.click(action("First page"));
  expect(Object.fromEntries(new URLSearchParams(readPage.mock.calls[2]?.[0]))).toEqual({ language: "javascript" });
  await results().findByText(checkout.title);
});

it("LRN-01.5 clears all filters and cursor from a filtered empty page and shows the unfiltered empty state", async () => {
  const readPage = vi.fn().mockResolvedValue(response([]));
  const { navigate } = setup(readPage, `language=javascript&difficulty=easy&category=logic_bug&cursor=${cursor}`);
  await results().findByText("No challenges match these filters.");
  expectAnnouncement("No challenges match these filters.");
  fireEvent.click(action("Clear filters"));
  expect(navigate).toHaveBeenCalledWith(catalogue);
  await results().findByText("No challenges available.");
  expectAnnouncement("No challenges available.");
  expect(readPage).toHaveBeenLastCalledWith("");
  expect(Object.values(filters()).map(({ value }) => value)).toEqual(["", "", ""]);
});

it("LRN-01.7 announces read errors and retries the same filtered cursor without changing the URL", async () => {
  const readPage = vi.fn().mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValueOnce(response());
  const search = `language=javascript&cursor=${cursor}`;
  const { navigate } = setup(readPage, search);
  await results().findByText("We couldn't load challenges. Try again.");
  expectAnnouncement("We couldn't load challenges. Try again.");
  expect(results().queryByText("No challenges match these filters.")).toBeNull();
  fireEvent.click(action("Try again"));
  await waitFor(() => expect(readPage.mock.calls).toEqual([[search], [search]]));
  expect(navigate).not.toHaveBeenCalled();
  expect(filters().language.value).toBe("javascript");
  await results().findByText(checkout.title);
});

it("LRN-01.7 distinguishes invalid query from empty and recovers through the clean URL", async () => {
  const readPage = vi.fn().mockResolvedValueOnce({ status: "invalid" }).mockResolvedValueOnce(response());
  const { navigate } = setup(readPage, "difficulty=impossible&cursor=broken");
  await results().findByText("These filters or this page aren't valid.");
  expectAnnouncement("These filters or this page aren't valid.");
  expect(results().queryByText("No challenges available.")).toBeNull();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  fireEvent.click(action("Clear filters"));
  expect(navigate).toHaveBeenCalledWith(catalogue);
  await results().findByText(checkout.title);
});
