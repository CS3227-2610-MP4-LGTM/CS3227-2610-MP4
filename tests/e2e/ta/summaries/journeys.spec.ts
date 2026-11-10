import { randomUUID } from "node:crypto";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { accountAccessHeader } from "@/lib/learner/challenges";
import { createSummaryFixture } from "../../../integration/ta/summaries/fixture";
import { hostile, id, summary } from "../../../unit/ta/summaries/evidence";
const detail = `/ta/learners/${id(11)}`, summaryUrl = `/api/v1/ta/learners/${id(11)}/summary`, generationUrl = `/api/v1/ta/learners/${id(11)}/summaries`;
const test = base.extend<object, { summariesFixture: Awaited<ReturnType<typeof createSummaryFixture>> }>({
  summariesFixture: [async ({}, provide) => { const f = await createSummaryFixture(); try { await provide(f); } finally { await f.dispose(); } }, { scope: "worker" }],
});
async function login(page: Page, actor: { email: string; password: string }, destination = "/ta/submissions") {
  await page.goto("/sign-in"); await page.getByLabel("Email", { exact: true }).fill(actor.email); await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(destination);
}
async function tabTo(page: Page, control: Locator) {
  for (let n = 0; n < 60; n++) {
    if (await control.evaluate(el => el === document.activeElement)) { expect(await control.evaluate(el => el.matches(":focus-visible"))).toBe(true); return; }
    await page.keyboard.press("Tab");
  }
  await expect(control).toBeFocused();
}
test.beforeEach(async ({ page, summariesFixture }) => { await summariesFixture.clearGenerated(); await login(page, summariesFixture.actors.taA); });
test("TA-04.3 TA-04.4 entry, reload and navigation only read stored summaries; explicit generation survives supporting-evidence round trips", async ({ page }) => {
  const mutations: string[] = []; page.on("request", request => { if (request.url().includes(generationUrl) && request.method() === "POST") mutations.push(request.url()); });
  await page.goto(detail); const region = page.getByRole("region", { name: "Performance summary", exact: true });
  await expect(region.getByText("No performance summary yet.")).toBeVisible(); await page.reload(); await expect(region.getByText("No performance summary yet.")).toBeVisible();
  expect(mutations).toEqual([]); await region.getByRole("button", { name: "Generate summary", exact: true }).click();
  await expect(region.getByText("Performance summary generated.")).toBeVisible(); await expect(region.getByText("AI-generated summary — review the supporting submissions.")).toBeVisible();
  await expect(region.getByText("No strengths identified in this summary.")).toBeVisible(); await expect(region.getByText("No next steps suggested in this summary.")).toBeVisible();
  await region.getByRole("link", { name: "View supporting submission" }).first().click();
  await expect(page.getByRole("heading", { name: "Submission", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to learner", exact: true }).click(); await expect(page).toHaveURL(detail);
  await expect(region.getByRole("button", { name: "Regenerate summary", exact: true })).toBeVisible(); await page.reload();
  await expect(region.getByRole("button", { name: "Regenerate summary", exact: true })).toBeVisible(); expect(mutations).toHaveLength(1);
});
test("TA-04.4 overrides make retained summaries stale on refresh without auto-regeneration", async ({ page }) => {
  await page.goto(detail); const region = page.getByRole("region", { name: "Performance summary", exact: true });
  await region.getByRole("button", { name: "Generate summary", exact: true }).click(); await expect(region.getByText("Performance summary generated.")).toBeVisible();
  const response = await page.request.post(`/api/v1/ta/submissions/${id(501)}/overrides`, {
    headers: { Origin: new URL(page.url()).origin, "Idempotency-Key": randomUUID() }, data: { score: 80, reason: "Reviewing additional supporting evidence." },
  }); expect(response.status()).toBe(201);
  let generated = 0; page.on("request", request => { if (request.url().includes(generationUrl) && request.method() === "POST") generated++; });
  await region.getByRole("button", { name: "Refresh learner performance", exact: true }).click();
  await expect(region.getByText("This summary is out of date. Generate a new summary to include current evidence.")).toBeVisible(); expect(generated).toBe(0);
  await expect(page.getByRole("region", { name: "Category progress" }).getByText("100.00%", { exact: true })).toBeVisible();
});
test("TA-04.5 TA-04.7 a committed generation with a lost response recovers by reading without duplicate mutations", async ({ page, summariesFixture }) => {
  await page.goto(detail); const region = page.getByRole("region", { name: "Performance summary", exact: true }); let posts = 0;
  const lostReply = Promise.withResolvers<void>();
  await page.route(`**${generationUrl}`, async route => { posts++; await route.fetch(); await route.abort("failed"); lostReply.resolve(); });
  await region.getByRole("button", { name: "Generate summary", exact: true }).click();
  await lostReply.promise; await expect(region.getByText("Generating performance summary…")).toHaveCount(0);
  await region.getByRole("button", { name: "Refresh learner performance", exact: true }).click();
  await expect(region.getByText("AI-generated summary — review the supporting submissions.")).toBeVisible(); expect(posts).toBe(1);
  const rows = await summariesFixture.h.db.query("select count(*)::int n from public.performance_summaries where learner_id=$1", [id(11)]); expect(rows.rows[0].n).toBe(1);
});
test("TA-04.8 TA-05.6 summary and progress failures remain independent and refresh retries retain loaded summary text", async ({ page }) => {
  const value = summary();
  await page.route(`**${summaryUrl}`, route => route.fulfill({ json: { data: { summary: value, stale: false } } }));
  await page.route(`**/api/v1/ta/learners/${id(11)}/progress*`, route => route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "Unavailable." } } }));
  await page.goto(detail); const region = page.getByRole("region", { name: "Performance summary", exact: true });
  await expect(region.getByText(value.output.blindSpots[0].text)).toBeVisible(); await expect(page.getByText("We couldn't load category progress. Try again.")).toBeVisible();
  await page.unroute(`**/api/v1/ta/learners/${id(11)}/progress*`);
  await page.getByRole("region", { name: "Category progress" }).getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("region", { name: "Category progress" }).getByText("100.00%", { exact: true })).toBeVisible();
  await page.unroute(`**${summaryUrl}`); let reads = 0;
  await page.route(`**${summaryUrl}`, route => { reads++; return route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "Unavailable." } } }); });
  await region.getByRole("button", { name: "Refresh learner performance", exact: true }).click();
  await expect(region.getByText("We couldn't load the performance summary. Try again.")).toBeVisible(); await expect(region.getByText("Previously loaded summary; freshness unavailable.")).toBeVisible();
  await expect(region.getByText(value.output.blindSpots[0].text)).toBeVisible(); await expect(region.getByText("No performance summary yet.")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Category progress" }).getByText("100.00%", { exact: true })).toBeVisible();
  await region.getByRole("button", { name: "Try again", exact: true }).click(); await expect.poll(() => reads).toBe(2);
});
test("SEC-02.2 SYS-17.1 SYS-17.3 TA-04.3 inert generated content and keyboard generation fit 320 CSS pixels", async ({ page }) => {
  const value = summary(); value.output.blindSpots[0].text = hostile;
  const external: string[] = []; page.on("request", request => { if (request.url().includes("attacker.invalid")) external.push(request.url()); });
  await page.route(`**${summaryUrl}`, route => route.fulfill({ json: { data: { summary: value, stale: false } } }));
  await page.setViewportSize({ width: 320, height: 720 }); await page.goto(detail);
  const region = page.getByRole("region", { name: "Performance summary", exact: true }); await expect(region.getByText(hostile, { exact: true })).toBeVisible();
  await expect(region.locator("script,img,iframe")).toHaveCount(0); expect(external).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const generate = region.getByRole("button", { name: "Regenerate summary", exact: true }); await tabTo(page, generate); await page.keyboard.press("Enter");
  await expect(region.getByText("Performance summary generated.")).toBeVisible(); await expect(region.getByRole("heading", { name: "Performance summary", exact: true })).toBeFocused();
  const supporting = region.getByRole("link", { name: "View supporting submission" }).first(); await tabTo(page, supporting); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Submission", exact: true })).toBeVisible(); expect(external).toEqual([]);
});
test("SYS-09.3 SYS-11 TA-04.7 summary account failures remove retained protected content without automatically replaying generation", async ({ page }) => {
  await page.route(`**${summaryUrl}`, route => route.fulfill({ json: { data: { summary: summary(), stale: false } } }));
  await page.goto(detail); const region = page.getByRole("region", { name: "Performance summary", exact: true });
  await expect(region.getByText(summary().output.blindSpots[0].text)).toBeVisible(); let posts = 0;
  await page.route(`**${generationUrl}`, route => { posts++; return route.fulfill({ status: 403, headers: { [accountAccessHeader]: "account_unavailable" }, json: { error: { code: "FORBIDDEN", message: "Unavailable." } } }); });
  await region.getByRole("button", { name: "Regenerate summary", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account unavailable", exact: true })).toBeVisible();
  await expect(page.getByText("Learner A", { exact: true })).toHaveCount(0); await expect(page.getByText(summary().output.blindSpots[0].text)).toHaveCount(0); expect(posts).toBe(1);
});
test("SYS-09.3 SYS-12.5 account switching, prefetch, back and reload never disclose TA summaries to Learners or Authors", async ({ page, summariesFixture }) => {
  await page.goto("/ta/learners"); await page.getByRole("link", { name: "View learner", exact: true }).first().hover();
  await page.goto(detail); await page.getByRole("region", { name: "Performance summary", exact: true }).getByRole("button", { name: "Generate summary", exact: true }).click();
  await expect(page.getByText("Performance summary generated.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  for (const [key, landing] of [["learnerB", "/learner/challenges"], ["authorB", "/author/challenges"]] as const) {
    await login(page, summariesFixture.actors[key], landing);
    await page.goto(detail); await expect(page.getByRole("heading", { name: "Access denied", exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByText(summary().output.blindSpots[0].text)).toHaveCount(0);
    expect((await page.request.get(summaryUrl)).status()).toBe(403); await page.goBack();
    await expect(page.getByText(summary().output.blindSpots[0].text)).toHaveCount(0);
    await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  }
  expect((await page.request.get(summaryUrl)).status()).toBe(401);
});
