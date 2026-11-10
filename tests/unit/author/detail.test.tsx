import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthorChallengeDetail } from "@/components/author/challenge-detail";
import { action, archived, draft, listHref, published, queryAction, type Draft } from "./evidence";

type Read = () => Promise<{ status: string; draft?: Draft }>;

afterEach(cleanup);

function setup(read: Read) {
  return render(<AuthorChallengeDetail challengeId={draft.id} read={read} />);
}

it("AUT-06.2 shows lifecycle status, the working draft and its actions for an editable draft", async () => {
  setup(vi.fn<Read>().mockResolvedValue({ status: "ok", draft }));
  await screen.findByRole("heading", { name: draft.title });
  expect(screen.getByText("Draft")).toBeTruthy();
  expect(screen.getByText(draft.description)).toBeTruthy();
  expect(screen.getByText("JavaScript")).toBeTruthy();
  expect(screen.getByText("Easy")).toBeTruthy();
  expect(screen.getAllByText(/return items\.length;/).length).toBeGreaterThan(0);
  expect(action("Edit draft").getAttribute("href")).toBe(`${listHref}/${draft.id}/edit`);
  expect(action("Back to challenges").getAttribute("href")).toBe(listHref);
});

it("AUT-06.2 distinguishes a live published revision from the working draft", async () => {
  setup(vi.fn<Read>().mockResolvedValue({ status: "ok", draft: { ...published, title: "Edited working title" } }));
  await screen.findByRole("heading", { name: "Edited working title" });
  expect(screen.getByText("Published")).toBeTruthy();
  expect(screen.getAllByText(/published revision/i).length).toBeGreaterThan(0);
  expect(action("Edit draft")).toBeTruthy();
});

it("AUT-06.2 AUT-02.6 shows an archived challenge read-only without Edit draft", async () => {
  setup(vi.fn<Read>().mockResolvedValue({ status: "ok", draft: archived }));
  await screen.findByText("Archived challenges can't be edited.");
  expect(screen.getByText("Archived")).toBeTruthy();
  expect(queryAction("Edit draft")).toBeNull();
  expect(action("Back to challenges")).toBeTruthy();
});

it("AUT-06.2 shows Challenge not found with Back to challenges", async () => {
  setup(vi.fn<Read>().mockResolvedValue({ status: "not_found" }));
  await screen.findByText("Challenge not found.");
  expect(action("Back to challenges").getAttribute("href")).toBe(listHref);
  expect(queryAction("Edit draft")).toBeNull();
});

it("AUT-06.2 a read failure offers Try again, never an empty detail", async () => {
  const read = vi.fn<Read>().mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValueOnce({ status: "ok", draft });
  setup(read);
  await screen.findByText("We couldn't load this challenge. Try again.");
  expect(queryAction("Edit draft")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: draft.title });
  expect(read).toHaveBeenCalledTimes(2);
});

it("SYS-02.2 renders draft text and code inert", async () => {
  const hostile = {
    ...draft,
    title: "Totals <script>alert(1)</script>",
    description: '<img src="https://example.test/x.png" onerror="alert(1)">',
    workingCode: '// <img src="https://example.test/y.png" onerror="alert(2)">\nconst a = 1;\n',
  };
  const { container } = setup(vi.fn<Read>().mockResolvedValue({ status: "ok", draft: hostile }));
  await screen.findByRole("heading", { name: hostile.title });
  expect(screen.getByText(hostile.description)).toBeTruthy();
  expect(container.querySelector("img, script")).toBeNull();
  await waitFor(() => expect(container.textContent).toContain('onerror="alert(2)"'));
});
