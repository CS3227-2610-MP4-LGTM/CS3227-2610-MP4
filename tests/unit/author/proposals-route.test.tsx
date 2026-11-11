import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { withProposals } from "./evidence";

const mocks = vi.hoisted(() => ({ readDraft: vi.fn(), decideProposal: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/author/client", () => ({
  readDraft: mocks.readDraft, decideProposal: mocks.decideProposal, readFinalPreview: vi.fn(),
  generateProposals: vi.fn(), createDraft: vi.fn(), patchDraft: vi.fn(), readChallengePage: vi.fn(),
}));

const { ProposalsRoute } = await import("@/components/author/author-routes");
const { rememberProposalsGenerated } = await import("@/components/author/notices");

const arrival = "Proposals generated. Review every proposal before publishing.";

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.readDraft.mockReset().mockResolvedValue({ status: "ok", draft: withProposals });
  mocks.decideProposal.mockReset().mockResolvedValue({ status: "conflict" });
});
afterEach(cleanup);

it("AUT-03.2 SYS-17.1 announces a generation once and a reload neither repeats it nor moves focus", async () => {
  rememberProposalsGenerated(withProposals.id);
  render(<ProposalsRoute challengeId={withProposals.id} />);
  const heading = await screen.findByRole("heading", { level: 1, name: "Proposal preview" });
  await waitFor(() => expect(screen.getByText(arrival)).toBeTruthy());
  expect(document.activeElement).toBe(heading);

  // A stale decision offers “Reload draft”, which rereads the saved draft.
  const item = within(screen.getByRole("list", { name: "Proposals" })).getAllByRole("listitem")[0];
  fireEvent.click(within(item).getByRole("button", { name: "Approve" }));
  fireEvent.click(await screen.findByRole("button", { name: "Reload draft" }));
  await waitFor(() => expect(mocks.readDraft).toHaveBeenCalledTimes(2));
  const reloaded = await screen.findByRole("heading", { level: 1, name: "Proposal preview" });
  expect(screen.queryByText(arrival)).toBeNull();
  expect(document.activeElement).not.toBe(reloaded);
});
