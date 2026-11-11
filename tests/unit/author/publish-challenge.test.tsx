/// <reference types="vite/client" />
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import {
  action, archived, draft, expectAnnouncement, listHref, pending, queryAction, revisionId, uuid, type Draft,
} from "./evidence";

/**
 * T-22 interface: `PublishChallenge({ draft, flaws, publish, onPublished, reload })` in
 * `src/components/author/publish-challenge.tsx`. `flaws` are the final preview's retained flaws.
 * `publish(body, idempotencyKey)` resolves to `{ status, publication? }` (client.publishChallenge).
 */
type Body = { expectedRowVersion: number; expectedDraftVersion: number };
type Publication = {
  id: string; status: string; rowVersion: number; revisionId: string; revisionNumber: number; publishedAt: string;
};
type Result = { status: string; publication?: Publication };
type Publish = (body: Body, key: string) => Promise<Result>;

afterEach(cleanup);

const componentPath = "/src/components/author/publish-challenge.tsx";
const components = import.meta.glob<{ PublishChallenge: ComponentType<Record<string, unknown>> }>("/src/components/author/publish-challenge.tsx");

async function load() {
  if (!components[componentPath]) throw new Error(`Missing T-22 component: ${componentPath}`);
  return (await components[componentPath]()).PublishChallenge;
}

const proposalsHref = `${listHref}/${draft.id}/proposals`;
const decided: Draft = { ...draft, rowVersion: 5, draftVersion: 4, generationId: "00000000-0000-4000-8000-000000001003" };
const flaws = [{
  proposalId: "00000000-0000-4000-8000-000000001102", category: "logic_bug",
  originalSnippet: "  return items.length;", replacementSnippet: "  return items.length - 1;",
  sourceStartLine: 2, sourceEndLine: 2, startLine: 2, endLine: 2,
  explanation: "Undercounts every basket by one.", fix: "Return the full length.",
}];
const publication: Publication = {
  id: draft.id, status: "published", rowVersion: 6, revisionId, revisionNumber: 1, publishedAt: "2026-11-11T08:00:00.000Z",
};

async function setup(publish = vi.fn<Publish>(), initial: Draft = decided) {
  const onPublished = vi.fn<(result: Publication) => void>();
  const reload = vi.fn<() => void>();
  const PublishChallenge = await load();
  const props = { flaws, publish, onPublished, reload };
  const view = render(<PublishChallenge draft={initial} {...props} />);
  const update = (next: Draft) => view.rerender(<PublishChallenge draft={next} {...props} />);
  return { ...view, update, publish, onPublished, reload };
}

const publishButton = () => screen.getByRole("button", { name: "Publish challenge" }) as HTMLButtonElement;

it("AUT-05.1 shows a retained-flaw summary before Publish challenge and sends nothing until chosen", async () => {
  const { publish } = await setup();
  const button = publishButton();
  const [summary] = screen.getAllByText(/Logic bug/);
  expect(summary.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(publish).not.toHaveBeenCalled();
});

it("AUT-05.7 an archived challenge offers no publication", async () => {
  await setup(vi.fn<Publish>(), { ...archived, generationId: decided.generationId });
  expect(queryAction("Publish challenge")).toBeNull();
});

it("AUT-05.2 AUT-05.3 shows pending publication, blocks duplicates and reports the committed publication", async () => {
  const request = pending<Result>();
  const { publish, onPublished } = await setup(vi.fn<Publish>().mockReturnValue(request.promise));
  fireEvent.click(publishButton());
  expectAnnouncement("Preparing hints and publishing…");
  const busy = screen.getByRole("button", { name: /Publish/ }) as HTMLButtonElement;
  expect(busy.disabled).toBe(true);
  fireEvent.click(busy);
  expect(publish).toHaveBeenCalledTimes(1);
  expect(publish.mock.calls[0][0]).toEqual({ expectedRowVersion: 5, expectedDraftVersion: 4 });
  expect(publish.mock.calls[0][1]).toMatch(uuid);
  // Pending is never presented as published.
  expect(screen.queryByText("Challenge published.")).toBeNull();
  expect(onPublished).not.toHaveBeenCalled();
  await act(async () => request.resolve({ status: "ok", publication }));
  expect(onPublished).toHaveBeenCalledWith(publication);
});

it("AUT-05.1 an ineligible candidate shows the exact message with Back to proposal preview", async () => {
  const { onPublished } = await setup(vi.fn<Publish>().mockResolvedValue({ status: "ineligible" }));
  await act(async () => fireEvent.click(publishButton()));
  const message = "Review the current proposals and approve at least one flaw before publishing.";
  await screen.findByText(message);
  expectAnnouncement(message);
  expect(action("Back to proposal preview").getAttribute("href")).toBe(proposalsHref);
  expect(onPublished).not.toHaveBeenCalled();
});

it.each([
  ["invalid_output", "The AI returned invalid hints. The challenge wasn't published.", true],
  ["failed", "We couldn't publish the challenge right now.", true],
  ["limited", "Publication is unavailable within the current AI limits. Try again later.", null],
  ["too_large", "This candidate is too large for AI publication.", null],
] as const)("AUT-05.4 AUT-05.5 shows the %s failure with Back to proposal preview and no success", async (status, message, retry) => {
  const { publish, onPublished } = await setup(vi.fn<Publish>().mockResolvedValue({ status }));
  await act(async () => fireEvent.click(publishButton()));
  await screen.findByText(message);
  expectAnnouncement(message);
  expect(onPublished).not.toHaveBeenCalled();
  expect(screen.queryByText("Challenge published.")).toBeNull();
  expect(action("Back to proposal preview").getAttribute("href")).toBe(proposalsHref);
  if (retry) {
    // A confirmed failure permits a new explicit attempt under a new key.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try publishing again" })));
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1][1]).toMatch(uuid);
    expect(publish.mock.calls[1][1]).not.toBe(publish.mock.calls[0][1]);
  }
});

it("AUT-05.4 AUT-05.5 a timeout asks to check the same publication before another attempt", async () => {
  const publish = vi.fn<Publish>().mockResolvedValueOnce({ status: "timeout" }).mockResolvedValueOnce({ status: "timeout" });
  const { onPublished } = await setup(publish);
  await act(async () => fireEvent.click(publishButton()));
  const message = "Publication timed out. Check publication before trying again.";
  await screen.findByText(message);
  expectAnnouncement(message);
  expect(action("Back to proposal preview").getAttribute("href")).toBe(proposalsHref);
  expect(queryAction("Try publishing again")).toBeNull();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Check publication" })));
  expect(publish).toHaveBeenCalledTimes(2);
  expect(publish.mock.calls[1]).toEqual(publish.mock.calls[0]);
  // The checked operation is a confirmed failure, so a new explicit attempt is offered.
  expect(screen.getByRole("button", { name: "Try publishing again" })).toBeTruthy();
  expect(onPublished).not.toHaveBeenCalled();
});

it("AUT-05.5 an unconfirmed publication offers Check publication with the same key and body", async () => {
  const publish = vi.fn<Publish>().mockResolvedValueOnce({ status: "uncertain" }).mockResolvedValueOnce({ status: "ok", publication });
  const { onPublished } = await setup(publish);
  await act(async () => fireEvent.click(publishButton()));
  const check = await screen.findByRole("button", { name: "Check publication" });
  expect(queryAction("Try publishing again")).toBeNull();
  expect(queryAction("Publish challenge")).toBeNull();
  expect(onPublished).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(check));
  expect(publish).toHaveBeenCalledTimes(2);
  expect(publish.mock.calls[1]).toEqual(publish.mock.calls[0]);
  expect(onPublished).toHaveBeenCalledWith(publication);
});

it("AUT-05.5 Try publishing again uses the draft's current versions and a new key", async () => {
  const publish = vi.fn<Publish>().mockResolvedValue({ status: "failed" });
  const { update } = await setup(publish);
  await act(async () => fireEvent.click(publishButton()));
  await screen.findByText("We couldn't publish the challenge right now.");
  update({ ...decided, rowVersion: 7, draftVersion: 4 });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try publishing again" })));
  expect(publish.mock.calls[1][0]).toEqual({ expectedRowVersion: 7, expectedDraftVersion: 4 });
  expect(publish.mock.calls[1][1]).not.toBe(publish.mock.calls[0][1]);
});

it("AUT-05.6 a changed draft or lifecycle state asks for a reload without retrying publication", async () => {
  const { publish, reload, onPublished } = await setup(vi.fn<Publish>().mockResolvedValue({ status: "conflict" }));
  await act(async () => fireEvent.click(publishButton()));
  await screen.findByText("This challenge changed. Reload it before publishing.");
  expect(queryAction("Try publishing again")).toBeNull();
  expect(queryAction("Check publication")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reload draft" }));
  expect(reload).toHaveBeenCalledTimes(1);
  expect(publish).toHaveBeenCalledTimes(1);
  expect(onPublished).not.toHaveBeenCalled();
});

it("AUT-05.6 account failures stop without replaying publication", async () => {
  const { publish, onPublished } = await setup(vi.fn<Publish>().mockResolvedValue({ status: "unauthenticated" }));
  await act(async () => fireEvent.click(publishButton()));
  expect(publish).toHaveBeenCalledTimes(1);
  expect(queryAction("Try publishing again")).toBeNull();
  expect(queryAction("Check publication")).toBeNull();
  expect(onPublished).not.toHaveBeenCalled();
});
