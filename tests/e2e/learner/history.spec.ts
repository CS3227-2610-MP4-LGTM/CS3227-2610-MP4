import { expect, test as base, type Page, type Locator } from "@playwright/test";
import { createLearnerHistoryFixture } from "../../integration/domain/learner-history-fixture";

type Fixture = Awaited<ReturnType<typeof createLearnerHistoryFixture>>;
const test = base.extend<{ history: Fixture }>({
  history: async ({}, provide) => {
    const fixture = await createLearnerHistoryFixture({ pageSize: 21 });
    try { await provide(fixture); } finally { await fixture.dispose(); }
  },
});
async function signIn(page: Page, actor: Fixture["actors"]["learnerA"]) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(learner|author|ta)\//);
}
async function keyboardActivate(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let tab = 0; tab < 80; tab++) {
    if (await target.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
  expect(await target.evaluate(element => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
}
const resultPath = (id: string) => `/learner/history/${id}`;

test("LRN-08.1 LRN-08.2 LRN-08.3 SYS-17 uses separate result destinations and restores cursor pages with keyboard/back/reload at phone width", async ({ page, history }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signIn(page, history.actors.learnerA);
  await keyboardActivate(page, page.getByRole("link", { name: "Review history", exact: true }));
  await expect(page.getByRole("heading", { name: "Review history", exact: true })).toBeVisible();
  await expect(page.locator(`a[href="${resultPath(history.first)}"]`).filter({ hasText: "View result" })).toBeVisible();
  await expect(page.locator(`a[href="${resultPath(history.second)}"]`).filter({ hasText: "View result" })).toBeVisible();
  await expect(page.getByText("70 / 100", { exact: true })).toBeVisible();
  await expect(page.getByText("100 / 100", { exact: true })).toBeVisible();
  for (const state of ["Pending", "Running", "Failed", "Completed"]) await expect(page.getByText(state, { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await keyboardActivate(page, page.getByRole("button", { name: "Next page", exact: true }).or(page.getByRole("link", { name: "Next page", exact: true })));
  await expect(page).toHaveURL(/cursor=/);
  const next = page.url();
  await expect(page.getByRole("heading", { name: "Review history", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Next page", exact: true }).or(page.getByRole("link", { name: "Next page", exact: true }))).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(next);
  await expect(page.getByRole("link", { name: "View result" })).toHaveCount(3);
  await keyboardActivate(page, page.getByRole("button", { name: "First page", exact: true }).or(page.getByRole("link", { name: "First page", exact: true })));
  await expect(page).toHaveURL("/learner/history");
  await page.goBack();
  await expect(page).toHaveURL(next);
  await expect(page.getByRole("link", { name: "View result" })).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test("LRN-08.4 LRN-08.5 LRN-08.6 LRN-08.7 distinguishes original/current and retains every inert moderation correction without identities", async ({ page, history }) => {
  await signIn(page, history.actors.learnerA);
  await page.goto(resultPath(history.first));
  await expect(page.getByRole("heading", { name: "Review result" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review result" })).toBeFocused();
  for (const heading of ["Original assessment", "Current grade", "Override history", "Moderation flags", "Earned credit", "Missed criteria", "Next actions"]) await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  const original = page.locator("section").filter({ has: page.getByRole("heading", { name: "Original assessment", exact: true }) }).first();
  const current = page.locator("section").filter({ has: page.getByRole("heading", { name: "Current grade", exact: true }) }).first();
  await expect(original.getByText("25 / 100", { exact: true })).toBeVisible();
  await expect(original.getByText("Not passed", { exact: true })).toBeVisible();
  await expect(current.getByText("70 / 100", { exact: true })).toBeVisible();
  await expect(current.getByText("Passed", { exact: true })).toBeVisible();
  await expect(current.getByText("TA override", { exact: true })).toBeVisible();
  for (const label of ["Score near the pass mark", "AI grading output needed a retry", "Location match and AI assessment disagree", "Learner reported an unmatched comment"]) await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByText("Open", { exact: true })).toHaveCount(3);
  await expect(page.getByText("Resolved", { exact: true })).toHaveCount(1);
  await expect(page.getByText("TA action", { exact: true })).toHaveCount(4);
  await expect(page.getByText("Current override", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Latest resolution", { exact: true })).toHaveCount(1);
  await expect(page.getByText(history.reason, { exact: true }).first()).toBeVisible();
  await expect(page.locator('img[src*="attacker.example.test"], script[src*="attacker.example.test"]')).toHaveCount(0);
  const content = await page.getByRole("main").innerText();
  for (const actor of [history.actors.taA, history.actors.taB]) { expect(content).not.toContain(actor.id); expect(content).not.toContain(actor.email); }
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /override|resolve|report/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Retry challenge", exact: true })).toHaveCount(0);
  await expect(page.getByText("You have used your retry.", { exact: true })).toBeVisible();
  await page.goto(resultPath(history.second));
  await expect(page.getByText("No TA overrides. The current grade is the original assessment.", { exact: true })).toBeVisible();
  await expect(page.getByText("No moderation flags.", { exact: true })).toBeVisible();
});

test("LRN-08.3 announces read failures and retries the same URL, with distinct invalid and empty history states", async ({ page, history }) => {
  await signIn(page, history.actors.learnerA);
  let fail = true;
  await page.route("**/api/v1/submissions?**", async route => {
    if (!fail) return route.continue();
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", message: "Try again." } }) });
  });
  await page.goto(`/learner/history?limit=1&challengeId=${history.ids.c1}`);
  const message = page.getByText("We couldn't load review history. Try again.", { exact: true });
  await expect(message).toBeVisible();
  expect(await message.evaluate(element => Boolean(element.closest('[role="alert"], [role="status"], [aria-live]')))).toBe(true);
  fail = false;
  const requested = page.url();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("link", { name: "View result", exact: true })).toHaveCount(1);
  await expect(page).toHaveURL(requested);
  await page.goto("/learner/history?cursor=broken");
  await expect(page.getByText("This history page isn't valid.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "First page", exact: true }).or(page.getByRole("link", { name: "First page", exact: true })).click();
  await expect(page).toHaveURL("/learner/history");
  await page.goto(`/learner/history?challengeId=${history.ids.c2}`);
  await expect(page.getByText("No reviews yet.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Challenges", exact: true })).toHaveAttribute("href", "/learner/challenges");
});

test("LRN-08.8 SYS-12.4 retains result links, pinned source, original grade and hints through newer publication, unpublish and archive", async ({ page, history }) => {
  await signIn(page, history.actors.learnerA);
  await history.publishNextRevision();
  for (const status of ["published", "unpublished", "archived"]) {
    await history.h.db.query("update public.challenges set status = $2 where id = $1", [history.ids.c1, status]);
    await page.goto(`/learner/history?challengeId=${history.ids.c1}`);
    const link = page.locator(`a[href="${resultPath(history.first)}"]`).filter({ hasText: "View result" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(resultPath(history.first));
    await expect(page.getByRole("region", { name: "Source" })).toContainText("return price * fraction;");
    await expect(page.getByRole("region", { name: "Source" })).not.toContainText("return price * fraction * fraction;");
    await expect(page.getByText("25 / 100", { exact: true })).toBeVisible();
    await expect(page.getByText(history.reportBody, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Current override", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Show hint.*Edge case|Edge case.*Show hint/i }).click();
    await expect(page.getByText("Consider the smallest possible basket.", { exact: true })).toBeVisible();
    const text = await page.getByRole("main").innerText();
    expect(text).not.toContain("Multiply price by one minus fraction.");
    await expect(page.getByRole("link", { name: "Retry challenge", exact: true })).toHaveCount(0);
  }
});

test("LRN-08.8 ACC-03.3 ACC-03.5 ACC-03.9 SYS-09 clears prior history on sign-out/account switch and denies forbidden/missing direct results", async ({ page, history }) => {
  await page.goto("/learner/history");
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await signIn(page, history.actors.learnerA);
  await page.goto("/learner/history");
  await expect(page.locator(`a[href="${resultPath(history.first)}"]`).first()).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await page.goBack();
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await expect(page.getByText("70 / 100", { exact: true })).toHaveCount(0);
  await signIn(page, history.actors.learnerB);
  await page.goto("/learner/history");
  await expect(page.locator(`a[href="${resultPath(history.first)}"]`)).toHaveCount(0);
  await expect(page.locator(`a[href="${resultPath(history.foreign)}"]`).first()).toBeVisible();
  await page.goto(resultPath(history.first));
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByText("This item isn't available to your account.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Source" })).toHaveCount(0);
  await page.goto(resultPath(history.ids.missing));
  await expect(page.getByRole("heading", { name: "Review not found" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn(page, history.actors.authorA);
  await page.goto("/learner/history");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByText("This page isn't available for your role.", { exact: true })).toBeVisible();
  await expect(page.locator(`a[href="${resultPath(history.first)}"]`)).toHaveCount(0);
});
