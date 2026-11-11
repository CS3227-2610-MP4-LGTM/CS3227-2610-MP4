/// <reference types="vite/client" />
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import {
  action, archived, dialog, draft, expectAnnouncement, listHref, pending, queryAction, uuid, withProposals, type Draft,
} from "./evidence";

/**
 * T-21 interface: `GenerateProposals({ draft, unsaved?, generate, onGenerated, reload })`.
 * `generate(body, idempotencyKey)` resolves to `{ status, draft? }` (client.generateProposals).
 */
type Body = { expectedRowVersion: number; expectedDraftVersion: number };
type Result = { status: string; draft?: Draft };
type Generate = (body: Body, key: string) => Promise<Result>;

afterEach(cleanup);

const componentPath = "/src/components/author/generate-proposals.tsx";
const components = import.meta.glob<{ GenerateProposals: ComponentType<Record<string, unknown>> }>("/src/components/author/generate-proposals.tsx");

async function load() {
  if (!components[componentPath]) throw new Error(`Missing T-21 component: ${componentPath}`);
  return (await components[componentPath]()).GenerateProposals;
}

async function setup(initial: Draft = draft, generate = vi.fn<Generate>(), unsaved = false) {
  const onGenerated = vi.fn<(next: Draft) => void>();
  const reload = vi.fn<() => void>();
  const GenerateProposals = await load();
  const view = render(<GenerateProposals draft={initial} unsaved={unsaved} generate={generate}
    onGenerated={onGenerated} reload={reload} />);
  return { ...view, generate, onGenerated, reload };
}

const generateButton = () => screen.getByRole("button", { name: "Generate proposals" }) as HTMLButtonElement;
const configurationHref = `${listHref}/${draft.id}/configuration`;
const generated = { ...withProposals, rowVersion: 2, draftVersion: 2 };

it("AUT-03.1 AUT-02.1 shows the saved count, categories and difficulty above Generate proposals with a route back", async () => {
  await setup();
  const button = generateButton();
  for (const text of [/Logic bug/, /Edge case/, /Easy/, /\b2\b/]) {
    const [shown] = screen.getAllByText(text);
    expect(shown.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
  expect(action("Back to configuration").getAttribute("href")).toBe(configurationHref);
});

it("AUT-03.1 AUT-02.3 unsaved edits block generation with the exact message and no request", async () => {
  const { generate } = await setup(draft, vi.fn<Generate>(), true);
  fireEvent.click(generateButton());
  expect(screen.getByText("Save your changes before generating proposals.")).toBeTruthy();
  expect(generate).not.toHaveBeenCalled();
});

it("AUT-03.1 an archived draft offers no generation", async () => {
  await setup(archived);
  expect(queryAction("Generate proposals")).toBeNull();
});

it("AUT-03.2 AUT-03.7 shows pending generation, blocks repeats and sends saved versions with one key", async () => {
  const request = pending<Result>();
  const { generate, onGenerated } = await setup(draft, vi.fn<Generate>().mockReturnValue(request.promise));
  fireEvent.click(generateButton());
  expectAnnouncement("Generating proposals…");
  const busy = screen.getByRole("button", { name: /Generat/ }) as HTMLButtonElement;
  expect(busy.disabled).toBe(true);
  fireEvent.click(busy);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][0]).toEqual({ expectedRowVersion: 1, expectedDraftVersion: 1 });
  expect(generate.mock.calls[0][1]).toMatch(uuid);
  await act(async () => request.resolve({ status: "ok", draft: generated }));
  expect(onGenerated).toHaveBeenCalledWith(generated);
});

it("AUT-03.4 confirms before replacing an existing set; Cancel keeps it without a request", async () => {
  const { generate, onGenerated } = await setup(withProposals, vi.fn<Generate>().mockResolvedValue({ status: "ok", draft: generated }));
  fireEvent.click(generateButton());
  const confirm = dialog();
  expect(confirm).not.toBeNull();
  expect(within(confirm!).getByText("New proposals replace the current proposals and reset their decisions.")).toBeTruthy();
  fireEvent.click(within(confirm!).getByRole("button", { name: "Cancel" }));
  expect(dialog()).toBeNull();
  expect(generate).not.toHaveBeenCalled();

  fireEvent.click(generateButton());
  await act(async () => fireEvent.click(within(dialog()!).getByRole("button", { name: "Generate new proposals" })));
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][0]).toEqual({ expectedRowVersion: 3, expectedDraftVersion: 2 });
  expect(onGenerated).toHaveBeenCalledWith(generated);
});

it.each([
  ["AUT-03.3", "invalid_output", "The AI returned invalid proposals. Try again.", true],
  ["AUT-03.6", "limited", "AI generation is unavailable within the current limits. Try again later.", null],
  ["AUT-03.6", "too_large", "This draft is too large for AI generation. Reduce it before trying again.", false],
  ["AUT-03.6", "timeout", "Proposal generation timed out. Try again.", true],
  ["AUT-03.6", "failed", "We couldn't generate proposals right now. Try again.", true],
] as const)("%s shows the %s failure, keeps saved data and offers Back to configuration", async (_id, status, message, retry) => {
  const { generate, onGenerated } = await setup(withProposals, vi.fn<Generate>().mockResolvedValue({ status }));
  fireEvent.click(generateButton());
  await act(async () => fireEvent.click(within(dialog()!).getByRole("button", { name: "Generate new proposals" })));
  await screen.findByText(message);
  expectAnnouncement(message);
  expect(onGenerated).not.toHaveBeenCalled();
  expect(action("Back to configuration").getAttribute("href")).toBe(configurationHref);
  if (retry === false) expect(queryAction("Try again")).toBeNull();
  if (retry === true) {
    // A confirmed failure permits a new explicit attempt under a new key.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][1]).toMatch(uuid);
    expect(generate.mock.calls[1][1]).not.toBe(generate.mock.calls[0][1]);
  }
});

it("AUT-03.5 a changed or archived draft asks for a reload without retrying generation", async () => {
  const { generate, reload, onGenerated } = await setup(draft, vi.fn<Generate>().mockResolvedValue({ status: "conflict" }));
  await act(async () => fireEvent.click(generateButton()));
  await screen.findByText("This draft changed. Reload it before generating proposals.");
  expect(queryAction("Try again")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reload draft" }));
  expect(reload).toHaveBeenCalledTimes(1);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(onGenerated).not.toHaveBeenCalled();
});

it("AUT-03.7 an unconfirmed generation offers Check generation with the same key and body", async () => {
  const generate = vi.fn<Generate>().mockResolvedValueOnce({ status: "uncertain" }).mockResolvedValueOnce({ status: "ok", draft: generated });
  const { onGenerated } = await setup(draft, generate);
  await act(async () => fireEvent.click(generateButton()));
  await screen.findByText("We couldn't confirm proposal generation.");
  expect(onGenerated).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Check generation" })));
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[1]).toEqual(generate.mock.calls[0]);
  expect(onGenerated).toHaveBeenCalledWith(generated);
});

it("AUT-03.5 account failures stop without replaying generation", async () => {
  const { generate } = await setup(draft, vi.fn<Generate>().mockResolvedValue({ status: "unauthenticated" }));
  await act(async () => fireEvent.click(generateButton()));
  expect(generate).toHaveBeenCalledTimes(1);
  expect(queryAction("Try again")).toBeNull();
  expect(queryAction("Check generation")).toBeNull();
});
