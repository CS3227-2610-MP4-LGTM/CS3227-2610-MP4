import { randomUUID } from "node:crypto";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { createAuthorFixture } from "../../integration/author/fixture";

const list = "/author/challenges";
const test = base.extend<object, { author: Awaited<ReturnType<typeof createAuthorFixture>> }>({
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

test.beforeEach(async ({ page, author }) => {
  const { email, password } = author.actors.authorA;
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(list);
});

async function tabTo(page: Page, locator: Locator) {
  // No clicks or scripted focus. Bound the loop so a focus trap fails the test.
  for (let tab = 0; tab < 60; tab++) {
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

test("AUT-01.1 AUT-01.3 AUT-02.1 SYS-17.1 SYS-17.3 creates a draft by keyboard at phone width and opens Flaw configuration", async ({ page }) => {
  const title = `Keyboard draft ${randomUUID().slice(0, 8)}`;
  await expect(page.getByRole("heading", { name: "My challenges", exact: true })).toBeVisible();
  const create = page.getByRole("main").getByRole("link", { name: "Create challenge", exact: true });
  await tabTo(page, create);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${list}/new`);
  await expect(page.getByRole("heading", { name: "Create challenge", exact: true })).toBeVisible();
  await expectNoPageOverflow(page);

  const titleField = page.getByRole("textbox", { name: "Title", exact: true });
  await tabTo(page, titleField);
  await page.keyboard.type(title);
  await page.getByRole("textbox", { name: "Description", exact: true }).fill("Review the basket total helper.");
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("python");
  await page.getByRole("combobox", { name: "Difficulty", exact: true }).selectOption("medium");
  await page.getByRole("textbox", { name: "Working code", exact: true })
    .fill("def total(items):\n    return sum(items)\n");
  const count = page.getByLabel("Flaw count", { exact: true });
  if (await count.evaluate((element) => element.tagName === "SELECT")) await count.selectOption("1");
  else await count.fill("1");
  const category = page.getByRole("group", { name: "Flaw categories" }).getByRole("checkbox", { name: "Edge case", exact: true });
  await tabTo(page, category);
  await page.keyboard.press("Space");
  await expect(category).toBeChecked();
  await expectNoPageOverflow(page);

  await tabTo(page, page.getByRole("button", { name: "Save draft", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${list}/[0-9a-f-]{36}/configuration$`));
  await expect(page.getByRole("heading", { name: "Flaw configuration", exact: true })).toBeVisible();
  await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Flaw count", { exact: true })).toHaveValue("1");
  await expectNoPageOverflow(page);

  await page.getByRole("link", { name: "Back to challenges", exact: true }).click();
  await expect(page).toHaveURL(list);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});

test("AUT-06.1 AUT-06.2 AUT-06.3 SYS-17.3 filters, opens and edits an own draft at phone width", async ({ page, author }) => {
  const renamed = `Edited checkout ${randomUUID().slice(0, 8)}`;
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("draft");
  const row = page.getByRole("listitem").filter({ hasText: "Draft checkout" })
    .or(page.getByRole("row").filter({ hasText: "Draft checkout" }))
    .or(page.getByRole("article").filter({ hasText: "Draft checkout" }));
  await expect(row.first()).toBeVisible();
  await expect(page.getByText("Hard checkout", { exact: true })).toHaveCount(0);
  await expectNoPageOverflow(page);
  await row.first().getByRole("link", { name: "View challenge", exact: true }).click();

  await expect(page).toHaveURL(`${list}/${author.ids.draft}`);
  await expect(page.getByRole("heading", { name: "Draft checkout", exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.getByRole("link", { name: "Edit draft", exact: true }).click();
  await expect(page).toHaveURL(`${list}/${author.ids.draft}/edit`);
  const titleField = page.getByRole("textbox", { name: "Title", exact: true });
  await expect(titleField).toHaveValue("Draft checkout");
  await titleField.fill(renamed);
  await expectNoPageOverflow(page);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Draft changes saved.", { exact: true })).toBeVisible();

  await page.goto(list);
  await expect(page.getByText(renamed, { exact: true })).toBeVisible();
});

test("AUT-01.4 SYS-12.1 another Author's draft is not shown and its detail is denied", async ({ page, author }) => {
  await expect(page.getByText("Safe quotient working draft", { exact: true })).toHaveCount(0);
  await page.goto(`${list}/${author.ids.c2}`);
  await expect(page.getByText("Safe quotient working draft", { exact: true })).toHaveCount(0);
  await expect(page.getByText(author.quotient.source.split("\n")[0], { exact: false })).toHaveCount(0);
});
