import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { createInspectionFixture } from "../../../integration/ta/inspection/fixture";
import { id } from "../../../unit/ta/inspection/evidence";
import { accountAccessHeader } from "@/lib/learner/challenges";
const root = "/ta/submissions";
const detail = `${root}/${id(501)}`;
const api = "**/api/v1/ta/submissions*";
const test = base.extend<object, { inspection: Awaited<ReturnType<typeof createInspectionFixture>> }>({
  inspection: [async ({}, provide) => { const fixture = await createInspectionFixture(); try { await provide(fixture); } finally { await fixture.dispose(); } }, { scope: "worker" }],
});
async function login(page: Page, actor: { email: string; password: string }, destination: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(destination);
}
const action = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).or(page.getByRole("link", { name, exact: true }));
async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 45; index++) {
    if (await target.evaluate(el => document.activeElement === el)) {
      expect(await target.evaluate(el => el.matches(":focus-visible"))).toBe(true); return;
    }
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}
test.beforeEach(async ({ page, inspection }) => { await login(page, inspection.actors.taA, root); });

test("TA-01.1 TA-01.2 TA-01.3 restores combined filters and cursor on reload/back and renders role navigation", async ({ page }) => {
  for (const name of ["Submissions", "Flagged submissions", "Learners"]) await expect(page.getByRole("navigation").getByRole("link", { name, exact: true })).toBeVisible();
  const query = `learnerId=${id(11)}&challengeId=${id(101)}&gradingState=completed&limit=1`;
  const response = await page.request.get(`/api/v1/ta/submissions?${query}`);
  expect(response.status()).toBe(200);
  const { data: { nextCursor } } = await response.json();
  expect(nextCursor).toEqual(expect.any(String));
  const cursorPage = `${root}?${query}&cursor=${encodeURIComponent(nextCursor)}`;
  await page.goto(cursorPage);
  await expect(page.getByLabel("Learner ID")).toHaveValue(id(11));
  await expect(page.getByLabel("Challenge ID")).toHaveValue(id(101));
  await expect(page.getByLabel("Grading status")).toHaveValue("completed");
  await expect(page.getByRole("link", { name: "View submission" }).first()).toBeVisible();
  await page.reload();
  expect(new URL(page.url()).searchParams.get("cursor")).toBe(nextCursor);
  await expect(page.getByLabel("Learner ID")).toHaveValue(id(11));
  await action(page, "Clear filters").click();
  await expect(page).toHaveURL(root);
  await page.goBack();
  expect(new URL(page.url()).searchParams.get("cursor")).toBe(nextCursor);
  await expect(page.getByLabel("Learner ID")).toHaveValue(id(11));
  await page.getByLabel("Learner ID").fill("bad");
  await action(page, "Apply filters").click();
  await expect(page.getByText("Enter a valid ID.")).toBeVisible();
  await expect(page.getByLabel("Learner ID")).toHaveAttribute("aria-invalid", "true");
});
test("TA-01.4 TA-01.5 TA-01.8 shows identical evidence from queue/learner contexts with validated return links", async ({ page }) => {
  let expectedText: string | undefined;
  for (const [query, label, href] of [["", "Back to submissions", root], ["from=flags", "Back to flagged submissions", "/ta/flags"],
    [`from=learner&learnerId=${id(11)}`, "Back to learner", `/ta/learners/${id(11)}`]]) {
    await page.goto(`${detail}?${query}`);
    await expect(page.getByRole("heading", { name: "Submission", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: label })).toHaveAttribute("href", href);
    await expect(page.getByRole("link", { name: "Back to submissions" })).toHaveAttribute("href", root);
    await expect(page.getByRole("region", { name: "Original assessment" })).toContainText("25 / 100");
    await expect(page.getByRole("region", { name: "Current grade" })).toContainText("70 / 100");
    const source = page.getByRole("region", { name: "Source" });
    await expect(source).toContainText("return price * (1 - fraction)");
    const text = await source.innerText(); if (expectedText === undefined) expectedText = text; else expect(text).toBe(expectedText);
    await expect(page.locator("textarea,[contenteditable=true]")).toHaveCount(0);
    expect(await page.locator("main").innerText()).not.toContain("@example.test");
  }
  await page.goto(`${detail}?from=https://evil.example&learnerId=${id(11)}`);
  await expect(page.locator('a[href^="https://evil.example"]')).toHaveCount(0);
});
test("TA-01.6 refreshes pending/running/failed evidence by GET alone and retains completed zero", async ({ page, inspection }) => {
  const mutations: string[] = [];
  page.on("request", req => { if (req.method() !== "GET" && req.url().includes("/api/v1/")) mutations.push(req.url()); });
  for (const state of ["pending", "running", "failed"]) {
    await page.goto(`${root}/${inspection.statusIds[state]}`);
    await expect(page.getByText("Assessment not available.")).toBeVisible();
    await expect(page.getByText("Not available", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Source" })).toBeVisible();
    await page.getByRole("button", { name: "Refresh submission" }).click();
    await expect(page.getByText("Assessment not available.")).toBeVisible();
  }
  await page.goto(`${root}/${inspection.statusIds.zero}`);
  await expect(page.getByText("0 / 100", { exact: true })).toHaveCount(2);
  await expect(page.getByText("No comments submitted.")).toBeVisible();
  expect(mutations).toEqual([]);
});
test("TA-01.3 TA-01.7 shows read failure and explicit retry, invalid cursor and missing detail without false emptiness", async ({ page }) => {
  let reads = 0;
  await page.route(api, async route => {
    reads++;
    await route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "Read unavailable." } } });
  });
  await page.goto(root);
  await expect(page.getByText("We couldn't load submissions. Try again.")).toBeVisible();
  await expect(page.getByText("No submissions yet.")).toHaveCount(0);
  await action(page, "Try again").click(); await expect.poll(() => reads).toBe(2);
  await page.unroute(api);
  await page.goto(`${root}?cursor=broken`);
  await expect(page.getByText("This submissions page isn't valid.")).toBeVisible();
  await action(page, "First page").click(); await expect(page).toHaveURL(root);
  await page.route(`**/api/v1/ta/submissions/${id(501)}`, route => route.fulfill({ status: 503,
    json: { error: { code: "SERVICE_UNAVAILABLE", message: "Read unavailable." } } }));
  await page.goto(detail);
  await expect(page.getByText("We couldn't load this submission. Try again.")).toBeVisible();
  await expect(action(page, "Back to submissions")).toBeVisible();
  await page.unroute(`**/api/v1/ta/submissions/${id(501)}`);
  await action(page, "Try again").click();
  await expect(page.getByRole("region", { name: "Source" })).toBeVisible();
  await page.goto(`${root}/${id(999)}`);
  await expect(page.getByText("Submission not found.")).toBeVisible();
});

test("TA-01.7 SYS-11.2 SYS-11.4 removes protected evidence on post-entry account failures and never automatically replays", async ({ page }) => {
  for (const [status, code, failure, heading] of [[403, "FORBIDDEN", "account_unavailable", "Account unavailable"],
    [503, "SERVICE_UNAVAILABLE", "account_service_unavailable", "Service unavailable"]] as const) {
    let reads = 0;
    await page.route(`**/api/v1/ta/submissions/${id(501)}`, route => {
      reads++; return route.fulfill({ status, headers: { [accountAccessHeader]: failure }, json: { error: { code, message: "Account unavailable." } } });
    });
    await page.goto(detail);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Source" })).toHaveCount(0);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await page.waitForTimeout(250); expect(reads).toBe(1);
    await page.unroute(`**/api/v1/ta/submissions/${id(501)}`);
  }
});
test("SYS-09.3 TA-01.7 denies prefetched/reloaded evidence after sign-out and switching to a Learner", async ({ page, inspection }) => {
  await page.goto(root);
  const link = page.getByRole("link", { name: "View submission" }).first(); await link.hover();
  await link.click(); await expect(page.getByRole("region", { name: "Source" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await page.goto(detail); await expect(page.getByRole("region", { name: "Source" })).toHaveCount(0);
  await login(page, inspection.actors.learnerB, "/learner/challenges");
  await page.goto(detail); await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await page.reload(); await expect(page.getByRole("region", { name: "Source" })).toHaveCount(0);
  await page.goBack(); await expect(page.getByText("25 / 100", { exact: true })).toHaveCount(0);
});
test("SYS-17.1 SYS-17.3 TA-01.4 supports keyboard filters/detail and a labelled diff at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 }); await page.goto(root);
  await tabTo(page, page.getByLabel("Learner ID")); await page.keyboard.type(id(11));
  await tabTo(page, action(page, "Apply filters")); await page.keyboard.press("Enter");
  const link = page.getByRole("link", { name: "View submission" }).first(); await tabTo(page, link); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Submission", exact: true })).toBeFocused();
  const source = page.getByRole("region", { name: "Source" }); await tabTo(page, source);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await expect(action(page, "Back to submissions")).toBeVisible();
});
