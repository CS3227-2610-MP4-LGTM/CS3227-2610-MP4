import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FlawConfiguration } from "@/components/author/flaw-configuration";
import { draft, queryAction, uuid, withProposals, type Draft } from "./evidence";

/**
 * T-21 interface: FlawConfiguration accepts optional `generate(body, key)` and
 * `onGenerated(draft)` props and renders the shared “Generate proposals” action,
 * passing it whether the form holds unsaved changes.
 */
type Result = { status: string; draft?: Draft };
type Generate = (body: { expectedRowVersion: number; expectedDraftVersion: number }, key: string) => Promise<Result>;

afterEach(cleanup);

function setup(initial: Draft = draft, generate = vi.fn<Generate>()) {
  const onGenerated = vi.fn<(next: Draft) => void>();
  const props = {
    draft: initial, save: vi.fn().mockResolvedValue({ status: "failed" }),
    reload: vi.fn().mockResolvedValue({ status: "ok", draft: initial }), navigate: vi.fn(), generate, onGenerated,
  } as unknown as Parameters<typeof FlawConfiguration>[0];
  render(<FlawConfiguration {...props} />);
  return { generate, onGenerated };
}

it("AUT-02.3 AUT-03.1 offers Generate proposals for saved current configuration and starts it explicitly", async () => {
  const generated = { ...withProposals, rowVersion: 2, draftVersion: 2 };
  const { generate, onGenerated } = setup(draft, vi.fn<Generate>().mockResolvedValue({ status: "ok", draft: generated }));
  expect(generate).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Generate proposals" })));
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][0]).toEqual({ expectedRowVersion: 1, expectedDraftVersion: 1 });
  expect(generate.mock.calls[0][1]).toMatch(uuid);
  expect(onGenerated).toHaveBeenCalledWith(generated);
});

it("AUT-02.3 AUT-03.1 unsaved configuration changes block generation with the exact message", () => {
  const { generate } = setup();
  fireEvent.change(screen.getByLabelText("Flaw count"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate proposals" }));
  expect(screen.getByText("Save your changes before generating proposals.")).toBeTruthy();
  expect(generate).not.toHaveBeenCalled();
});

it("AUT-02.3 saving configuration does not request proposals", async () => {
  const { generate } = setup();
  fireEvent.change(screen.getByLabelText("Flaw count"), { target: { value: "3" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save configuration" })));
  expect(generate).not.toHaveBeenCalled();
  expect(queryAction("Generate proposals")).toBeTruthy();
});
