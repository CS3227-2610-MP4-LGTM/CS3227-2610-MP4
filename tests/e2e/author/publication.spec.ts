import { randomUUID } from "node:crypto";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { insert } from "../../integration/domain/fixture";
import { createAuthorFixture } from "../../integration/author/fixture";

const list = "/author/challenges";
const catalogue = "/learner/challenges";
type Fixture = Awaited<ReturnType<typeof createAuthorFixture>>;

/** Accounting rows are keyed by account, not actor or author, so the fixture's own cleanup leaves them. */
async function clearAccounting(author: Fixture) {
  const accounts = Object.values(author.actors).map(actor => actor.id);
  await author.h.db.query("begin");
  try {
    await author.h.db.query("set local session_replication_role = replica");
    for (const table of ["llm_usage_events", "ai_usage_records", "llm_operations"]) {
      await author.h.db.query(`delete from private.${table} where account_id = any($1::uuid[])`, [accounts]);
    }
    await author.h.db.query("commit");
  } catch (error) {
    await author.h.db.query("rollback");
    throw error;
  }
}

const test = base.extend<object, { author: Fixture }>({
  author: [async ({}, provide) => {
    const fixture = await createAuthorFixture("author-e2e");
    try {
      await clearAccounting(fixture);
      await provide(fixture);
    } finally {
      try { await clearAccounting(fixture); } finally { await fixture.dispose(); }
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

/** A fresh Author A checkout draft (count 2, Logic bug and Edge case) that the fake provider can inject into. */
async function freshDraft(author: Fixture) {
  const id = randomUUID();
  const title = `Publication journey ${id.slice(0, 8)}`;
  await insert(author.h.db, "public.challenges", { id, author_id: author.actors.authorA.id, status: "draft" });
  await insert(author.h.db, "public.challenge_drafts", {
    challenge_id: id, title, description: author.checkout.description, language: "javascript", difficulty: "easy",
    working_code: author.checkout.source, flaw_count: 2, categories: ["logic_bug", "edge_case"],
  });
  return { id, title };
}

test("AUT-05.1 AUT-05.2 AUT-05.3 SYS-17.1 SYS-17.3 publishes an approved challenge by keyboard at phone width and Learners can find it", async ({ page, author, browser }) => {
  const draft = await freshDraft(author);
  await page.goto(`${list}/${draft.id}/configuration`);
  await tabTo(page, page.getByRole("button", { name: "Generate proposals", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${list}/${draft.id}/proposals`);
  const proposals = page.getByRole("list", { name: "Proposals" }).getByRole("listitem");
  await expect(proposals).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Publish challenge", exact: true })).toHaveCount(0);

  await tabTo(page, proposals.nth(0).getByRole("button", { name: "Reject", exact: true }));
  await page.keyboard.press("Enter");
  await expect(proposals.nth(0)).toContainText("Rejected");
  await tabTo(page, proposals.nth(1).getByRole("button", { name: "Approve", exact: true }));
  await page.keyboard.press("Enter");
  await expect(proposals.nth(1)).toContainText("Approved");
  await tabTo(page, page.getByRole("button", { name: "Preview final challenge", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Final challenge preview" })).toBeVisible();

  const publish = page.getByRole("button", { name: "Publish challenge", exact: true });
  await expect(publish).toBeVisible();
  await expectNoPageOverflow(page);
  await tabTo(page, publish);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(`${list}/${draft.id}/publication`);
  await expect(page.getByRole("heading", { level: 1, name: "Publication result", exact: true })).toBeFocused();
  await expect(page.getByText("Challenge published.", { exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toContainText(/Revision\D{0,12}1\b/);
  await expect(page.locator("time")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Back to challenges", exact: true })).toHaveAttribute("href", list);
  await expectNoPageOverflow(page);

  await tabTo(page, page.getByRole("link", { name: "View published challenge", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${list}/${draft.id}/revisions/[0-9a-f-]{36}$`));
  const main = page.getByRole("main");
  await expect(main).toContainText(draft.title);
  await expect(main).toContainText("return prices.reduce((sum, price) => sum + price);");
  await expect(main).toContainText("return prices.reduce((sum, price) => sum + price, 0);");
  await expect(main).toContainText("An empty basket causes reduce to throw.");
  await expect(main).toContainText("Supply zero as the initial accumulator.");
  await expect(main).toContainText("Consider the smallest possible basket.");
  await expect(main).not.toContainText("Returns the discount amount instead of the payable price.");
  await expectNoPageOverflow(page);

  // The Author's list shows the new status, and a Learner now finds the challenge without answers or hints.
  await page.goto(list);
  await expect(page.getByRole("main")).toContainText(draft.title);
  const learner = await browser.newContext({ viewport: { width: 320, height: 800 } });
  try {
    const learnerPage = await learner.newPage();
    await signIn(learnerPage, author.actors.learnerA, catalogue);
    await learnerPage.goto(`${catalogue}/${draft.id}`);
    const view = learnerPage.getByRole("main");
    await expect(view).toContainText(draft.title);
    await expect(view).toContainText("return prices.reduce((sum, price) => sum + price);");
    await expect(view).not.toContainText("An empty basket causes reduce to throw.");
    await expect(view).not.toContainText("Consider the smallest possible basket.");
  } finally {
    await learner.close();
  }
});

test("AUT-05.3 SYS-12.1 another Author's published revision page is denied", async ({ page, author }) => {
  await page.goto(`${list}/${author.ids.c2}/revisions/${author.ids.quotientRevision}`);
  await expect(page.getByText("This challenge isn't available to your account.", { exact: true })).toBeVisible();
  await expect(page.getByText(author.quotient.source.split("\n")[0], { exact: false })).toHaveCount(0);
});
