import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GradingResult } from "@/components/learner/grading-result";
import { submissionViewSchema } from "@/lib/learner/submissions";
import { completed, failed, pending, running, submission, submissionId, original } from "./grading-fixture";
import { actorId, flagLabels, fullReason, moderatedSubmission, overrides, resolutions } from "./history-fixture";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function show(view = moderatedSubmission()) {
  return render(<GradingResult submissionId={submissionId} initialSubmission={view} published secondSubmissionId={null} />);
}
function section(name: string) {
  const heading = screen.getByRole("heading", { name });
  const parent = heading.closest("section");
  expect(parent, `${name} must have a distinct section`).not.toBeNull();
  return within(parent!);
}
it.each([59, 60])("LRN-08.4 uses the current effective score %i and shared pass mark without replacing original credit", score => {
  const view = moderatedSubmission();
  view.grading.effective = { score, passed: score >= original.passMark, source: "ta" };
  show(view);
  const current = section("Current grade");
  expect(current.getByText(`${score} / 100`, { exact: true })).toBeTruthy();
  expect(current.getByText(score >= 60 ? "Passed" : "Not passed", { exact: true })).toBeTruthy();
  expect(current.getByText("TA override", { exact: true })).toBeTruthy();
  expect(current.getByText("A TA override determines the current grade.", { exact: true })).toBeTruthy();
  const assessment = section("Original assessment");
  expect(assessment.getByText("25 / 100", { exact: true })).toBeTruthy();
  expect(assessment.getByText("Not passed", { exact: true })).toBeTruthy();
  for (const text of ["Component points", "Identification", "Explanation", "Actionable fix", "Matched flaws", "Missed flaws"]) expect(assessment.getAllByText(text, { exact: true })).toHaveLength(1);
  expect(screen.getAllByText("The consequence is clear.", { exact: true })).toHaveLength(1);
  expect(screen.getAllByText("Explanation credit", { exact: true })).toHaveLength(3);
  for (const heading of ["Earned credit", "Missed criteria", "Next actions"]) expect(screen.getAllByRole("heading", { name: heading })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Retry challenge" }).getAttribute("href")).toBe(`/learner/history/${submissionId}/retry`);
});
it("LRN-08.4 distinguishes an unoverridden original with explicit empty override and flag messages", () => {
  show(submissionViewSchema.parse({ ...submission, grading: completed }));
  const current = section("Current grade");
  expect(current.getByText("Original AI assessment", { exact: true })).toBeTruthy();
  expect(current.getByText("No TA overrides. The current grade is the original assessment.", { exact: true })).toBeTruthy();
  expect(section("Override history").getByText("No TA overrides.", { exact: true })).toBeTruthy();
  expect(section("Moderation flags").getByText("No moderation flags.", { exact: true })).toBeTruthy();
  for (const heading of ["Earned credit", "Missed criteria", "Next actions"]) expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
});
it.each([pending, running, failed("AI_UNAVAILABLE")])("LRN-08.4 shows no current score or pass/fail for $state grading and retains its recovery", grading => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise<Response>(() => {})));
  show(submissionViewSchema.parse({ ...submission, grading }));
  expect(screen.getByText("Current grade not available.", { exact: true })).toBeTruthy();
  expect(screen.queryByText(/^\d+ \/ 100$/)).toBeNull();
  expect(screen.queryByText(/^(Passed|Not passed)$/)).toBeNull();
  if (grading.state === "failed") expect(screen.getByRole("button", { name: "Retry grading" })).toBeTruthy();
});
it("LRN-08.5 retains corrections in audit order despite tied timestamps, marking only the latest override", () => {
  const { container } = show();
  const history = section("Override history");
  const actions = history.getAllByText("TA action", { exact: true });
  expect(actions).toHaveLength(2);
  expect(history.getAllByText("Recorded", { exact: true })).toHaveLength(2);
  expect(history.getAllByText("Replacement score", { exact: true })).toHaveLength(2);
  expect(history.getAllByText("Reason", { exact: true })).toHaveLength(2);
  const first = history.getByText(overrides[0].reason, { exact: true });
  const latest = history.getByText(fullReason, { exact: true });
  expect(first.compareDocumentPosition(latest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(history.getByText("90 / 100", { exact: true })).toBeTruthy();
  expect(history.getByText("59 / 100", { exact: true })).toBeTruthy();
  const latestEntry = latest.closest("li, article, tr");
  expect(latestEntry).not.toBeNull();
  expect(within(latestEntry as HTMLElement).getByText("Current override", { exact: true })).toBeTruthy();
  expect(history.getAllByText("Current override", { exact: true })).toHaveLength(1);
  for (const action of actions) {
    const entry = action.closest("li, article, tr");
    expect(entry?.textContent).toMatch(/2026/);
    expect(entry?.textContent).toMatch(/\d{1,2}:\d{2}/);
    expect(entry?.textContent).toMatch(/(?:UTC|GMT|[+-]\d\d:\d\d)/);
  }
  for (const id of [actorId, overrides[1].actorId]) expect(container.textContent).not.toContain(id);
  expect(container.querySelector("img, script")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: /override|resolve|dismiss|uphold/i })).toBeNull();
  expect(screen.queryByText(/^(Actor|Actor ID|Email|TA A|TA B)$/)).toBeNull();
});
it("LRN-08.6 shows all four kinds including resolved reports and does not invent rule comment associations", () => {
  show();
  const flags = section("Moderation flags");
  for (const label of flagLabels) expect(flags.getByText(label, { exact: true })).toBeTruthy();
  expect(flags.getAllByText("Open", { exact: true })).toHaveLength(3);
  expect(flags.getAllByText("Resolved", { exact: true })).toHaveLength(1);
  const report = flags.getByText(flagLabels[3], { exact: true }).closest("li, article, section");
  expect(report).not.toBeNull();
  expect(report?.textContent).toContain(submission.comments[2].body);
  expect(report?.textContent).toMatch(/(?:Line|line)\s*6/);
  expect(report?.textContent).toContain("Rounding is unspecified for fractional prices.");
  for (const label of flagLabels.slice(0, 3)) {
    const entry = flags.getByText(label, { exact: true }).closest("li, article, section");
    expect(entry?.textContent).not.toContain(submission.comments[2].body);
    expect(entry?.textContent).not.toMatch(/(?:Line|line)\s*6/);
  }
});
it("LRN-08.7 retains every resolution correction and its full reason while a resolution alone changes no grade", () => {
  const view = moderatedSubmission();
  view.grading = submissionViewSchema.parse({ ...submission, grading: completed }).grading;
  const { container } = show(view);
  expect(section("Current grade").getByText("25 / 100", { exact: true })).toBeTruthy();
  const flags = section("Moderation flags");
  expect(flags.getAllByText("Resolution history", { exact: true })).toHaveLength(4);
  expect(flags.getAllByText("Awaiting TA review.", { exact: true })).toHaveLength(3);
  const first = flags.getByText(resolutions[0].reason, { exact: true });
  const latest = flags.getAllByText(fullReason, { exact: true }).at(-1)!;
  expect(first.compareDocumentPosition(latest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(flags.getAllByText("TA action", { exact: true })).toHaveLength(2);
  expect(flags.getAllByText("Recorded", { exact: true }).length).toBeGreaterThanOrEqual(2);
  expect(flags.getAllByText("Disposition", { exact: true }).length).toBeGreaterThanOrEqual(2);
  expect(flags.getByText(/upheld/i)).toBeTruthy();
  expect(flags.getAllByText(/dismissed/i).length).toBeGreaterThan(0);
  expect(flags.getByText("Latest resolution", { exact: true })).toBeTruthy();
  for (const resolution of resolutions) expect(container.textContent).not.toContain(resolution.actorId);
  expect(container.querySelector("img, script")).toBeNull();
});
it("LRN-08.5 LRN-08.7 preserves actorId in strict DTOs while omitting identities only from presentation", () => {
  const parsed = submissionViewSchema.parse(moderatedSubmission());
  expect(parsed.grading.overrides[0].actorId).toBe(actorId);
  expect(parsed.flags[3].resolutions[0].actorId).toBe(actorId);
  const wrong = moderatedSubmission();
  Object.assign(wrong.grading.overrides[0], { email: "ta@example.test" });
  expect(submissionViewSchema.safeParse(wrong).success).toBe(false);
});
