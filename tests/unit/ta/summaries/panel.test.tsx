import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SummaryPanel } from "@/components/ta/summary-panel";
import { deferred, generated, hostile, id, read, summary } from "./evidence";

// Interfaces defined by tests: SummaryPanel({learnerId, readSummary,
// generateSummary}); readSummary(id) -> {status:'ok',summary,stale}|ReadFailure;
// generateSummary(id,key) -> {status:'ok',summary}|{status:'failed',code}|ReadFailure.
// A rejected generation promise is an uncertain outcome, distinct from a
// confirmed server failure. Keys are UUIDs retained for an uncertain replay.
function setup(options: Partial<Parameters<typeof SummaryPanel>[0]> = {}) {
  const props = { learnerId: id(11), readSummary: vi.fn().mockResolvedValue(read()), generateSummary: vi.fn().mockResolvedValue(generated()), ...options };
  return { ...render(<SummaryPanel {...props} />), ...props };
}
afterEach(cleanup);
it("TA-04.3 TA-04.4 reads once on entry and displays null without generating automatically", async () => {
  const { generateSummary, readSummary } = setup({ readSummary: vi.fn().mockResolvedValue(read(null)) });
  await screen.findByText("No performance summary yet.");
  expect(screen.getByRole("button", { name: "Generate summary" })).toBeTruthy();
  expect(readSummary).toHaveBeenCalledTimes(1); expect(readSummary).toHaveBeenCalledWith(id(11));
  expect(generateSummary).not.toHaveBeenCalled();
});
it("TA-04.3 SEC-02.2 shows provenance, full inert text, timezone and only server-built supporting links", async () => {
  const value = summary(); value.output.blindSpots[0].text = hostile;
  const { container, generateSummary } = setup({ readSummary: vi.fn().mockResolvedValue(read(value)) });
  await screen.findByText("AI-generated summary — review the supporting submissions.");
  for (const title of ["Strengths", "Blind spots", "Suggested next steps"]) expect(screen.getByRole("heading", { name: title })).toBeTruthy();
  expect(screen.getByText("No strengths identified in this summary.")).toBeTruthy();
  expect(screen.getByText(hostile).textContent).toBe(hostile);
  expect(screen.getAllByText("Edge case")).toHaveLength(2);
  expect(screen.getByText("Generated")).toBeTruthy();
  expect(container.textContent).toMatch(/2026/); expect(container.textContent).toMatch(/UTC|GMT|[A-Z]{3,5}|[+-]\d{2}:?\d{2}/);
  expect(container.querySelector("time")?.getAttribute("datetime")).toBe(value.createdAt);
  expect(container.querySelectorAll("script,img,iframe")).toHaveLength(0);
  const links = screen.getAllByRole("link", { name: "View supporting submission" }); expect(links).toHaveLength(2);
  for (const link of links) {
    const url = new URL(link.getAttribute("href")!, "http://localhost");
    expect(url.pathname).toBe(`/ta/submissions/${id(501)}`);
  }
  expect(container.querySelector('[href*="attacker.invalid"]')).toBeNull(); expect(generateSummary).not.toHaveBeenCalled();
});
it("TA-04.3 empty arrays are successful empty sections rather than missing summary", async () => {
  const value = summary(); value.output.blindSpots = []; value.output.nextSteps = [];
  value.output.strengths = [{ category: "logic_bug", text: "Correctly identified the logic flaw.", submissionIds: [id(501)] }];
  setup({ readSummary: vi.fn().mockResolvedValue(read(value)) });
  await screen.findByText("No blind spots identified in this summary."); await screen.findByText("No next steps suggested in this summary.");
  expect(screen.queryByText("No performance summary yet.")).toBeNull();
});
it.each([false, true])("TA-04.4 retains a stored summary with stale=%s and offers regeneration without automatic dispatch", async stale => {
  const { generateSummary } = setup({ readSummary: vi.fn().mockResolvedValue(read(summary(), stale)) });
  await screen.findByRole("button", { name: "Regenerate summary" });
  const message = "This summary is out of date. Generate a new summary to include current evidence.";
  expect(!!screen.queryByText(message)).toBe(stale); expect(generateSummary).not.toHaveBeenCalled();
});
it("TA-04.5 SYS-17.1 explicitly generates once, keeps previous content pending, announces success and focuses summary heading", async () => {
  const pending = deferred<ReturnType<typeof generated>>(); const generateSummary = vi.fn().mockReturnValue(pending.promise);
  setup({ generateSummary }); const button = await screen.findByRole("button", { name: "Regenerate summary" });
  fireEvent.click(button); fireEvent.click(button);
  await screen.findByText("Generating performance summary…"); expect(screen.getByText("Previous summary")).toBeTruthy();
  expect(screen.getByText(summary().output.blindSpots[0].text)).toBeTruthy(); expect(button.matches(":disabled")).toBe(true);
  expect(generateSummary).toHaveBeenCalledTimes(1); expect(generateSummary.mock.calls[0][0]).toBe(id(11));
  expect(generateSummary.mock.calls[0][1]).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
  const next = summary(); next.id = id(56002); next.output.blindSpots[0].text = "New validated evidence.";
  await act(async () => pending.resolve(generated(next)));
  expect((await screen.findByText("Performance summary generated.")).closest('[role="status"],[aria-live]')).not.toBeNull();
  expect(screen.getByText("New validated evidence.")).toBeTruthy(); expect(screen.queryByText("Previous summary")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Performance summary" })));
});
it.each([
  ["INVALID_STATE", "A completed submission is required to generate a summary.", "View submissions"],
  ["PAYLOAD_TOO_LARGE", "There is too much evidence to generate this summary.", "Refresh learner performance"],
  ["RATE_LIMITED", "Summary generation is temporarily limited. Try again later.", "Try again"],
  ["AI_TIMEOUT", "Summary generation timed out. Try again.", "Try again"],
  ["INVALID_AI_OUTPUT", "We couldn't generate a valid summary. Try again.", "Try again"],
  ["AI_UNAVAILABLE", "Summary generation is unavailable. Try again.", "Try again"],
  ["SERVICE_UNAVAILABLE", "Summary generation is unavailable. Try again.", "Try again"],
] as const)("TA-04.6 TA-04.7 SEC-06.1 %s preserves previous output and gives explicit recovery", async (code, message, action) => {
  const generateSummary = vi.fn().mockResolvedValue({ status: "failed", code }); setup({ generateSummary });
  fireEvent.click(await screen.findByRole("button", { name: "Regenerate summary" }));
  expect((await screen.findByText(message)).closest('[role="alert"],[aria-live]')).not.toBeNull();
  expect(screen.getByText(summary().output.blindSpots[0].text)).toBeTruthy(); expect(screen.queryByText("Performance summary generated.")).toBeNull();
  expect(screen.getByRole(action === "View submissions" ? "link" : "button", { name: action })).toBeTruthy();
  expect(generateSummary).toHaveBeenCalledTimes(1);
  if (["INVALID_STATE", "PAYLOAD_TOO_LARGE"].includes(code)) expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});
it("TA-04.7 a confirmed failure retries only on explicit action with a new mutation key", async () => {
  const generateSummary = vi.fn().mockResolvedValueOnce({ status: "failed", code: "AI_TIMEOUT" }).mockResolvedValue(generated());
  setup({ generateSummary }); fireEvent.click(await screen.findByRole("button", { name: "Regenerate summary" }));
  await screen.findByText("Summary generation timed out. Try again."); expect(generateSummary).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); await screen.findByText("Performance summary generated.");
  expect(generateSummary).toHaveBeenCalledTimes(2); expect(generateSummary.mock.calls[1][1]).not.toBe(generateSummary.mock.calls[0][1]);
});
it("TA-04.7 an uncertain mutation offers a stored-result refresh without automatic generation replay", async () => {
  const generateSummary = vi.fn().mockRejectedValue(new Error("lost reply")); const readSummary = vi.fn().mockResolvedValue(read());
  setup({ generateSummary, readSummary }); fireEvent.click(await screen.findByRole("button", { name: "Regenerate summary" }));
  fireEvent.click(await screen.findByRole("button", { name: "Refresh learner performance" }));
  await waitFor(() => expect(readSummary).toHaveBeenCalledTimes(2)); expect(generateSummary).toHaveBeenCalledTimes(1);
});
it("TA-04.8 initial read failure stays distinct from null and never starts generation", async () => {
  const { generateSummary } = setup({ readSummary: vi.fn().mockResolvedValue({ status: "unavailable" }) });
  await screen.findByText("We couldn't load the performance summary. Try again.");
  expect(screen.getByRole("link", { name: "Back to learners" }).getAttribute("href")).toBe("/ta/learners");
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  expect(screen.queryByText("No performance summary yet.")).toBeNull(); expect(screen.queryByRole("button", { name: /Generate|Regenerate/ })).toBeNull();
  expect(generateSummary).not.toHaveBeenCalled();
});
it("TA-04.8 retains previously read text with unavailable freshness and retries the read alone", async () => {
  const readSummary = vi.fn().mockResolvedValueOnce(read()).mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValue(read(summary(), true));
  const { generateSummary } = setup({ readSummary }); await screen.findByText(summary().output.blindSpots[0].text);
  fireEvent.click(screen.getByRole("button", { name: "Refresh learner performance" }));
  await screen.findByText("Previously loaded summary; freshness unavailable.");
  expect(screen.getByText(summary().output.blindSpots[0].text)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("This summary is out of date. Generate a new summary to include current evidence.");
  expect(screen.queryByText("Previously loaded summary; freshness unavailable.")).toBeNull(); expect(generateSummary).not.toHaveBeenCalled();
});
it("TA-04.5 SYS-09.3 drops late generation results when the selected learner changes", async () => {
  const pending = deferred<ReturnType<typeof generated>>(); const readSummary = vi.fn().mockResolvedValue(read(null));
  const generateSummary = vi.fn().mockReturnValue(pending.promise);
  const view = setup({ readSummary, generateSummary }); fireEvent.click(await screen.findByRole("button", { name: "Generate summary" }));
  view.rerender(<SummaryPanel learnerId={id(12)} readSummary={readSummary} generateSummary={generateSummary} />);
  await screen.findByText("No performance summary yet."); await act(async () => pending.resolve(generated()));
  expect(screen.queryByText(summary().output.blindSpots[0].text)).toBeNull(); expect(screen.queryByText("Performance summary generated.")).toBeNull();
});
