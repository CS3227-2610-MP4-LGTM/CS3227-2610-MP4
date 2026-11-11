/// <reference types="vite/client" />
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import type { CodeDiff } from "@/lib/code-diff";
import { action, archived, draft, expectAnnouncement, listHref, pending, queryAction, workingCode } from "./evidence";

/**
 * T-21 interface: `ProposalPreview({ draft, generated?, decide, readPreview, reload, generate })`.
 * Proposals render as list items of a list named "Proposals"; the final preview is a
 * region named "Final challenge preview". Source ranges read "Source line N" or
 * "Source lines N–M"; final ranges read "Final line N" or "Final lines N–M".
 */
type Decision = "pending" | "approved" | "rejected";
type Proposal = {
  id: string; category: string; sourceStartLine: number; sourceEndLine: number; originalSnippet: string;
  replacementSnippet: string; explanation: string; fix: string; decision: Decision;
};
type View = Omit<typeof draft, "proposals"> & { proposals: Proposal[] };
type DecideBody = { expectedRowVersion: number; expectedDraftVersion: number; decision: "approved" | "rejected" };
type Decide = (proposalId: string, body: DecideBody) => Promise<{ status: string; draft?: View }>;
type Preview = { draftVersion: number; code: CodeDiff; flaws: Record<string, unknown>[] };
type ReadPreview = () => Promise<{ status: string; preview?: Preview }>;

afterEach(cleanup);

const componentPath = "/src/components/author/proposal-preview.tsx";
const components = import.meta.glob<{ ProposalPreview: ComponentType<Record<string, unknown>> }>("/src/components/author/proposal-preview.tsx");

async function load() {
  if (!components[componentPath]) throw new Error(`Missing T-21 component: ${componentPath}`);
  return (await components[componentPath]()).ProposalPreview;
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const signature: Proposal = {
  id: id(1101), category: "edge_case", sourceStartLine: 1, sourceEndLine: 1,
  originalSnippet: "function total(items) {", replacementSnippet: "function total(items, skip) {",
  explanation: "Callers can skip items silently.", fix: "Remove the skip parameter.", decision: "pending",
};
const count: Proposal = {
  id: id(1102), category: "logic_bug", sourceStartLine: 2, sourceEndLine: 2,
  originalSnippet: "  return items.length;", replacementSnippet: "  return items.length - 1;",
  explanation: "Undercounts every basket by one.", fix: "Return the full length.", decision: "pending",
};
const active: View = {
  ...draft, rowVersion: 3, draftVersion: 2, generationId: id(1003), proposals: [signature, count],
};
const decided = (a: Decision, b: Decision): View => ({
  ...active, proposals: [{ ...signature, decision: a }, { ...count, decision: b }],
});
const flawedCode = "function total(items) {\n  return items.length - 1;\n}\n";
const finalPreview: Preview = {
  draftVersion: 2,
  code: {
    path: "challenge.js", before: workingCode, after: flawedCode,
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

async function setup(initial: View = active, options: { decide?: Decide; readPreview?: ReadPreview; generated?: boolean } = {}) {
  const decide = options.decide ?? vi.fn<Decide>();
  const readPreview = options.readPreview ?? vi.fn<ReadPreview>().mockResolvedValue({ status: "ok", preview: finalPreview });
  const reload = vi.fn<() => void>();
  const generate = vi.fn();
  const ProposalPreview = await load();
  const view = render(<ProposalPreview draft={initial} generated={options.generated} decide={decide}
    readPreview={readPreview} reload={reload} generate={generate} />);
  return { ...view, decide: decide as ReturnType<typeof vi.fn<Decide>>, readPreview: readPreview as ReturnType<typeof vi.fn<ReadPreview>>, reload, generate };
}

function items() {
  return within(screen.getByRole("list", { name: "Proposals" })).getAllByRole("listitem");
}
const button = (item: HTMLElement, name: string) => within(item).getByRole("button", { name }) as HTMLButtonElement;
const configurationHref = `${listHref}/${draft.id}/configuration`;

it("AUT-04.1 lists every proposal with its evidence, Pending decision and per-proposal actions without any request", async () => {
  const { decide, readPreview, generate } = await setup();
  const [first, second] = items();
  expect(items()).toHaveLength(2);
  for (const [item, proposal, label] of [[first, signature, "Edge case"], [second, count, "Logic bug"]] as const) {
    const text = item.textContent ?? "";
    expect(text).toContain(label);
    expect(text).toMatch(new RegExp(`Source line ${proposal.sourceStartLine}\\b`));
    for (const value of [proposal.originalSnippet, proposal.replacementSnippet, proposal.explanation, proposal.fix]) {
      expect(text).toContain(value.trim());
    }
    expect(text).toContain("Pending");
    expect(button(item, "Approve")).toBeTruthy();
    expect(button(item, "Reject")).toBeTruthy();
  }
  expect(screen.getAllByText(/AI-generated/i).length).toBeGreaterThan(0);
  expect(decide).not.toHaveBeenCalled();
  expect(readPreview).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});

it("AUT-04.1 shows a multi-line source range", async () => {
  await setup({ ...active, proposals: [{ ...signature, sourceEndLine: 2, originalSnippet: "function total(items) {\n  return items.length;" }] });
  expect(items()[0].textContent).toMatch(/Source lines 1–2/);
});

it("AUT-03.2 announces arrival after generation", async () => {
  await setup(active, { generated: true });
  expectAnnouncement("Proposals generated. Review every proposal before publishing.");
});

it("AUT-04.2 saves one decision with current versions, blocks repeats on that proposal and keeps focus there", async () => {
  const request = pending<{ status: string; draft?: View }>();
  const { decide } = await setup(active, { decide: vi.fn<Decide>().mockReturnValueOnce(request.promise) });
  const [first, second] = items();
  fireEvent.click(button(second, "Approve"));
  expectAnnouncement("Saving decision…");
  expect(button(second, "Approve").disabled).toBe(true);
  expect(button(second, "Reject").disabled).toBe(true);
  fireEvent.click(button(second, "Reject"));
  expect(decide).toHaveBeenCalledTimes(1);
  expect(decide).toHaveBeenCalledWith(count.id, { expectedRowVersion: 3, expectedDraftVersion: 2, decision: "approved" });
  const saved = { ...decided("pending", "approved"), rowVersion: 4, draftVersion: 3 };
  await act(async () => request.resolve({ status: "ok", draft: saved }));
  const updated = items()[1];
  expect(updated.textContent).toContain("Approved");
  expect(updated.contains(document.activeElement)).toBe(true);
  expect(first.textContent).toContain("Pending");

  decide.mockResolvedValueOnce({ status: "ok", draft: { ...decided("rejected", "approved"), rowVersion: 5, draftVersion: 4 } });
  await act(async () => fireEvent.click(button(items()[0], "Reject")));
  expect(decide).toHaveBeenLastCalledWith(signature.id, { expectedRowVersion: 4, expectedDraftVersion: 3, decision: "rejected" });
  expect(items()[0].textContent).toContain("Rejected");
});

it("AUT-04.2 lets the Author switch a saved decision and never edits the generated text", async () => {
  const { decide } = await setup(decided("approved", "approved"), {
    decide: vi.fn<Decide>().mockResolvedValue({ status: "ok", draft: { ...decided("rejected", "approved"), rowVersion: 4, draftVersion: 3 } }),
  });
  await act(async () => fireEvent.click(button(items()[0], "Reject")));
  expect(Object.keys(decide.mock.calls[0][1]).sort()).toEqual(["decision", "expectedDraftVersion", "expectedRowVersion"]);
  expect(items()[0].textContent).toContain("Rejected");
  expect(items()[0].textContent).toContain(signature.explanation);
});

it("AUT-04.3 incomplete decisions keep final preview unavailable while configuration and regeneration remain", async () => {
  await setup(decided("approved", "pending"));
  expect(screen.getByText("Decide every proposal to preview the final challenge.")).toBeTruthy();
  const preview = queryAction("Preview final challenge") as HTMLButtonElement | null;
  expect(preview === null || preview.disabled).toBe(true);
  expect(action("Back to configuration").getAttribute("href")).toBe(configurationHref);
  expect(screen.getByRole("button", { name: "Generate proposals" })).toBeTruthy();
});

it("AUT-04.3 all-rejected decisions keep final preview unavailable", async () => {
  await setup(decided("rejected", "rejected"));
  expect(screen.getByText("Approve at least one proposal to preview or publish.")).toBeTruthy();
  const preview = queryAction("Preview final challenge") as HTMLButtonElement | null;
  expect(preview === null || preview.disabled).toBe(true);
  expect(action("Back to configuration")).toBeTruthy();
});

it("AUT-04.4 shows the server-assembled candidate, real diff and retained answer material with final locations", async () => {
  const { readPreview } = await setup(decided("rejected", "approved"));
  expect(screen.queryByText("Decide every proposal to preview the final challenge.")).toBeNull();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Preview final challenge" })));
  expect(readPreview).toHaveBeenCalledTimes(1);
  const region = screen.getByRole("region", { name: "Final challenge preview" });
  const heading = within(region).getByRole("heading", { name: "Final challenge preview" });
  expect(document.activeElement).toBe(heading);
  const text = region.textContent ?? "";
  expect(text).toContain("return items.length - 1;");
  expect(text).toContain(count.explanation);
  expect(text).toContain(count.fix);
  expect(text).toMatch(/Final line 2\b/);
  expect(text).not.toContain(signature.replacementSnippet);
  expect(text).not.toContain(signature.explanation);
});

it("AUT-04.4 a saved decision change invalidates the shown preview", async () => {
  await setup(decided("rejected", "approved"), {
    decide: vi.fn<Decide>().mockResolvedValue({ status: "ok", draft: { ...decided("approved", "approved"), rowVersion: 4, draftVersion: 3 } }),
  });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Preview final challenge" })));
  expect(screen.getByRole("region", { name: "Final challenge preview" })).toBeTruthy();
  await act(async () => fireEvent.click(button(items()[0], "Approve")));
  expect(screen.queryByRole("region", { name: "Final challenge preview" })).toBeNull();
});

it("AUT-04.5 a failed decision keeps the last confirmed decision and asks to try again", async () => {
  await setup(active, { decide: vi.fn<Decide>().mockResolvedValue({ status: "failed" }) });
  await act(async () => fireEvent.click(button(items()[1], "Approve")));
  await screen.findByText("We couldn't save this decision. Try again.");
  expect(items()[1].textContent).toContain("Pending");
  expect(items()[1].textContent).not.toContain("Approved");
  expect(button(items()[1], "Approve").disabled).toBe(false);
});

it("AUT-04.5 an unconfirmed decision requires Refresh draft before any final preview", async () => {
  const { reload } = await setup(decided("rejected", "pending"), { decide: vi.fn<Decide>().mockResolvedValue({ status: "uncertain" }) });
  await act(async () => fireEvent.click(button(items()[1], "Approve")));
  await screen.findByText("We couldn't confirm this decision. Refresh the draft.");
  const preview = queryAction("Preview final challenge") as HTMLButtonElement | null;
  expect(preview === null || preview.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Refresh draft" }));
  expect(reload).toHaveBeenCalledTimes(1);
});

it("AUT-04.5 a version conflict asks for a reload without overwriting newer state", async () => {
  const { reload, decide } = await setup(active, { decide: vi.fn<Decide>().mockResolvedValue({ status: "conflict" }) });
  await act(async () => fireEvent.click(button(items()[0], "Reject")));
  await screen.findByText("This draft changed. Reload it before reviewing proposals.");
  fireEvent.click(screen.getByRole("button", { name: "Reload draft" }));
  expect(reload).toHaveBeenCalledTimes(1);
  expect(decide).toHaveBeenCalledTimes(1);
});

it("AUT-04.6 an invalidated or absent proposal set asks to generate proposals first", async () => {
  await setup({ ...draft, proposals: [] });
  expect(screen.getByText("Generate proposals before reviewing flaws.")).toBeTruthy();
  expect(action("Back to configuration").getAttribute("href")).toBe(configurationHref);
  expect(screen.queryByRole("list", { name: "Proposals" })).toBeNull();
  expect(queryAction("Preview final challenge")).toBeNull();
});

it("AUT-04.6 a preview read failure is never an empty preview and can be retried", async () => {
  const readPreview = vi.fn<ReadPreview>().mockResolvedValueOnce({ status: "unavailable" })
    .mockResolvedValueOnce({ status: "ok", preview: finalPreview });
  await setup(decided("rejected", "approved"), { readPreview });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Preview final challenge" })));
  await screen.findByText("We couldn't load the preview. Try again.");
  expect(screen.queryByRole("region", { name: "Final challenge preview" })).toBeNull();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
  expect(readPreview).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("region", { name: "Final challenge preview" })).toBeTruthy();
});

it("AUT-04.6 an archived draft shows proposals read-only", async () => {
  await setup({ ...archived, generationId: id(1003), proposals: [signature, count] } as View);
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  expect(queryAction("Generate proposals")).toBeNull();
});

it("AUT-04.1 SYS-02.2 SEC-02.2 renders hostile AI text and code inert", async () => {
  const hostile: Proposal = {
    ...count,
    replacementSnippet: '  return "<script>alert(1)</script>";',
    explanation: '<img src="https://example.test/x.png" onerror="alert(2)"> [click](https://example.test/run)',
    fix: '<a href="javascript:alert(3)" onclick="alert(4)">fix</a>',
  };
  const { container } = await setup({ ...active, proposals: [hostile] });
  const text = container.textContent ?? "";
  expect(text).toContain(hostile.replacementSnippet.trim());
  expect(text).toContain(hostile.explanation);
  expect(text).toContain(hostile.fix);
  expect(container.querySelector("script, img, iframe")).toBeNull();
  expect(container.querySelector('a[href^="javascript:"], a[href^="https://example.test"], [onerror], [onclick]')).toBeNull();
});
