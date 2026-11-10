import { randomUUID } from "node:crypto";
import { expect, test as base, type Page } from "@playwright/test";
import { insert } from "../../integration/domain/fixture";
import { createLearnerBrowseFixture } from "../../integration/domain/learner-browse-fixture";

type Fixture = Awaited<ReturnType<typeof createLearnerBrowseFixture>>;
const test = base.extend<{ learner: Fixture }>({
  learner: async ({}, provide) => {
    const fixture = await createLearnerBrowseFixture({ scope: "submission", pageSize: 0 });
    try {
      await provide(fixture);
    } finally {
      await fixture.dispose();
    }
  },
});

const original = "The calculation returns the discount instead of the amount owed.";
const abandoned = "Subtract the discount from the original price.";
const source = (page: Page) => page.getByRole("region", { name: "Source", exact: true });
const editCopy = (page: Page) => source(page).getByRole("button", { name: "Edit comment on line 3", exact: true });
const commentEditor = (page: Page) => page.getByRole("textbox", { name: "Comment on line 3", exact: true });
const retryHeading = (page: Page) => page.getByRole("heading", { name: "Retry review", exact: true });

async function abandonEditedRetry(page: Page, { actors, h, ids }: Fixture) {
  const first = randomUUID();
  const result = `/learner/history/${first}`;
  const retry = `${result}/retry`;
  const { id, email, password } = actors.learnerB;
  await insert(h.db, "public.submissions", {
    id: first, learner_id: id, challenge_id: ids.c1, revision_id: ids.revision1, attempt_number: 1,
  });
  await insert(h.db, "public.submission_comments", {
    id: randomUUID(), submission_id: first, ordinal: 0, line: 3, body: original,
  });

  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/learner/challenges");
  await page.goto(result);
  await page.getByRole("link", { name: "Retry challenge", exact: true }).click();
  await expect(page).toHaveURL(retry);
  await expect(retryHeading(page)).toBeVisible();

  await editCopy(page).click();
  await expect(commentEditor(page)).toHaveValue(original);
  await commentEditor(page).fill(abandoned);
  await page.getByRole("button", { name: "Save comment", exact: true }).click();
  await expect(source(page).getByText(abandoned, { exact: true })).toBeVisible();

  // The guard pauses browser Back until the dialog confirms departure.
  await page.evaluate(() => window.history.back());
  const leave = page.getByRole("dialog", { name: "Leave this review?", exact: true });
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "Leave review", exact: true }).click();
  await expect(page).toHaveURL(result);
  await expect(page.getByRole("heading", { name: "Review result", exact: true })).toBeVisible();
  return { result, retry };
}

test("LRN-06.6 restores fresh comment copies on browser Forward while still eligible", async ({ page, learner }) => {
  const { retry } = await abandonEditedRetry(page, learner);

  await page.goForward();
  await expect(page).toHaveURL(retry);
  await expect(retryHeading(page)).toBeVisible();
  await expect(source(page).getByText(original, { exact: true })).toBeVisible();
  await expect(source(page).getByText(abandoned, { exact: true })).toHaveCount(0);
  await editCopy(page).click();
  await expect(commentEditor(page)).toHaveValue(original);
});

test("LRN-06.5 LRN-06.6 LRN-06.7 denies browser Forward into a retry after unpublish", async ({ page, learner }) => {
  const { result, retry } = await abandonEditedRetry(page, learner);
  const { rowCount } = await learner.h.db.query(
    "update public.challenges set status = 'unpublished' where id = $1 and status = 'published'",
    [learner.ids.c1],
  );
  expect(rowCount).toBe(1);

  await page.goForward();
  await expect(page).toHaveURL(retry);
  await expect(page.getByRole("heading", { name: "Retry unavailable", exact: true })).toBeVisible();
  await expect(page.getByText("Retry is unavailable while this challenge is not published.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to result", exact: true })).toHaveAttribute("href", result);
  await expect(source(page)).toHaveCount(0);
});
