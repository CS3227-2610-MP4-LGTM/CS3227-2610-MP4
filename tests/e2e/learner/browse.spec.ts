import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { createLearnerBrowseFixture, longCheckoutLine } from "../../integration/domain/learner-browse-fixture";

const catalogue = "/learner/challenges";
const detail = (id: string) => `${catalogue}/${id}`;
const test = base.extend<object, { browse: Awaited<ReturnType<typeof createLearnerBrowseFixture>> }>({
  browse: [async ({}, provide) => {
    const fixture = await createLearnerBrowseFixture({ scope: "e2e" });
    try {
      await provide(fixture);
    } finally {
      await fixture.dispose();
    }
  }, { scope: "worker" }],
});

test.beforeEach(async ({ page, browse }) => {
  const { email, password } = browse.actors.learnerA;
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(catalogue);
});

const pageAction = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).or(page.getByRole("link", { name, exact: true }));

async function tabTo(page: Page, locator: Locator) {
  // No clicks or scripted focus. Bound the loop so a focus trap fails the test.
  for (let tab = 0; tab < 40; tab++) {
    if (await locator.evaluate((element) => element === document.activeElement)) {
      await expect(locator).toBeFocused();
      expect(await locator.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
      return;
    }
    await page.keyboard.press("Tab");
  }
  await expect(locator).toBeFocused({ timeout: 500 });
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }))).toEqual({ viewport: 320, page: 320 });
}

test("LRN-01.1 LRN-01.2 LRN-01.3 LRN-01.4 restores filtered cursor pages on direct entry, reload, back and forward", async ({ page, browse }) => {
  const filters = { language: "javascript", difficulty: "easy", category: "logic_bug" };
  const filtered = `${catalogue}?${new URLSearchParams(filters)}`;
  const matching = [browse.ids.c1, ...browse.ids.practice];
  const cards = page.getByRole("link", { name: "View challenge" });
  const expectCards = async (ids: readonly string[]) => {
    await expect(cards).toHaveCount(ids.length);
    expect(await cards.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(ids.map(detail));
    for (const [label, value] of [["Language", filters.language], ["Difficulty", filters.difficulty], ["Flaw category", filters.category]]) {
      await expect(page.getByRole("combobox", { name: label })).toHaveValue(value!);
    }
  };

  await page.goto(filtered);
  await expect(page.getByRole("heading", { name: "Challenges", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Review history" })).toBeVisible();
  await expectCards(matching.slice(0, 20));

  await pageAction(page, "Next page").click();
  await expectCards(matching.slice(20));
  const secondPage = new URL(page.url());
  expect(secondPage.pathname).toBe(catalogue);
  expect(Object.fromEntries(secondPage.searchParams)).toEqual({ ...filters, cursor: expect.any(String) });
  expect(secondPage.searchParams.get("cursor")).not.toBe("");
  await expect(pageAction(page, "Next page")).toHaveCount(0);
  await expect(pageAction(page, "First page")).toBeVisible();

  await page.reload();
  await expectCards(matching.slice(20));
  await expect(page).toHaveURL(secondPage.href);
  await page.goBack();
  await expectCards(matching.slice(0, 20));
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(filters);
  await page.goForward();
  await expectCards(matching.slice(20));
  await expect(page).toHaveURL(secondPage.href);

  await pageAction(page, "First page").click();
  await expectCards(matching.slice(0, 20));
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(filters);
  await expect(pageAction(page, "First page")).toHaveCount(0);
});

test("LRN-02.7 distinguishes a forbidden record from a missing challenge", async ({ page, browse }) => {
  for (const id of [browse.ids.unpublished, browse.ids.archived]) {
    await page.goto(detail(id));
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.getByText("This item isn't available to your account.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to my workspace" })).toHaveAttribute("href", catalogue);
    await expect(page.getByRole("region", { name: "Source" })).toHaveCount(0);
  }
  await page.goto(detail(browse.ids.missing));
  await expect(page.getByRole("heading", { name: "Challenge not found" })).toBeVisible();
  await expect(page.getByText("We couldn't find this challenge.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to challenges" })).toHaveAttribute("href", catalogue);
  await expect(page.getByRole("region", { name: "Source" })).toHaveCount(0);
});

test("LRN-02.5 shows the existing first-attempt destination when a second attempt exists", async ({ page, browse }) => {
  await page.goto(detail(browse.ids.c1));
  await expect(page.getByRole("heading", { name: "Checkout totals", exact: true })).toBeVisible();
  await expect(page.getByText("You have already submitted a review of this challenge.")).toBeVisible();
  await expect(page.getByRole("link", { name: "View first attempt" }))
    .toHaveAttribute("href", `/learner/history/${browse.ids.firstA}`);
  await expect(page.getByRole("button", { name: /submit|add (?:a )?comment/i })).toHaveCount(0);
});

test("LRN-01.2 LRN-02.1 LRN-02.2 SYS-17.1 SYS-17.3 supports keyboard navigation and source at 320 CSS pixels", async ({ page, browse }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`${catalogue}?language=javascript&difficulty=easy&category=logic_bug`);
  const language = page.getByRole("combobox", { name: "Language" });
  await tabTo(page, language);
  await expect(language).toHaveValue("javascript");

  const card = page.getByRole("link", { name: "View challenge" }).and(page.locator(`[href="${detail(browse.ids.longSource)}"]`));
  await tabTo(page, card);
  await expectNoPageOverflow(page);
  await page.keyboard.press("Enter");

  const heading = page.getByRole("heading", { name: "Practice checkout 01" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  const source = page.getByRole("region", { name: "Source" });
  await expect(source).toBeVisible();
  await expect(source.getByText("challenge.js")).toBeVisible();
  await expect(source.getByText("1", { exact: true })).toBeVisible();
  await expect(source).toContainText(longCheckoutLine);
  await expectNoPageOverflow(page);

  // A wrapping source has no horizontal scroller. A scrollable one must be
  // labelled and reachable by tab, and keyboard arrows must reveal more code.
  const scroller = source.or(source.locator("*")).filter({ visible: true });
  const scrollable = await scroller.evaluateAll((elements) => elements.findIndex((element) =>
    element.scrollWidth > element.clientWidth && ["auto", "scroll"].includes(getComputedStyle(element).overflowX),
  ));
  if (scrollable !== -1) {
    const target = scroller.nth(scrollable);
    await expect(target).toHaveAccessibleName(/source/i);
    await tabTo(page, target);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => target.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expectNoPageOverflow(page);
  }
});
