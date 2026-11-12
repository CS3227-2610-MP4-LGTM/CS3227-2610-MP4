import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ModerationPanel } from "@/components/ta/moderation-panel";
import { submissionSchema, type TaSubmissionView } from "@/lib/ta/submissions";
import { id, submission as inspectionSubmission } from "../inspection/evidence";
function submission(): TaSubmissionView { return submissionSchema.parse(inspectionSubmission()); }
const inert = '<img src=x onerror="window.pwned=1"> Full retained reason';
function setup(s: TaSubmissionView = submission(), overrides = vi.fn(), resolutions = vi.fn(), selectedFlagId = s.flags[0]?.id) {
  const refresh = vi.fn().mockResolvedValue({ status: "ok", submission: s });
  const view = render(<ModerationPanel submission={s} selectedFlagId={selectedFlagId} saveOverride={overrides} saveResolution={resolutions} refresh={refresh} />);
  return { ...view, overrides, resolutions, refresh };
}
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
function fillOverride(score = "59", reason = "Reviewed the existing evidence") {
  click("Override grade"); fireEvent.change(screen.getByLabelText("Replacement score"), { target: { value: score } });
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: reason } });
}
function fillResolution() {
  click("Add correction"); fireEvent.change(screen.getByLabelText("Disposition"), { target: { value: "dismissed" } });
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Correction after review" } });
}
function fieldError(label: string, message: string) {
  const input = screen.getByLabelText(label); expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toContain(message);
}
afterEach(cleanup);
it("TA-03.1 shows original/current grade, opens empty explicit decision fields and cancel causes no write", () => {
  const { overrides } = setup(); click("Override grade");
  expect(screen.getByRole("heading", { name: "Override grade" })).toBeTruthy();
  expect(screen.getByText("Scores are out of 100. A reason is required and will be visible to the learner.")).toBeTruthy();
  for (const label of ["Replacement score", "Reason"]) expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe("");
  expect(screen.getByText("25 / 100")).toBeTruthy(); expect(screen.getByText("70 / 100")).toBeTruthy();
  click("Cancel"); expect(overrides).not.toHaveBeenCalled(); expect(screen.queryByLabelText("Reason")).toBeNull();
});
it.each([["", "Enter a replacement score."], ["1.5", "Enter a whole number from 0 to 100."], ["-1", "Enter a whole number from 0 to 100."], ["101", "Enter a whole number from 0 to 100."]])(
  "TA-03.2 SYS-17.1 validates score %s, retains draft and focuses the first associated error", (score, message) => {
    const { overrides } = setup(); fillOverride(score, "  "); click("Save override");
    fieldError("Replacement score", message); fieldError("Reason", "Enter a reason.");
    expect(document.activeElement).toBe(screen.getByLabelText("Replacement score")); expect(overrides).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Replacement score") as HTMLInputElement).value).toBe(score);
  },
);
it("TA-02.5 validates required disposition/reason, oversized reason and cancellation without losing previous history", () => {
  const { resolutions } = setup(); click("Add correction");
  expect(Array.from((screen.getByLabelText("Disposition") as HTMLSelectElement).options, o => o.text)).toEqual(["Select a disposition", "Upheld", "Dismissed"]);
  click("Save resolution"); fieldError("Disposition", "Select Upheld or Dismissed."); fieldError("Reason", "Enter a reason.");
  expect(document.activeElement).toBe(screen.getByLabelText("Disposition"));
  fireEvent.change(screen.getByLabelText("Disposition"), { target: { value: "upheld" } });
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "a".repeat(2001) } });
  click("Save resolution"); fieldError("Reason", "Reason exceeds the allowed length.");
  expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).toHaveLength(2001);
  click("Cancel"); expect(resolutions).not.toHaveBeenCalled(); expect(screen.getByText(submission().flags[0].resolutions[0].reason)).toBeTruthy();
});
it("TA-03.2 rejects oversized override reason and preserves both fields", () => {
  const { overrides } = setup(); fillOverride("0", "📝".repeat(2001)); click("Save override");
  fieldError("Reason", "Reason exceeds the allowed length."); expect(overrides).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Replacement score") as HTMLInputElement).value).toBe("0");
});
it("TA-03.3 announces pending, disables duplicate save and updates only from returned grading", async () => {
  const s = submission(), old = structuredClone(s);
  let finish!: (value: unknown) => void;
  const save = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; })); setup(s, save); fillOverride(); click("Save override");
  expect(screen.getByText("Saving override…").closest('[role="status"], [aria-live]')).not.toBeNull();
  expect(screen.getByRole("button", { name: /Saving override|Save override/ }).matches(":disabled")).toBe(true);
  expect(save).toHaveBeenCalledTimes(1); expect(screen.queryByText("59 / 100")).toBeNull();
  const override = { id: id(910), actorId: id(21), createdAt: "2026-01-01T00:00:09Z", auditOrder: 3, score: 59, reason: "Reviewed the existing evidence" };
  await act(async () => finish({ status: "ok", override, grading: { ...s.grading, effective: { score: 59, passed: false, source: "ta" }, overrides: [...s.grading.overrides, override] } }));
  await screen.findByText("Grade override saved."); expect(screen.getByText("59 / 100")).toBeTruthy(); expect(within(screen.getByRole("region", { name: "Current grade" })).getByText("Not passed", { exact: true })).toBeTruthy();
  expect(screen.queryByLabelText("Reason")).toBeNull(); expect(s).toEqual(old);
});
it("TA-02.6 appends correction, marks selected flag resolved, preserves original reasons and grade", async () => {
  const s = submission(); const resolution = { ...s.flags[0].resolutions[0], id: id(911), auditOrder: 3, disposition: "dismissed", reason: "Correction after review" };
  const save = vi.fn().mockResolvedValue({ status: "ok", flag: { ...s.flags[0], resolutions: [...s.flags[0].resolutions, resolution] } });
  setup(s, vi.fn(), save); fillResolution(); click("Save resolution"); await screen.findByText("Resolution saved.");
  expect(screen.getByText(s.flags[0].resolutions[0].reason)).toBeTruthy(); expect(screen.getByText(resolution.reason)).toBeTruthy();
  expect(screen.getByText("70 / 100")).toBeTruthy(); expect(screen.getByText("25 / 100")).toBeTruthy(); expect(screen.getByText("Latest resolution")).toBeTruthy();
});
it.each(["override", "resolution"] as const)("TA-02.7 TA-03.6 retries uncertain %s with the same key then uses a new key for an explicit changed decision", async kind => {
  const save = vi.fn().mockResolvedValue({ status: "unavailable" });
  setup(submission(), kind === "override" ? save : vi.fn(), kind === "resolution" ? save : vi.fn());
  if (kind === "override") fillOverride(); else fillResolution(); click(kind === "override" ? "Save override" : "Save resolution");
  await screen.findByText(`We couldn't save this ${kind}. Try again.`);
  expect(screen.queryByText(kind === "override" ? "Grade override saved." : "Resolution saved.")).toBeNull();
  expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).not.toBe(""); click("Try again");
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2)); expect(save.mock.calls[0]).toEqual(save.mock.calls[1]);
  const key = save.mock.calls[0][2]; expect(key).toMatch(/^[0-9a-f-]{36}$/i);
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Explicit changed decision" } });
  click(kind === "override" ? "Save override" : "Save resolution"); await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
  expect(save.mock.calls[2][2]).not.toBe(key);
});
it.each(["override", "resolution"] as const)("TA-02.7 TA-03.5 TA-03.6 refreshes rejected %s without replay and retains the draft", async kind => {
  const save = vi.fn().mockResolvedValue({ status: kind === "override" ? "invalid_state" : "conflict" });
  const { refresh } = setup(submission(), kind === "override" ? save : vi.fn(), kind === "resolution" ? save : vi.fn());
  if (kind === "override") fillOverride(); else fillResolution(); click(kind === "override" ? "Save override" : "Save resolution");
  await screen.findByText(kind === "override" ? "A completed assessment is required before overriding a grade." : "This flag changed. Refresh before saving.");
  const draft = (screen.getByLabelText("Reason") as HTMLTextAreaElement).value; click("Refresh submission");
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1)); expect(save).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).toBe(draft);
});
it.each(["pending", "running", "failed"] as const)("TA-03.5 disables %s override without inventing an assessment", state => {
  const s = submission(); s.grading.state = state; s.grading.original = null; s.grading.effective = null;
  setup(s); expect(screen.getByText("A completed assessment is required before overriding a grade.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Override grade" })?.matches(":disabled") ?? true).toBe(true);
});
it("TA-02.4 TA-03.4 renders histories by audit order despite tied timestamps, full inert reasons and verified attribution", () => {
  const s = submission(); const first = { ...s.grading.overrides[0], reason: inert };
  s.grading.overrides = [{ ...first, id: id(912), actorId: id(22), auditOrder: 4, reason: "Newest same-score decision" }, first];
  s.flags[0].resolutions = [{ ...s.flags[0].resolutions[0], id: id(913), auditOrder: 5, reason: "Newest resolution" }, s.flags[0].resolutions[0]];
  setup(s); const history = screen.getByRole("region", { name: "Override history" });
  expect(history.textContent!.indexOf(inert)).toBeLessThan(history.textContent!.indexOf("Newest same-score decision"));
  expect(within(history).getByText("Current override")).toBeTruthy(); expect(within(history).getByText(id(22))).toBeTruthy();
  const resolutions = screen.getByRole("region", { name: "Resolution history" });
  expect(resolutions.textContent!.indexOf(s.flags[0].resolutions[1].reason)).toBeLessThan(resolutions.textContent!.indexOf("Newest resolution"));
  for (const label of ["TA", "Recorded", "Reason", "Replacement score", "Disposition"]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  for (const time of document.querySelectorAll("time")) expect(time.textContent).toMatch(/2026.*\d{1,2}:\d{2}.*(?:UTC|GMT|[+-]\d{2}:?\d{2})/);
  expect(document.querySelector("img")).toBeNull(); expect(screen.queryByRole("button", { name: /edit|delete/i })).toBeNull();
});
it("TA-02.4 TA-02.5 TA-03.4 shows no-history/awaiting states and resolves only an open selected flag", () => {
  const s = submission(); s.grading.overrides = []; s.flags[0].resolutions = []; s.flags[0].status = "open";
  setup(s); expect(screen.getByText("No TA overrides. The current grade is the original assessment.")).toBeTruthy();
  expect(screen.getByText("Awaiting TA review.")).toBeTruthy(); expect(screen.getByRole("button", { name: "Resolve flag" })).toBeTruthy();
});
it("TA-02.4 TA-02.8 distinguishes absent selection from no flags and offers back navigation", () => {
  const s = submission(); s.flags = []; setup(s, vi.fn(), vi.fn(), id(999));
  expect(screen.getByText("Flag not found.")).toBeTruthy(); expect(screen.getByRole("link", { name: "Back to flagged submissions" }).getAttribute("href")).toBe("/ta/flags");
  cleanup(); setup(s); expect(screen.getByText("No moderation flags.")).toBeTruthy();
});
it("TA-02.5 TA-02.6 announces an open-flag save, prevents repeats and appends returned history without changing other flags", async () => {
  const s = submission(); s.flags[0].status = "open"; s.flags[0].resolutions = [];
  s.flags.push({ ...s.flags[0], id: id(802), source: "rule", kind: "near_pass_mark", reason: null, commentId: null });
  let finish!: (value: unknown) => void;
  const save = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { overrides } = setup(s, vi.fn(), save); fireEvent.click(screen.getAllByRole("button", { name: "Resolve flag" })[0]);
  fireEvent.change(screen.getByLabelText("Disposition"), { target: { value: "upheld" } });
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Reviewed report" } }); click("Save resolution");
  expect(screen.getByText("Saving resolution…").closest('[role="status"], [aria-live]')).not.toBeNull();
  expect(screen.getByRole("button", { name: /Saving resolution|Save resolution/ }).matches(":disabled")).toBe(true);
  expect(save).toHaveBeenCalledTimes(1); expect(overrides).not.toHaveBeenCalled();
  const resolution = { id: id(920), actorId: id(21), createdAt: "2026-01-01T00:00:09Z", auditOrder: 3, disposition: "upheld", reason: "Reviewed report" };
  await act(async () => finish({ status: "ok", flag: { ...s.flags[0], status: "resolved", resolutions: [resolution] } }));
  await screen.findByText("Resolution saved."); expect(screen.getByText("Reviewed report")).toBeTruthy(); expect(screen.getByText("Awaiting TA review.")).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add correction" }));
});
it("TA-03.6 retains the newer server audit entry when an older save response completes after refresh", async () => {
  const s = submission(); let finish!: (value: unknown) => void;
  const save = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; })); const refresh = vi.fn();
  const { rerender } = render(<ModerationPanel submission={s} saveOverride={save} saveResolution={vi.fn()} refresh={refresh} />);
  fillOverride("59", "Earlier decision response"); click("Save override");
  const older = { ...s.grading.overrides[0], id: id(921), auditOrder: 3, score: 59, reason: "Earlier decision response" };
  const newer = { ...older, id: id(922), actorId: id(22), auditOrder: 4, score: 100, reason: "Later committed decision" };
  const fresh = { ...s, grading: { ...s.grading, effective: { score: 100, passed: true, source: "ta" as const }, overrides: [...s.grading.overrides, older, newer] } };
  rerender(<ModerationPanel submission={fresh} saveOverride={save} saveResolution={vi.fn()} refresh={refresh} />);
  await act(async () => finish({ status: "ok", override: older, grading: { ...s.grading, effective: { score: 59, passed: false, source: "ta" }, overrides: [...s.grading.overrides, older] } }));
  await screen.findByText("Grade override saved."); expect(screen.getByText("100 / 100")).toBeTruthy();
  expect(screen.getByText("Later committed decision")).toBeTruthy(); expect(screen.queryByText("59 / 100")).toBeNull();
});
