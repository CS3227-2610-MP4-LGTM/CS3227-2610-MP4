import { screen, within } from "@testing-library/react";
import { expect } from "vitest";

export const challengeId = "00000000-0000-4000-8000-000000000101";
export const revisionId = "00000000-0000-4000-8000-000000000201";
export const proposalId = "00000000-0000-4000-8000-000000001103";
export const listHref = "/author/challenges";
export const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export const workingCode = "function total(items) {\n  return items.length;\n}\n";

export const draft = {
  id: challengeId,
  status: "draft" as const,
  rowVersion: 1,
  publishedRevisionId: null as string | null,
  draftVersion: 1,
  title: "Checkout totals",
  description: "Review the changes to discounts and basket totals.",
  language: "javascript" as const,
  difficulty: "easy" as const,
  workingCode,
  flawCount: 2,
  categories: ["logic_bug", "edge_case"] as string[],
  generationId: null as string | null,
  proposals: [] as unknown[],
};

export type Draft = typeof draft;

export const withProposals: Draft = {
  ...draft,
  rowVersion: 3,
  draftVersion: 2,
  generationId: "00000000-0000-4000-8000-000000001003",
  proposals: [{
    id: proposalId, key: "p0", category: "logic_bug", sourceStartLine: 2, sourceEndLine: 2,
    originalSnippet: "  return items.length;", replacementSnippet: "  return items.length - 1;",
    explanation: "Off by one.", fix: "Return the length.", decision: "pending",
  }],
};

export const published: Draft = { ...draft, status: "published" as never, publishedRevisionId: revisionId, rowVersion: 4 };
export const archived: Draft = { ...draft, status: "archived" as never, rowVersion: 5 };

export function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

/** A button or link with this exact accessible name. */
export function action(name: string) {
  return screen.queryByRole("button", { name }) ?? screen.getByRole("link", { name });
}

export function queryAction(name: string) {
  return screen.queryByRole("button", { name }) ?? screen.queryByRole("link", { name });
}

export function expectAnnouncement(message: string) {
  const element = screen.getByText(message);
  expect(element.closest('[role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]')).not.toBeNull();
}

export function describedBy(element: HTMLElement) {
  const ids = element.getAttribute("aria-describedby")?.split(/\s+/).filter(Boolean) ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
}

/** The field shows the message beside it, is marked invalid and references the message. */
export function expectFieldError(field: HTMLElement, message: string) {
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(describedBy(field)).toContain(message);
}

export function categoryGroup() {
  return within(screen.getByRole("group", { name: "Flaw categories" }));
}

export function categoryBox(label: string) {
  return categoryGroup().getByRole("checkbox", { name: label }) as HTMLInputElement;
}

export const categoryLabels = ["Logic bug", "Edge case", "Error handling", "Security", "Performance"];

/** Flaw count may be a select or a number input; either must expose only 1–5. */
export function expectFlawCountRange(control: HTMLElement) {
  if (control instanceof HTMLSelectElement) {
    expect(Array.from(control.options).filter((option) => option.value !== "").map((option) => option.value))
      .toEqual(["1", "2", "3", "4", "5"]);
  } else {
    expect(control.getAttribute("min")).toBe("1");
    expect(control.getAttribute("max")).toBe("5");
  }
}

export function dialog() {
  return screen.queryByRole("alertdialog") ?? screen.queryByRole("dialog");
}
