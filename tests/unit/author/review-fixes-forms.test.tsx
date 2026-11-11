// Fix round 1 supplemental tests for T-20 review finding REV-04.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EditDraftForm } from "@/components/author/edit-draft-form";
import { draft, withProposals, dialog, type Draft } from "./evidence";

type Save = (patch: Record<string, unknown>) => Promise<{ status: string; draft?: Draft }>;

afterEach(cleanup);

function setup(initial: Draft = draft) {
  const save = vi.fn<Save>();
  render(<EditDraftForm draft={initial} save={save} reload={vi.fn()} navigate={vi.fn()} />);
  return { save };
}

const saveButton = () => screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;

it.each([
  ["Title", "title", (value: string) => `  ${value}\t`],
  ["Description", "description", (value: string) => `\n${value}  \n`],
] as const)("AUT-06.3 REV-04 surrounding whitespace alone in %s is not a change and saves nothing", (label, field, pad) => {
  const { save } = setup(withProposals);
  fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value: pad(withProposals[field]) } });
  expect(saveButton().disabled).toBe(true);
  fireEvent.click(saveButton());
  expect(dialog()).toBeNull();
  expect(save).not.toHaveBeenCalled();
});
