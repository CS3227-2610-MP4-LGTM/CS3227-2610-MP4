import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { createLearnerReportsFixture } from "../../integration/domain/learner-reports-fixture";

type Fixture = Awaited<ReturnType<typeof createLearnerReportsFixture>>;
const test = base.extend<{ reports: Fixture }>({
  reports: async ({}, provide) => {
    const fixture = await createLearnerReportsFixture();
    try { await provide(fixture); } finally { await fixture.dispose(); }
  },
});
const copy = {
  action: "Report unmatched comment",
  instructions: "Explain why this comment identifies an issue missing from the answer key. Reporting does not change your grade.",
  sent: "Report sent. A TA can review this comment.",
  duplicate: "This comment has already been reported.",
  uncertain: "We couldn't confirm your report. Check report again.",
};
const reason = "Rounding is unspecified for fractional prices.";
const resultPath = (id: string) => `/learner/history/${id}`;

async function signIn(page: Page, actor: Fixture["actors"]["learnerA"]) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(learner|author|ta)\//);
}
async function keyboardActivate(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let tab = 0; tab < 120; tab++) {
    if (await target.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
  expect(await target.evaluate(element => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
}
function comment(page: Page, body: string) {
  return page.getByRole("region", { name: "Earned credit" }).or(page.locator("section").filter({ has: page.getByRole("heading", { name: "Earned credit", exact: true }) }))
    .first().locator("li").filter({ hasText: body });
}
function moderation(page: Page) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "Moderation flags", exact: true }) }).first();
}
async function openResult(page: Page, id: string) {
  await page.goto(resultPath(id));
  await expect(page.getByRole("heading", { name: "Review result" })).toBeFocused();
}
async function report(page: Page, body: string, text = reason) {
  await expect(comment(page, body)).toHaveCount(1);
  await comment(page, body).getByRole("button", { name: copy.action, exact: true }).click();
  await page.getByRole("textbox", { name: "Reason", exact: true }).fill(text);
  await page.getByRole("button", { name: "Send report", exact: true }).click();
}
async function flagCount(reports: Fixture, commentId: string) {
  const { rows } = await reports.h.db.query("select count(*)::int as count from public.review_flags where comment_id = $1", [commentId]);
  return rows[0].count as number;
}

test("LRN-07.1 LRN-07.2 LRN-07.3 LRN-07.4 LRN-07.5 SYS-17 completes the keyboard report journey at 320 CSS pixels and keeps Reported after reload", async ({ page, reports }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signIn(page, reports.actors.learnerA);
  await openResult(page, reports.first);
  for (const body of [reports.text.matched, reports.text.duplicate, reports.text.firstUnmatched, reports.text.raceUnmatched]) await expect(comment(page, body)).toHaveCount(1);
  for (const body of [reports.text.matched, reports.text.duplicate]) await expect(comment(page, body).getByRole("button", { name: copy.action })).toHaveCount(0);
  await expect(page.getByRole("button", { name: copy.action, exact: true })).toHaveCount(2);
  const currentGrade = await page.locator("section").filter({ has: page.getByRole("heading", { name: "Current grade", exact: true }) }).first().innerText();
  await keyboardActivate(page, comment(page, reports.text.firstUnmatched).getByRole("button", { name: copy.action, exact: true }));
  const field = page.getByRole("textbox", { name: "Reason", exact: true });
  await expect(field).toBeFocused();
  await expect(page.getByText(copy.instructions, { exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Send report", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Enter a reason.", { exact: true })).toBeVisible();
  await expect(field).toBeFocused();
  await page.keyboard.type(reason);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByText(copy.sent, { exact: true })).toBeVisible();
  const reported = comment(page, reports.text.firstUnmatched).getByText("Reported", { exact: true });
  await expect(reported).toBeVisible();
  expect(await reported.evaluate(element => element === document.activeElement || element.contains(document.activeElement) || Boolean(document.activeElement?.contains(element)))).toBe(true);
  await expect(moderation(page).getByText("Learner reported an unmatched comment", { exact: true })).toBeVisible();
  await expect(moderation(page).getByText(reason, { exact: true })).toBeVisible();
  expect(await page.locator("section").filter({ has: page.getByRole("heading", { name: "Current grade", exact: true }) }).first().innerText()).toBe(currentGrade);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.reload();
  await expect(comment(page, reports.text.firstUnmatched).getByText("Reported", { exact: true })).toBeVisible();
  await expect(comment(page, reports.text.firstUnmatched).getByRole("button", { name: copy.action })).toHaveCount(0);
  await expect(moderation(page).getByText(reason, { exact: true })).toBeVisible();
  expect(await flagCount(reports, reports.comments.firstUnmatched)).toBe(1);
});

test("LRN-07.3 SYS-17 validates an over-bound reason and cancels without a report at phone width", async ({ page, reports }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, reports.actors.learnerA);
  await openResult(page, reports.first);
  await expect(comment(page, reports.text.raceUnmatched)).toHaveCount(1);
  const action = comment(page, reports.text.raceUnmatched).getByRole("button", { name: copy.action, exact: true });
  await action.click();
  const field = page.getByRole("textbox", { name: "Reason", exact: true });
  const tooLong = "🚲".repeat(2001);
  await field.fill(tooLong);
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(page.getByText("Reason is too long.", { exact: true })).toBeVisible();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(tooLong);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(field).toHaveCount(0);
  await expect(action).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  expect(await flagCount(reports, reports.comments.raceUnmatched)).toBe(0);
});

test("LRN-07.5 shows a duplicate from a second tab, refreshes to Reported and keeps one flag", async ({ page, reports }) => {
  await signIn(page, reports.actors.learnerA);
  await openResult(page, reports.first);
  const other = await page.context().newPage();
  await openResult(other, reports.first);
  await expect(comment(page, reports.text.raceUnmatched)).toHaveCount(1);
  await comment(page, reports.text.raceUnmatched).getByRole("button", { name: copy.action, exact: true }).click();
  await page.getByRole("textbox", { name: "Reason", exact: true }).fill(reason);
  await report(other, reports.text.raceUnmatched, "Reported first from another tab.");
  await expect(other.getByText(copy.sent, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(page.getByText(copy.duplicate, { exact: true })).toBeVisible();
  await expect(comment(page, reports.text.raceUnmatched).getByText("Reported", { exact: true })).toBeVisible();
  await expect(moderation(page).getByText("Reported first from another tab.", { exact: true })).toBeVisible();
  expect(await flagCount(reports, reports.comments.raceUnmatched)).toBe(1);
});

test("LRN-07.1 SYS-12.4 reports on the second attempt and on a historical result after archive", async ({ page, reports }) => {
  await signIn(page, reports.actors.learnerA);
  await openResult(page, reports.second);
  await report(page, reports.text.secondUnmatched);
  await expect(page.getByText(copy.sent, { exact: true })).toBeVisible();
  await expect(comment(page, reports.text.secondUnmatched).getByText("Reported", { exact: true })).toBeVisible();
  await openResult(page, reports.archived);
  await report(page, reports.text.archivedUnmatched);
  await expect(page.getByText(copy.sent, { exact: true })).toBeVisible();
  await expect(moderation(page).getByText(reason, { exact: true })).toBeVisible();
  for (const commentId of [reports.comments.secondUnmatched, reports.comments.archivedUnmatched]) expect(await flagCount(reports, commentId)).toBe(1);
});

test("LRN-07.6 LRN-07.7 ACC-03.5 never replays an unconfirmed report after sign-out or account switching", async ({ page, reports }) => {
  await signIn(page, reports.actors.learnerA);
  await openResult(page, reports.first);
  const reportRequests: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/reports")) reportRequests.push(request.url()); });
  await page.route("**/api/v1/submissions/*/reports", route => route.abort("failed"));
  await report(page, reports.text.firstUnmatched);
  await expect(page.getByText(copy.uncertain, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check report", exact: true })).toBeVisible();
  expect(reportRequests).toHaveLength(1);
  await page.unroute("**/api/v1/submissions/*/reports");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await signIn(page, reports.actors.learnerB);
  await page.goto(resultPath(reports.first));
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn(page, reports.actors.learnerA);
  await openResult(page, reports.first);
  await expect(comment(page, reports.text.firstUnmatched).getByRole("button", { name: copy.action, exact: true })).toBeVisible();
  expect(reportRequests).toHaveLength(1);
  expect(await flagCount(reports, reports.comments.firstUnmatched)).toBe(0);
});
