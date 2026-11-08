import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { createLearnerBrowseFixture, longCheckoutLine } from "../../integration/domain/learner-browse-fixture";

const catalogue = "/learner/challenges";
const challengeHref = (id: string) => `${catalogue}/${id}`;
const test = base.extend<object, { review: Awaited<ReturnType<typeof createLearnerBrowseFixture>> }>({
  review: [async ({}, provide) => {
    const fixture = await createLearnerBrowseFixture({ scope: "e2e", pageSize: 1, cleanupFeatureSubmissions: true });
    try {
      await provide(fixture);
    } finally {
      await fixture.dispose();
    }
  }, { scope: "worker" }],
});

test.beforeEach(async ({ page, review }) => {
  const { email, password } = review.actors.learnerA;
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(catalogue);
});

const challengeCard = (page: Page, id: string) =>
  page.getByRole("link", { name: "View challenge", exact: true }).and(page.locator(`[href="${challengeHref(id)}"]`));
const addAtLine = (page: Page, line: number) =>
  page.getByRole("button", { name: new RegExp(`^Add comment\\b.*\\b${line}\\b`, "i") });
const editor = (page: Page) => page.getByRole("textbox", { name: /^Comment\b/i });
const addComment = (page: Page) => page.getByRole("button", { name: "Add comment", exact: true });
const leaveDialog = (page: Page) => page.getByRole("dialog", { name: /Leave this review\?/i })
  .or(page.getByRole("alertdialog", { name: /Leave this review\?/i }));

async function activateByKeyboard(page: Page, control: Locator) {
  await expect(control).toBeVisible();
  for (let tab = 0; tab < 40; tab++) {
    if (await control.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(control).toBeFocused({ timeout: 500 });
  expect(await control.evaluate(element => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
}

test("LRN-03.1 LRN-04.1 LRN-04.3 SYS-17.1 SYS-17.3 submits with the keyboard at phone width and opens the read-only result", async ({ page, review }) => {
  const body = "Multiply by one minus the discount fraction.";
  const browserDialogs: string[] = [];
  page.on("dialog", async dialog => {
    browserDialogs.push(dialog.type());
    await dialog.dismiss();
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await activateByKeyboard(page, challengeCard(page, review.ids.longSource));
  await expect(page).toHaveURL(challengeHref(review.ids.longSource));

  await activateByKeyboard(page, addAtLine(page, 4));
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type(body);
  await expectNoPageOverflow(page);
  await activateByKeyboard(page, addComment(page));
  await expect(page.getByText(body, { exact: true })).toBeVisible();

  await activateByKeyboard(page, page.getByRole("button", { name: "Submit review", exact: true }));
  await expect(page.getByRole("heading", { name: "Submit review?", exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await activateByKeyboard(page, page.getByRole("button", { name: "Confirm submission", exact: true }));

  await expect(page).toHaveURL(/\/learner\/history\/[\da-f-]{36}$/i);
  const result = page.getByRole("main");
  await expect(result.getByRole("region", { name: "Source" })).toContainText(longCheckoutLine);
  await expect(result.getByText(body, { exact: true })).toBeVisible();
  await expect(result.getByText(/\bpending\b/i)).toBeVisible();
  await expect(result.getByRole("button", { name: /^(Add comment|Edit|Remove|Submit review)\b/i })).toHaveCount(0);
  await expect(editor(page)).toHaveCount(0);
  await expect(leaveDialog(page)).toHaveCount(0);
  expect(browserDialogs).toEqual([]);
  await expectNoPageOverflow(page);
});

test("LRN-03.4 ACC-02.5 ACC-03.2 guards workspace links, role links, Back and sign-out with both dialog choices", async ({ page, review }) => {
  const reviewHref = challengeHref(review.ids.c2);
  const workspaceNav = page.getByRole("navigation", { name: "Workspace" });
  const draft = "The broad catch hides division errors.";
  const dialog = leaveDialog(page);
  const departures = [
    {
      name: "workspace link",
      leave: () => page.getByRole("link", { name: "Back to challenges", exact: true }).click(),
      destination: catalogue,
      editorOnly: true,
    },
    {
      name: "role navigation link",
      leave: () => workspaceNav.getByRole("link", { name: "Review history", exact: true }).click(),
      destination: "/learner/history",
    },
    {
      name: "browser Back",
      // Request traversal without waiting for a navigation that the guard can cancel.
      leave: () => page.evaluate(() => window.history.back()),
      destination: catalogue,
    },
    {
      name: "sign-out",
      leave: () => workspaceNav.getByRole("button", { name: "Sign out", exact: true }).click(),
      destination: /\/sign-in(?:\?|$)/,
    },
  ];

  for (const { name, leave, destination, editorOnly } of departures) {
    await test.step(name, async () => {
      if (new URL(page.url()).pathname !== catalogue) {
        await workspaceNav.getByRole("link", { name: "Challenges", exact: true }).click();
        await expect(page).toHaveURL(catalogue);
      }
      await challengeCard(page, review.ids.c2).click();
      await expect(page).toHaveURL(reviewHref);
      await expect(page.getByRole("heading", { name: "Safe quotient", exact: true })).toBeVisible();
      await expect(page.getByText(draft, { exact: true })).toHaveCount(0);
      await expect(editor(page)).toHaveCount(0);
      await addAtLine(page, 2).click();
      await editor(page).fill(draft);
      if (!editorOnly) {
        await addComment(page).click();
        await expect(page.getByText(draft, { exact: true })).toBeVisible();
      }

      await leave();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(/Your unsaved comments will be lost\./)).toBeVisible();
      await dialog.getByRole("button", { name: "Keep reviewing", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(reviewHref);
      if (editorOnly) await expect(editor(page)).toHaveValue(draft);
      else await expect(page.getByText(draft, { exact: true })).toBeVisible();

      await leave();
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Leave review", exact: true }).click();
      await expect(page).toHaveURL(destination);
      await expect(page.getByText(draft, { exact: true })).toHaveCount(0);
    });
  }
  await expect(page.getByText("You have signed out.", { exact: true })).toBeVisible();
});

test("LRN-03.4 uses the native reload warning and discards the draft after reload", async ({ page, review }) => {
  const draft = "Do not turn exceptions into a quotient of zero.";
  await challengeCard(page, review.ids.c2).click();
  await addAtLine(page, 2).click();
  await editor(page).fill(draft);
  await addComment(page).click();
  await expect(page.getByText(draft, { exact: true })).toBeVisible();

  const [dialogType] = await Promise.all([
    page.waitForEvent("dialog").then(async dialog => {
      await dialog.accept();
      return dialog.type();
    }),
    page.reload(),
  ]);
  expect(dialogType).toBe("beforeunload");

  await expect(page).toHaveURL(challengeHref(review.ids.c2));
  await expect(addAtLine(page, 2)).toBeVisible();
  await expect(page.getByText(draft, { exact: true })).toHaveCount(0);
  await expect(editor(page)).toHaveCount(0);
});
