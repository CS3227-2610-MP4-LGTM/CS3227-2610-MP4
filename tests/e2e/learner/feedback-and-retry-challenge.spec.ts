import { randomUUID } from "node:crypto";
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { insert } from "../../integration/domain/fixture";
import { createLearnerBrowseFixture } from "../../integration/domain/learner-browse-fixture";

type Fixture = Awaited<ReturnType<typeof createLearnerBrowseFixture>>;
const test = base.extend<object, { feedback: Fixture }>({
  feedback: [async ({}, provide) => {
    const fixture = await createLearnerBrowseFixture({ scope: "submission", pageSize: 0 });
    try {
      await provide(fixture);
    } finally {
      await fixture.dispose();
    }
  }, { scope: "worker" }],
});

const resultPath = (id: string) => `/learner/history/${id}`;
const retryPath = (id: string) => `${resultPath(id)}/retry`;
const pinnedLine = "return price * fraction;";
const liveLine = "return price * fraction * fraction;";
const note1 = "The return value is the discount. Return the amount owed after applying the discount.";
const note2 = "The amount here is the discount itself.";
const editedNote = "The payment excludes the discount amount.";
const cachedHint = "Consider the smallest possible basket.";

async function seedFirst(fixture: Fixture, actor: "learnerA" | "learnerB", challengeId: string, revisionId: string) {
  const id = randomUUID();
  await insert(fixture.h.db, "public.submissions", {
    id, learner_id: fixture.actors[actor].id, challenge_id: challengeId, revision_id: revisionId, attempt_number: 1,
  });
  return id;
}

async function signIn(page: Page, actor: Fixture["actors"]["learnerA"]) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/learner/challenges");
}

async function keyboardActivate(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let tab = 0; tab < 50; tab++) {
    if (await target.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused({ timeout: 500 });
  expect(await target.evaluate(element => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
}

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
}

test("LRN-06.3 LRN-06.6 SYS-17.1 SYS-17.3 reveals a hint and submits a pinned retry by keyboard at phone width", async ({ page, feedback }) => {
  const { ids, h, actors } = feedback;
  const first = await seedFirst(feedback, "learnerB", ids.c1, ids.revision1);
  for (const [ordinal, body] of [note1, note2].entries()) {
    await insert(h.db, "public.submission_comments", {
      id: randomUUID(), submission_id: first, ordinal, line: 3, body,
    });
  }
  await feedback.publishNextRevision();
  await page.setViewportSize({ width: 320, height: 720 });
  await signIn(page, actors.learnerB);

  const hints: string[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.includes("/hints/")) hints.push(path);
  });
  const { rows: [{ id: hintId }] } = await h.db.query<{ id: string }>(
    "select id from public.flaw_hints where revision_id = $1 and text = $2", [ids.revision1, cachedHint],
  );
  const hintPath = `/api/v1/submissions/${first}/hints/${hintId}`;
  await page.goto(resultPath(first));
  await expect(page.getByRole("heading", { name: "Review result" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Original assessment", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Earned credit" })).toBeVisible();
  await expect(page.getByText(cachedHint, { exact: true })).toHaveCount(0);
  expect(hints).toEqual([]);
  await noPageOverflow(page);

  await keyboardActivate(page, page.getByRole("button", { name: /Show hint.*Edge case|Edge case.*Show hint/i }));
  await expect(page.getByText(cachedHint, { exact: true })).toBeVisible();
  expect(hints).toEqual([hintPath]);
  await noPageOverflow(page);
  await keyboardActivate(page, page.getByRole("link", { name: "Retry challenge", exact: true }));
  await expect(page).toHaveURL(retryPath(first));
  await expect(page.getByRole("heading", { name: "Retry review", exact: true })).toBeVisible();
  await expect(page.getByText("Checkout totals", { exact: true })).toBeVisible();
  await expect(page.getByText("Attempt 2", { exact: true })).toBeVisible();
  const source = page.getByRole("region", { name: "Source" });
  await expect(source).toContainText(pinnedLine);
  await expect(source).not.toContainText(liveLine);
  await expect(source.getByText(note1, { exact: true })).toBeVisible();
  await expect(source.getByText(note2, { exact: true })).toBeVisible();
  await noPageOverflow(page);

  await keyboardActivate(page, page.getByRole("link", { name: "Back to result", exact: true }));
  const leave = page.getByRole("dialog", { name: "Leave this review?" });
  await expect(leave).toContainText("Your unsaved comments will be lost.");
  await keyboardActivate(page, leave.getByRole("button", { name: "Keep reviewing" }));
  await expect(page).toHaveURL(retryPath(first));

  const edit = page.getByRole("button", { name: "Edit comment on line 3", exact: true }).first();
  const editor = page.getByRole("textbox", { name: "Comment on line 3", exact: true });
  await keyboardActivate(page, edit);
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue(note1);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(editedNote);
  await keyboardActivate(page, page.getByRole("button", { name: "Save comment", exact: true }));
  await expect(source.getByText(editedNote, { exact: true })).toBeVisible();
  page.once("dialog", dialog => void dialog.accept());
  await page.reload();
  await expect(source.getByText(note1, { exact: true })).toBeVisible();
  await expect(source.getByText(editedNote, { exact: true })).toHaveCount(0);

  await keyboardActivate(page, page.getByRole("button", { name: "Submit review", exact: true }));
  const confirmation = page.getByRole("dialog", { name: "Submit review?" });
  await expect(confirmation).toContainText("2 comments.");
  const responsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === `/api/v1/challenges/${ids.c1}/submissions` && response.request().method() === "POST");
  await keyboardActivate(page, confirmation.getByRole("button", { name: "Confirm submission" }));
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toEqual({
    revisionId: ids.revision1, previousSubmissionId: first, comments: [{ line: 3, body: note1 }, { line: 3, body: note2 }],
  });
  await expect(page).toHaveURL(/\/learner\/history\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i);
  const second = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(second).not.toBe(first);
  await expect(page.getByRole("heading", { name: "Review result" })).toBeVisible();
  await expect(page.getByText("Attempt 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Original assessment", exact: true })).toBeVisible();
  await expect(leave).toHaveCount(0);
  await noPageOverflow(page);

  await page.goto(retryPath(second));
  await expect(page.getByRole("heading", { name: "Retry unavailable" })).toBeVisible();
  await expect(page.getByText("A second attempt cannot be retried.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to result", exact: true })).toHaveAttribute("href", resultPath(second));
  await page.goto(retryPath(first));
  await expect(page.getByText("You have used your retry.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Retry review" })).toHaveCount(0);
});

test("LRN-06.7 ACC-03 SYS-09 denies direct retry URLs across account changes and handles missing and incomplete results", async ({ page, feedback }) => {
  const { ids, actors, h, createdAt, newerAt } = feedback;
  const foreign = await seedFirst(feedback, "learnerA", ids.c2, ids.quotientRevision);
  const failed = await seedFirst(feedback, "learnerB", ids.c2, ids.quotientRevision);
  await insert(h.db, "public.grading_runs", {
    submission_id: failed, run_number: 1, state: "failed", failure_code: "AI_UNAVAILABLE",
    created_at: createdAt, finished_at: newerAt,
  });
  await page.goto(retryPath(failed));
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await expect(page.getByText("Sign in to continue.", { exact: true })).toBeVisible();
  await signIn(page, actors.learnerB);
  await page.goto(retryPath(foreign));
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByText("This item isn't available to your account.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Source" })).toHaveCount(0);

  await page.goto(retryPath(ids.missing));
  await expect(page.getByRole("heading", { name: "Review not found" })).toBeVisible();
  await expect(page.getByText("We couldn't find this review.", { exact: true })).toBeVisible();

  await page.goto(retryPath(failed));
  await expect(page.getByRole("heading", { name: "Retry unavailable" })).toBeVisible();
  await expect(page.getByText("Retry is available after your first assessment completes.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to result", exact: true })).toHaveAttribute("href", resultPath(failed));
  await expect(page.getByRole("region", { name: "Source" })).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await page.goto(retryPath(failed));
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await expect(page.getByText("Retry is available after your first assessment completes.", { exact: true })).toHaveCount(0);
});

test("LRN-06.7 rechecks the same retry entry after a recoverable read failure", async ({ page, feedback }) => {
  const { h, actors, ids, createdAt, newerAt } = feedback;
  const id = await seedFirst(feedback, "learnerB", ids.differentLanguage, ids.differentLanguageRevision);
  const runId = randomUUID();
  const gradeId = randomUUID();
  // An incomplete retained result causes the existing result read to fail closed.
  await insert(h.db, "public.grading_runs", {
    id: runId, submission_id: id, run_number: 1, state: "completed", created_at: createdAt, finished_at: newerAt,
  });
  await signIn(page, actors.learnerB);
  await page.goto(retryPath(id));
  await expect(page.getByText("We couldn't load your retry. Try again.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Source" })).toHaveCount(0);

  await insert(h.db, "public.ai_grades", {
    id: gradeId, submission_id: id, score: 0, passed: false, identification_points: 0, explanation_points: 0, fix_points: 0,
  });
  await insert(h.db, "public.ai_grade_evidence", { grade_id: gradeId, grading_run_id: runId, provider_output_retried: false });
  const { rows } = await h.db.query<{ flaw_id: string; hint_id: string; category: string }>(`
    select h.flaw_id, h.id as hint_id, f.category from public.flaw_hints h
    join public.revision_flaws f on f.id = h.flaw_id where h.revision_id = $1 order by f.start_line, f.id`,
  [ids.differentLanguageRevision]);
  for (const [ordinal, { flaw_id, hint_id, category }] of rows.entries()) {
    await insert(h.db, "public.ai_grade_assessments", { grade_id: gradeId, flaw_id });
    await insert(h.db, "public.ai_grade_eligible_hints", { grade_id: gradeId, hint_id, category, ordinal });
  }
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page).toHaveURL(retryPath(id));
  await expect(page.getByRole("heading", { name: "Retry review", exact: true })).toBeVisible();
  await expect(page.getByText("Attempt 2", { exact: true })).toBeVisible();
});
