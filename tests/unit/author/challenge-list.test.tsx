import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthorChallengeList } from "@/components/author/challenge-list";
import { action, expectAnnouncement, listHref, pending, queryAction } from "./evidence";

const card = (n: number, status = "draft") => ({
  id: `00000000-0000-4000-8000-${String(100 + n).padStart(12, "0")}`,
  status,
  title: `Challenge ${n}`,
  language: "python" as const,
  difficulty: "medium" as const,
  createdAt: "2026-01-01T00:00:00Z",
});
type Card = ReturnType<typeof card>;
type PageResult = { status: "ok"; page: { items: Card[]; nextCursor: string | null } } | { status: "unavailable" | "invalid" };
type ReadPage = (search: string) => Promise<PageResult>;
const ok = (items: Card[], nextCursor: string | null = null): PageResult => ({ status: "ok", page: { items, nextCursor } });

afterEach(cleanup);

function setup(readPage: ReadPage, search = "") {
  const navigate = vi.fn((href: string) => {
    const url = new URL(href, "https://app.example.test");
    expect(url.pathname).toBe(listHref);
    view.rerender(<AuthorChallengeList search={url.search.slice(1)} readPage={readPage} navigate={navigate} />);
  });
  const view = render(<AuthorChallengeList search={search} readPage={readPage} navigate={navigate} />);
  return { ...view, navigate };
}

const status = () => screen.getByRole("combobox", { name: "Status" }) as HTMLSelectElement;

it("AUT-06.1 lists own challenges with title, language, difficulty, status and View challenge", async () => {
  setup(vi.fn<ReadPage>().mockResolvedValue(ok([card(1), card(2, "published"), card(3, "unpublished"), card(4, "archived")])));
  await screen.findByText("Challenge 1");
  const rows = ["Draft", "Published", "Unpublished", "Archived"];
  for (const [index, label] of rows.entries()) {
    const row = screen.getByText(`Challenge ${index + 1}`).closest("li, tr, article") as HTMLElement;
    expect(row).not.toBeNull();
    const scope = within(row);
    expect(scope.getByText("Python")).toBeTruthy();
    expect(scope.getByText("Medium")).toBeTruthy();
    expect(scope.getByText(label)).toBeTruthy();
    expect(scope.getByRole("link", { name: "View challenge" }).getAttribute("href")).toBe(`${listHref}/${card(index + 1).id}`);
  }
  expect(action("Create challenge").getAttribute("href")).toBe(`${listHref}/new`);
});

it("AUT-06.1 offers a labelled Status filter for every lifecycle state and reads the filtered list", async () => {
  const readPage = vi.fn<ReadPage>().mockResolvedValue(ok([card(1)]));
  setup(readPage);
  await screen.findByText("Challenge 1");
  expect(Array.from(status().options).map((o) => [o.value, o.text])).toEqual([
    ["", "All statuses"], ["draft", "Draft"], ["published", "Published"], ["unpublished", "Unpublished"], ["archived", "Archived"],
  ]);
  fireEvent.change(status(), { target: { value: "archived" } });
  await waitFor(() => expect(readPage).toHaveBeenLastCalledWith("status=archived"));
  expect(status().value).toBe("archived");
});

it("AUT-06.1 shows No challenges yet. with Create challenge when the Author has none", async () => {
  setup(vi.fn<ReadPage>().mockResolvedValue(ok([])));
  await screen.findByText("No challenges yet.");
  expect(action("Create challenge").getAttribute("href")).toBe(`${listHref}/new`);
  expect(screen.queryByText("No matching challenges.")).toBeNull();
});

it("AUT-06.1 shows No matching challenges. with Clear filter for an empty filtered list", async () => {
  const readPage = vi.fn<ReadPage>().mockImplementation(async (search) => ok(search ? [] : [card(1)]));
  setup(readPage, "status=archived");
  await screen.findByText("No matching challenges.");
  expect(screen.queryByText("No challenges yet.")).toBeNull();
  fireEvent.click(action("Clear filter"));
  await screen.findByText("Challenge 1");
  expect(readPage).toHaveBeenLastCalledWith("");
  expect(status().value).toBe("");
});

it("AUT-06.1 Load more appends the next bounded page and blocks repeat loading while pending", async () => {
  const next = pending<PageResult>();
  const readPage = vi.fn<ReadPage>().mockResolvedValueOnce(ok([card(1)], "cursor-1")).mockReturnValueOnce(next.promise);
  setup(readPage, "status=draft");
  await screen.findByText("Challenge 1");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect((screen.getByRole("button", { name: /Load/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Load/ }));
  expect(readPage).toHaveBeenCalledTimes(2);
  expect(Object.fromEntries(new URLSearchParams(readPage.mock.calls[1][0]))).toEqual({ status: "draft", cursor: "cursor-1" });
  await act(async () => next.resolve(ok([card(2)])));
  await screen.findByText("Challenge 2");
  expect(screen.getByText("Challenge 1")).toBeTruthy();
  expect(queryAction("Load more")).toBeNull();
});

it("AUT-06.1 a read failure offers Try again and never shows a false empty list", async () => {
  const readPage = vi.fn<ReadPage>().mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValueOnce(ok([card(1)]));
  setup(readPage);
  await screen.findByText("We couldn't load your challenges. Try again.");
  expectAnnouncement("We couldn't load your challenges. Try again.");
  expect(screen.queryByText("No challenges yet.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Challenge 1");
  expect(readPage).toHaveBeenCalledTimes(2);
});

it("AUT-06.1 an invalid filter or cursor offers clearing the filter instead of an empty success", async () => {
  const readPage = vi.fn<ReadPage>().mockImplementation(async (search) => (search ? { status: "invalid" } : ok([card(1)])));
  setup(readPage, "status=retired");
  await waitFor(() => expect(queryAction("Clear filter")).not.toBeNull());
  expect(screen.queryByText("No challenges yet.")).toBeNull();
  expect(screen.queryByText("No matching challenges.")).toBeNull();
  fireEvent.click(action("Clear filter"));
  await screen.findByText("Challenge 1");
});

it("SYS-02.2 renders challenge titles inert", async () => {
  const hostile = { ...card(1), title: '<img src="https://example.test/x.png" onerror="alert(1)">' };
  const { container } = setup(vi.fn<ReadPage>().mockResolvedValue(ok([hostile])));
  await screen.findByText(hostile.title);
  expect(container.querySelector("img")).toBeNull();
});
