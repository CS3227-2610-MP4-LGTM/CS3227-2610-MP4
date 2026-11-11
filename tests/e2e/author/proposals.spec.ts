import { randomUUID } from "node:crypto";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { insert } from "../../integration/domain/fixture";
import { createAuthorFixture } from "../../integration/author/fixture";

const list = "/author/challenges";
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
  for (let tab = 0; tab < 80; tab++) {
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
  const title = `Proposal journey ${id.slice(0, 8)}`;
  await insert(author.h.db, "public.challenges", { id, author_id: author.actors.authorA.id, status: "draft" });
  await insert(author.h.db, "public.challenge_drafts", {
    challenge_id: id, title, description: author.checkout.description, language: "javascript", difficulty: "easy",
    working_code: author.checkout.source, flaw_count: 2, categories: ["logic_bug", "edge_case"],
  });
  return { id, title };
}

test("AUT-03.1 AUT-03.2 AUT-04.1 AUT-04.2 AUT-04.4 SYS-17.1 SYS-17.3 generates, decides and previews proposals by keyboard at phone width", async ({ page, author }) => {
  const draft = await freshDraft(author);
  await page.goto(`${list}/${draft.id}/configuration`);
  await expect(page.getByRole("heading", { name: "Flaw configuration", exact: true })).toBeVisible();
  await expectNoPageOverflow(page);

  await tabTo(page, page.getByRole("button", { name: "Generate proposals", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${list}/${draft.id}/proposals`);
  await expect(page.getByText("Proposals generated. Review every proposal before publishing.", { exact: true })).toBeVisible();
  const proposals = page.getByRole("list", { name: "Proposals" }).getByRole("listitem");
  await expect(proposals).toHaveCount(2);
  await expect(proposals.nth(0)).toContainText("Logic bug");
  await expect(proposals.nth(0)).toContainText("Pending");
  await expect(proposals.nth(1)).toContainText("Edge case");
  await expect(page.getByText("Decide every proposal to preview the final challenge.", { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);

  await tabTo(page, proposals.nth(0).getByRole("button", { name: "Reject", exact: true }));
  await page.keyboard.press("Enter");
  await expect(proposals.nth(0)).toContainText("Rejected");
  await tabTo(page, proposals.nth(1).getByRole("button", { name: "Approve", exact: true }));
  await page.keyboard.press("Enter");
  await expect(proposals.nth(1)).toContainText("Approved");

  await tabTo(page, page.getByRole("button", { name: "Preview final challenge", exact: true }));
  await page.keyboard.press("Enter");
  const preview = page.getByRole("region", { name: "Final challenge preview" });
  await expect(preview.getByRole("heading", { name: "Final challenge preview", exact: true })).toBeFocused();
  await expect(preview).toContainText("return prices.reduce((sum, price) => sum + price);");
  await expect(preview).toContainText("An empty basket causes reduce to throw.");
  await expect(preview).not.toContainText("Returns the discount amount instead of the payable price.");
  await expectNoPageOverflow(page);

  // Reopening reuses the saved set and decisions.
  await page.reload();
  await expect(proposals).toHaveCount(2);
  await expect(proposals.nth(0)).toContainText("Rejected");
  await expect(proposals.nth(1)).toContainText("Approved");
});

test("AUT-04.6 SYS-17.3 a draft without proposals points back to configuration", async ({ page, author }) => {
  const draft = await freshDraft(author);
  await page.goto(`${list}/${draft.id}/proposals`);
  await expect(page.getByText("Generate proposals before reviewing flaws.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to configuration", exact: true }).click();
  await expect(page).toHaveURL(`${list}/${draft.id}/configuration`);
  await expectNoPageOverflow(page);
});

test("AUT-03.1 SYS-12.1 another Author's proposals page is denied", async ({ page, author }) => {
  await page.goto(`${list}/${author.ids.c2}/proposals`);
  await expect(page.getByText("This challenge isn't available to your account.", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Proposals" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate proposals", exact: true })).toHaveCount(0);
  await expect(page.getByText(author.quotient.source.split("\n")[0], { exact: false })).toHaveCount(0);
});
