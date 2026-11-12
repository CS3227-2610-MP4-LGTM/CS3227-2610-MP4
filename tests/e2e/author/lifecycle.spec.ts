import { test as base, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { createAuthorFixture } from "../../integration/author/fixture";

const list = "/author/challenges";
const catalogue = "/learner/challenges";
type Fixture = Awaited<ReturnType<typeof createAuthorFixture>>;

const test = base.extend<object, { author: Fixture }>({
  author: [async ({}, provide) => {
    const fixture = await createAuthorFixture("author-e2e");
    try {
      await provide(fixture);
    } finally {
      await fixture.dispose();
    }
  }, { scope: "worker" }],
});

test.use({ viewport: { width: 320, height: 800 } });

async function signIn(page: Page, actor: { email: string; password: string }, landing: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(landing);
}

test.beforeEach(async ({ page, author }) => {
  await signIn(page, author.actors.authorA, list);
});

async function tabTo(page: Page, locator: Locator) {
  // No clicks or scripted focus. Bound the loop so a focus trap fails the test.
  for (let tab = 0; tab < 120; tab++) {
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

/** Whether a Learner can open the challenge's catalogue detail, seen through its published title. */
async function learnerSees(browser: Browser, author: Fixture, id: string, title: string) {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  try {
    const learner = await context.newPage();
    await signIn(learner, author.actors.learnerB, catalogue);
    await learner.goto(`${catalogue}/${id}`);
    // Wait for the settled outcome (the challenge title or a not-found/denied page), not network idle:
    // the denied page keeps a request open, so networkidle never settles there.
    await expect(learner.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    return (await learner.getByRole("heading", { name: title }).count()) > 0;
  } finally {
    await context.close();
  }
}

const cases = [
  {
    ids: "AUT-06.4 AUT-06.7", name: "Unpublish", challenge: "differentCategory" as const, title: "Category filter control",
    prompt: "Unpublish this challenge? Learners won't be able to start or retry it.", done: "Challenge unpublished.",
  },
  {
    ids: "AUT-06.5 AUT-06.7", name: "Archive", challenge: "differentDifficulty" as const, title: "Difficulty filter control",
    prompt: "Archive this challenge? This can't be undone. Editing, publishing and new attempts will be unavailable.",
    done: "Challenge archived.",
  },
];

for (const { ids, name, challenge, title, prompt, done } of cases) {
  test(`${ids} SYS-17.1 SYS-17.3 confirms ${name} by keyboard at phone width and Learners can no longer open the challenge`,
    async ({ page, author, browser }) => {
      const id = author.ids[challenge];
      expect(await learnerSees(browser, author, id, title)).toBe(true);

      await page.goto(`${list}/${id}`);
      const trigger = page.getByRole("button", { name, exact: true });
      await expect(trigger).toBeVisible();
      await expectNoPageOverflow(page);

      // Cancel by keyboard changes nothing and returns focus to the trigger.
      await tabTo(page, trigger);
      await page.keyboard.press("Enter");
      const confirm = page.getByRole("dialog");
      await expect(confirm).toContainText(prompt);
      await tabTo(page, confirm.getByRole("button", { name: "Cancel", exact: true }));
      await page.keyboard.press("Enter");
      await expect(confirm).toHaveCount(0);
      await expect(trigger).toBeFocused();

      await page.keyboard.press("Enter");
      await expect(confirm).toContainText(prompt);
      await expectNoPageOverflow(page);
      await tabTo(page, confirm.getByRole("button", { name, exact: true }));
      await page.keyboard.press("Enter");

      await expect(page).toHaveURL(new RegExp(`${list}(?:\\?.*)?$`));
      await expect(page.getByRole("status").filter({ hasText: done })).toBeVisible();
      await expectNoPageOverflow(page);

      expect(await learnerSees(browser, author, id, title)).toBe(false);
    });
}

test("AUT-06.5 an archived challenge's detail is read-only with no lifecycle, restore or delete action", async ({ page, author }) => {
  await page.goto(`${list}/${author.ids.archivedA}`);
  await expect(page.getByText("Archived challenges can't be edited.", { exact: true })).toBeVisible();
  for (const name of ["Edit draft", "Unpublish", "Archive"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: /restore|delete/i })).toHaveCount(0);
});
