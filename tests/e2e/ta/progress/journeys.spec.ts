import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { createProgressFixture } from "../../../integration/ta/progress/fixture";
import { id } from "../../../unit/ta/progress/evidence";
import { accountAccessHeader } from "@/lib/learner/challenges";
const root = "/ta/learners", detail = `${root}/${id(11)}`;
const test = base.extend<object, { progressFixture: Awaited<ReturnType<typeof createProgressFixture>> }>({
  progressFixture: [async ({}, provide) => { const f = await createProgressFixture(); try { await provide(f); } finally { await f.dispose(); } }, { scope: "worker" }],
});
async function login(page: Page, actor: { email: string; password: string }, destination = "/ta/submissions") {
  await page.goto("/sign-in"); await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(destination);
}
const action = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).or(page.getByRole("link", { name, exact: true }));
async function tabTo(page: Page, target: Locator) {
  for (let n = 0; n < 50; n++) {
    if (await target.evaluate(el => el === document.activeElement)) {
      expect(await target.evaluate(el => el.matches(":focus-visible"))).toBe(true); return;
    }
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}
test.beforeEach(async ({ page, progressFixture }) => { await login(page, progressFixture.actors.taA); });
test("TA-04.1 TA-04.3 TA-04.4 TA-05.7 learner navigation and supporting submission round trip preserve learner context", async ({ page }) => {
  const summaryPath = `/api/v1/ta/learners/${id(11)}/summary`;
  const generationPath = `/api/v1/ta/learners/${id(11)}/summaries`;
  const generations: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === generationPath) generations.push(request.url());
  });
  const summaryRead = () => page.waitForResponse(response => response.request().method() === "GET" && new URL(response.url()).pathname === summaryPath);
  await page.getByRole("navigation").getByRole("link", { name: "Learners", exact: true }).click();
  await expect(page).toHaveURL(root);
  for (const name of ["Submissions", "Flagged submissions", "Learners"]) await expect(page.getByRole("navigation").getByRole("link", { name, exact: true })).toBeVisible();
  const initialRead = summaryRead();
  await page.goto(detail);
  expect((await initialRead).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Learner performance", exact: true })).toBeVisible();
  const summary = page.getByRole("region", { name: "Performance summary" });
  const generate = summary.getByRole("button", { name: /^(Generate|Regenerate) summary$/ });
  await expect(summary).toBeVisible();
  await expect(generate).toHaveCount(1);
  await expect(generate).toBeVisible();
  expect(generations).toEqual([]);
  await page.getByRole("link", { name: "View submissions", exact: true }).first().click();
  await expect(page).toHaveURL(`/ta/submissions?learnerId=${id(11)}`);
  await page.getByRole("link", { name: "View submission", exact: true }).first().click();
  await expect(page.getByRole("region", { name: "Original assessment" })).toContainText("25 / 100");
  const returnedRead = summaryRead();
  await page.getByRole("link", { name: "Back to learner", exact: true }).click();
  await expect(page).toHaveURL(detail);
  expect((await returnedRead).status()).toBe(200);
  await expect(generate).toHaveCount(1);
  await expect(generate).toBeVisible();
  await page.getByRole("link", { name: "Back to learners", exact: true }).click(); await expect(page).toHaveURL(root);
  await expect(page.getByRole("link", { name: "View learner", exact: true }).first()).toBeVisible();
  expect(await page.getByRole("main").innerText()).not.toMatch(/@example\.test|email/i);
  expect(generations).toEqual([]);
});
test("TA-04.2 learner cursor survives reload/back; invalid pages recover explicitly", async ({ page }) => {
  const response = await page.request.get("/api/v1/ta/learners?limit=1"); expect(response.status()).toBe(200);
  const { data: { nextCursor } } = await response.json(); expect(nextCursor).toEqual(expect.any(String));
  const cursorPage = `${root}?limit=1&cursor=${encodeURIComponent(nextCursor)}`;
  await page.goto(cursorPage); await expect(page.getByRole("link", { name: "View learner" })).toHaveCount(1);
  await page.reload(); expect(new URL(page.url()).searchParams.get("cursor")).toBe(nextCursor);
  await action(page, "First page").click(); expect(new URL(page.url()).searchParams.has("cursor")).toBe(false);
  await page.goBack(); expect(new URL(page.url()).searchParams.get("cursor")).toBe(nextCursor);
  await page.goto(`${root}?cursor=broken`); await expect(page.getByText("This learners page isn't valid.")).toBeVisible();
  await action(page, "First page").click(); await expect(page).toHaveURL(root);
  let reads = 0; const pattern = "**/api/v1/ta/learners?*";
  await page.route(pattern, route => { reads++; return route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "Unavailable." } } }); });
  await page.goto(`${root}?limit=1`); await expect(page.getByText("We couldn't load learners. Try again.")).toBeVisible();
  await expect(page.getByText("No learners yet.")).toHaveCount(0); await action(page, "Try again").click();
  await expect.poll(() => reads).toBe(2); await page.unroute(pattern);
});
test("TA-05.1 TA-05.2 TA-05.5 deterministic entry/refresh shows original counts without mutation requests", async ({ page, progressFixture }) => {
  const mutations: string[] = []; const before = await progressFixture.snapshot();
  page.on("request", request => { if (request.url().includes("/api/v1/") && request.method() !== "GET") mutations.push(request.url()); });
  await page.goto(detail);
  const region = page.getByRole("region", { name: "Category progress" });
  await expect(region.getByText("100.00%", { exact: true })).toBeVisible(); await expect(region.getByText("0.00%", { exact: true })).toBeVisible();
  await expect(region.getByText("Not observed", { exact: true })).toHaveCount(3);
  await page.getByRole("button", { name: "Refresh progress and recommendations" }).click();
  await expect(region.getByText("100.00%", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh progress and recommendations" })).toBeEnabled();
  expect(mutations).toEqual([]); expect(await progressFixture.snapshot()).toEqual(before);
});
for (const section of ["progress", "recommendations"] as const) {
  test(`TA-05.5 TA-05.6 ${section} refresh failure retains prior content and does not hide other sections`, async ({ page }) => {
    await page.goto(detail);
    const progress = page.getByRole("region", { name: "Category progress" });
    await expect(progress.getByText("100.00%", { exact: true })).toBeVisible();
    const pattern = `**/api/v1/ta/learners/${id(11)}/${section}*`;
    await page.route(pattern, route => route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "Unavailable." } } }));
    await page.getByRole("button", { name: "Refresh progress and recommendations" }).click();
    await expect(page.getByText(`Previously loaded ${section}`)).toBeVisible();
    await expect(page.getByRole("region", { name: "Performance summary" })).toBeVisible();
    await expect(progress.getByText("100.00%", { exact: true })).toBeVisible();
    await page.unroute(pattern);
    const region = page.getByRole("region", { name: section === "progress" ? "Category progress" : "Recommended challenges" });
    await region.getByRole("button", { name: "Try again" }).click(); await expect(page.getByText(`Previously loaded ${section}`)).toHaveCount(0);
  });
}
test("TA-05.7 SYS-09.3 prefetched learner data disappears after sign-out and account switching", async ({ page, progressFixture }) => {
  await page.goto(root); const link = page.getByRole("link", { name: "View learner" }).first(); await link.hover(); await link.click();
  await expect(page.getByRole("region", { name: "Category progress" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await page.goto(detail); await expect(page.getByRole("region", { name: "Category progress" })).toHaveCount(0);
  await login(page, progressFixture.actors.learnerB, "/learner/challenges");
  for (const path of [root, detail]) {
    await page.goto(path); await expect(page.getByRole("heading", { name: "Access denied", exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByRole("region", { name: "Category progress" })).toHaveCount(0);
  }
  await page.goBack(); await expect(page.getByText("100.00%", { exact: true })).toHaveCount(0);
});
test("TA-05.7 SYS-11 account failures remove retained identity and deterministic content instead of showing stale protected data", async ({ page }) => {
  for (const [status, code, failure, heading] of [[403, "FORBIDDEN", "account_unavailable", "Account unavailable"], [503, "SERVICE_UNAVAILABLE", "account_service_unavailable", "Service unavailable"]] as const) {
    await page.goto(detail); await expect(page.getByRole("region", { name: "Category progress" })).toBeVisible();
    const pattern = `**/api/v1/ta/learners/${id(11)}/progress*`;
    await page.route(pattern, route => route.fulfill({ status, headers: { [accountAccessHeader]: failure }, json: { error: { code, message: "Account unavailable." } } }));
    await page.getByRole("button", { name: "Refresh progress and recommendations" }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Category progress" })).toHaveCount(0);
    await expect(page.getByText("Learner A", { exact: true })).toHaveCount(0); await page.unroute(pattern);
  }
});
test("TA-04.2 TA-05.7 missing or wrong-role learner identity never exposes a summary or progress", async ({ page }) => {
  await page.goto(`${root}/${id(999)}`); await expect(page.getByText("Learner not found.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to learners", exact: true })).toBeVisible();
  await page.goto(`${root}/${id(1)}`); await expect(page.getByRole("region", { name: "Category progress" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Performance summary" })).toHaveCount(0);
});
test("SYS-17.1 SYS-17.3 TA-04.1 TA-05.1 all learner controls are keyboard reachable at 320 CSS pixels with labels intact", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 }); await page.goto(root);
  const link = page.getByRole("link", { name: "View learner" }).first(); await tabTo(page, link); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Learner performance", exact: true })).toBeFocused();
  const refresh = page.getByRole("button", { name: "Refresh progress and recommendations" }); await tabTo(page, refresh); await page.keyboard.press("Enter");
  await expect(refresh).toBeEnabled();
  for (const label of ["Category", "Identified flaws", "Total flaws", "Identification rate", "Completed first attempts"]) await expect(page.getByRole("region", { name: "Category progress" }).getByText(label, { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await tabTo(page, page.getByRole("link", { name: "Back to learners", exact: true })); await page.keyboard.press("Enter"); await expect(page).toHaveURL(root);
});
