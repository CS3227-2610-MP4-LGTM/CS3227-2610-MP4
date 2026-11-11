import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { ProposalPreview as Existing } from "@/components/author/proposal-preview";
import { dialog, draft, pending, queryAction, revisionId, uuid, workingCode } from "./evidence";

/**
 * T-22 interface: `ProposalPreview` gains optional `publish(body, idempotencyKey)` and
 * `onPublished(publication)` props. “Publish challenge” appears beside the shown final preview only.
 */
const ProposalPreview = Existing as unknown as ComponentType<Record<string, unknown>>;

type Decision = "pending" | "approved" | "rejected";
type Publication = { id: string; status: string; rowVersion: number; revisionId: string; revisionNumber: number; publishedAt: string };
type Publish = (body: { expectedRowVersion: number; expectedDraftVersion: number }, key: string) => Promise<{ status: string; publication?: Publication }>;

afterEach(cleanup);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const signature = {
  id: id(1101), category: "edge_case", sourceStartLine: 1, sourceEndLine: 1,
  originalSnippet: "function total(items) {", replacementSnippet: "function total(items, skip) {",
  explanation: "Callers can skip items silently.", fix: "Remove the skip parameter.", decision: "pending" as Decision,
};
const count = {
  id: id(1102), category: "logic_bug", sourceStartLine: 2, sourceEndLine: 2,
  originalSnippet: "  return items.length;", replacementSnippet: "  return items.length - 1;",
  explanation: "Undercounts every basket by one.", fix: "Return the full length.", decision: "pending" as Decision,
};
const active = { ...draft, rowVersion: 3, draftVersion: 2, generationId: id(1003), proposals: [signature, count] };
const decided = (a: Decision, b: Decision) => ({ ...active, proposals: [{ ...signature, decision: a }, { ...count, decision: b }] });
const finalPreview = {
  draftVersion: 2,
  code: {
    path: "challenge.js", before: workingCode, after: "function total(items) {\n  return items.length - 1;\n}\n",
    hunks: [{ oldStart: 1, oldCount: 3, newStart: 1, newCount: 3, lines: [
      { kind: "context", text: "function total(items) {", oldLine: 1, newLine: 1 },
      { kind: "removed", text: "  return items.length;", oldLine: 2, newLine: null },
      { kind: "added", text: "  return items.length - 1;", oldLine: null, newLine: 2 },
      { kind: "context", text: "}", oldLine: 3, newLine: 3 },
    ] }],
  },
  flaws: [{
    proposalId: count.id, category: "logic_bug", originalSnippet: count.originalSnippet,
    replacementSnippet: count.replacementSnippet, sourceStartLine: 2, sourceEndLine: 2, startLine: 2, endLine: 2,
    explanation: count.explanation, fix: count.fix,
  }],
};
const publication: Publication = {
  id: draft.id, status: "published", rowVersion: 4, revisionId, revisionNumber: 1, publishedAt: "2026-11-11T08:00:00.000Z",
};

function setup(initial = decided("rejected", "approved"), options: { publish?: Publish; decide?: ReturnType<typeof vi.fn>; generate?: ReturnType<typeof vi.fn> } = {}) {
  const publish = options.publish ?? vi.fn<Publish>().mockResolvedValue({ status: "ok", publication });
  const onPublished = vi.fn<(result: Publication) => void>();
  const view = render(<ProposalPreview draft={initial} decide={options.decide ?? vi.fn()}
    readPreview={vi.fn().mockResolvedValue({ status: "ok", preview: finalPreview })} reload={vi.fn()}
    generate={options.generate ?? vi.fn()} publish={publish} onPublished={onPublished} />);
  return { ...view, publish: publish as ReturnType<typeof vi.fn<Publish>>, onPublished };
}

async function showPreview() {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Preview final challenge" })));
  expect(screen.getByRole("region", { name: "Final challenge preview" })).toBeTruthy();
}

const unavailable = (name: string) => {
  const control = queryAction(name) as HTMLButtonElement | null;
  return control === null || control.disabled;
};

it("AUT-05.1 Publish challenge follows the shown final preview and is absent before it", async () => {
  const { publish } = setup();
  expect(queryAction("Publish challenge")).toBeNull();
  await showPreview();
  const region = screen.getByRole("region", { name: "Final challenge preview" });
  const button = screen.getByRole("button", { name: "Publish challenge" });
  expect(region.contains(button)
    || Boolean(region.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  expect(publish).not.toHaveBeenCalled();
});

it.each([
  ["pending decisions", decided("approved", "pending")],
  ["no approvals", decided("rejected", "rejected")],
  ["no proposals", { ...draft, proposals: [] }],
])("AUT-05.1 offers no publication with %s", (_case, initial) => {
  setup(initial as never);
  expect(queryAction("Publish challenge")).toBeNull();
});

it("AUT-04.4 AUT-05.1 a saved decision change withdraws the publication action with the stale preview", async () => {
  const decide = vi.fn().mockResolvedValue({ status: "ok", draft: { ...decided("approved", "approved"), rowVersion: 4, draftVersion: 3 } });
  setup(decided("rejected", "approved"), { decide });
  await showPreview();
  expect(screen.getByRole("button", { name: "Publish challenge" })).toBeTruthy();
  const first = within(screen.getByRole("list", { name: "Proposals" })).getAllByRole("listitem")[0];
  await act(async () => fireEvent.click(within(first).getByRole("button", { name: "Approve" })));
  expect(queryAction("Publish challenge")).toBeNull();
});

it("AUT-05.2 AUT-05.3 publishes the previewed draft's versions once and hands over the publication", async () => {
  const { publish, onPublished } = setup();
  await showPreview();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish challenge" })));
  expect(publish).toHaveBeenCalledTimes(1);
  expect(publish.mock.calls[0][0]).toEqual({ expectedRowVersion: 3, expectedDraftVersion: 2 });
  expect(publish.mock.calls[0][1]).toMatch(uuid);
  expect(onPublished).toHaveBeenCalledWith(publication);
});

it("AUT-05.2 pending publication disables generation", async () => {
  const request = pending<{ status: string; publication?: Publication }>();
  const generate = vi.fn();
  setup(decided("rejected", "approved"), { publish: vi.fn<Publish>().mockReturnValue(request.promise), generate });
  await showPreview();
  fireEvent.click(screen.getByRole("button", { name: "Publish challenge" }));
  expect(unavailable("Generate proposals")).toBe(true);
  expect(generate).not.toHaveBeenCalled();
  await act(async () => request.resolve({ status: "ok", publication }));
});

it("AUT-03.2 pending generation disables publication", async () => {
  const request = pending<{ status: string }>();
  const { publish } = setup(decided("rejected", "approved"), { generate: vi.fn().mockReturnValue(request.promise) });
  await showPreview();
  fireEvent.click(screen.getByRole("button", { name: "Generate proposals" }));
  fireEvent.click(within(dialog()!).getByRole("button", { name: "Generate new proposals" }));
  expect(unavailable("Publish challenge")).toBe(true);
  expect(publish).not.toHaveBeenCalled();
  await act(async () => request.resolve({ status: "failed" }));
});
