import { randomUUID } from "node:crypto";
import { expect, test as base, type Page } from "@playwright/test";
import { insert, quote } from "../../integration/domain/fixture";
import { createLearnerBrowseFixture } from "../../integration/domain/learner-browse-fixture";

type Fixture = Awaited<ReturnType<typeof createLearnerBrowseFixture>>;
const test = base.extend<object, { grading: Fixture }>({
  grading: [async ({}, provide) => {
    const fixture = await createLearnerBrowseFixture({ scope: "e2e", pageSize: 1, cleanupFeatureSubmissions: true });
    try {
      await provide(fixture);
    } finally {
      const { db } = fixture.h;
      const account = fixture.actors.learnerA.id;
      await db.query("begin");
      try {
        await db.query("set local session_replication_role = replica");
        for (const table of ["llm_usage_events", "ai_usage_records", "llm_operations"]) {
          await db.query(`delete from private.${quote(table)} where account_id = $1`, [account]);
        }
        const ledgers = await db.query<{ table_name: string }>(`select c.table_name
          from information_schema.columns c
          join information_schema.tables t using (table_schema, table_name)
          where c.table_schema = 'private' and t.table_type = 'BASE TABLE'
            and c.column_name = 'submission_id' and c.udt_name = 'uuid'`);
        const submissions = "select id from public.submissions where learner_id = $1 and id <> all($2::uuid[])";
        const bindings = [account, [fixture.ids.firstA, fixture.ids.secondA]];
        for (const { table_name } of ledgers.rows) {
          await db.query(`delete from private.${quote(table_name)} where submission_id in (${submissions})`, bindings);
        }
        for (const table of ["ai_grade_evidence", "ai_grade_comment_results", "ai_grade_assessments", "ai_grade_eligible_hints"]) {
          await db.query(`delete from public.${quote(table)} where grade_id in
            (select id from public.ai_grades where submission_id in (${submissions}))`, bindings);
        }
        for (const table of ["review_flags", "ai_grades"]) {
          await db.query(`delete from public.${quote(table)} where submission_id in (${submissions})`, bindings);
        }
        await db.query("commit");
      } catch (error) {
        await db.query("rollback");
        throw error;
      } finally {
        await fixture.dispose();
      }
    }
  }, { scope: "worker" }],
});

const readPath = (id: string) => `/api/v1/submissions/${id}`;
const resultPath = (id: string) => `/learner/history/${id}`;
const exactText = (page: Page, text: string) => page.getByText(text, { exact: true });
const note = "The handler makes an error look like a successful zero.";

async function seedSubmission(fixture: Fixture, challengeId: string, revisionId: string, line: number) {
  const id = randomUUID();
  await insert(fixture.h.db, "public.submissions", {
    id, learner_id: fixture.actors.learnerA.id, challenge_id: challengeId, revision_id: revisionId, attempt_number: 1,
  });
  await insert(fixture.h.db, "public.submission_comments", {
    id: randomUUID(), submission_id: id, ordinal: 0, line, body: note,
  });
  return id;
}

test.beforeEach(async ({ page, grading }) => {
  const { email, password } = grading.actors.learnerA;
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/learner/challenges");
});

test("LRN-05.1 LRN-05.2 LRN-05.4 SYS-19.2 starts pending grading once and reopens the original on the same attempt", async ({ page, grading }) => {
  const id = await seedSubmission(grading, grading.ids.c2, grading.ids.quotientRevision, 2);
  const resume = Promise.withResolvers<void>();
  const requests: string[] = [];
  await page.route(`**${readPath(id)}/grade`, async route => {
    requests.push(route.request().method());
    await resume.promise;
    await route.continue();
  });

  try {
    await page.goto(resultPath(id));
    await expect(page.getByRole("heading", { name: "Review result", exact: true })).toBeVisible();
    await expect(exactText(page, "Safe quotient")).toBeVisible();
    await expect(exactText(page, "Grading pending")).toBeVisible();
    await expect(page.getByText(/\b\d+ \/ 100\b/)).toHaveCount(0);
    await expect(exactText(page, note)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Review history", exact: true }).first()).toHaveAttribute("href", "/learner/history");
    await expect(page.getByRole("link", { name: "Browse challenges", exact: true }).first()).toHaveAttribute("href", "/learner/challenges");
    await expect.poll(() => requests.length).toBe(1);
  } finally {
    resume.resolve();
  }

  await expect(exactText(page, "Original assessment")).toHaveCount(1);
  await expect(page.getByText(/^\d+ \/ 100$/)).toHaveCount(1);
  await expect(exactText(page, "Explanation credit")).toHaveCount(1);
  await expect(exactText(page, "Fix credit")).toHaveCount(1);
  await page.reload();
  await expect(exactText(page, "Original assessment")).toHaveCount(1);
  expect(requests).toEqual(["POST"]);
  const { rows } = await grading.h.db.query("select state, run_number from public.grading_runs where submission_id = $1", [id]);
  expect(rows).toEqual([{ state: "completed", run_number: 1 }]);
});

test("LRN-05.2 LRN-05.3 LRN-05.7 observes a reopened run, recovers a status read and retries only on explicit action", async ({ page, grading }) => {
  const id = await seedSubmission(grading, grading.ids.practice[0], grading.longPublication.revisionId, 4);
  const runId = randomUUID();
  await insert(grading.h.db, "public.grading_runs", { id: runId, submission_id: id, run_number: 1, state: "running" });

  let grades = 0;
  const resume = Promise.withResolvers<void>();
  await page.route(`**${readPath(id)}/grade`, async route => {
    grades++;
    await resume.promise;
    await route.continue();
  });
  let rejectStatus = false;
  await page.route(`**${readPath(id)}`, async route => {
    if (rejectStatus) {
      rejectStatus = false;
      await route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "Temporary read failure." } } });
    } else await route.continue();
  });

  try {
    await page.goto(resultPath(id));
    await expect(exactText(page, "Grading your review…")).toBeVisible();
    await page.reload();
    await expect(exactText(page, "Grading your review…")).toBeVisible();
    rejectStatus = true;
    await expect(exactText(page, "We couldn't update grading status.")).toBeVisible();
    await expect(exactText(page, "Grading your review…")).toBeVisible();
    await expect(exactText(page, "Grading failed. Your review is still saved.")).toHaveCount(0);
    expect(grades).toBe(0);

    await grading.h.db.query(`update public.grading_runs set state = 'failed',
      finished_at = clock_timestamp(), failure_code = 'AI_UNAVAILABLE' where id = $1`, [runId]);
    await page.getByRole("button", { name: "Check status", exact: true }).click();
    await expect(exactText(page, "AI grading is unavailable. Try grading again.")).toBeVisible();
    await page.reload();
    await expect(exactText(page, "Grading failed. Your review is still saved.")).toBeVisible();
    expect(grades).toBe(0);

    await page.getByRole("button", { name: "Retry grading", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retrying grading…", exact: true })).toBeDisabled();
  } finally {
    resume.resolve();
  }

  await expect(exactText(page, "Original assessment")).toHaveCount(1);
  await expect(page).toHaveURL(resultPath(id));
  await expect(exactText(page, note)).toBeVisible();
  expect(grades).toBe(1);
  const { rows } = await grading.h.db.query(`select state, run_number from public.grading_runs
    where submission_id = $1 order by run_number`, [id]);
  expect(rows).toEqual([{ state: "failed", run_number: 1 }, { state: "completed", run_number: 2 }]);
});

test("LRN-05.3 LRN-05.6 keeps an input-limit failure visible after reopen without a retry action", async ({ page, grading }) => {
  const id = await seedSubmission(grading, grading.ids.differentLanguage, grading.ids.differentLanguageRevision, 2);
  await grading.h.db.query(`insert into public.grading_runs (submission_id, run_number, state, finished_at, failure_code)
    values ($1, 1, 'failed', clock_timestamp(), 'PAYLOAD_TOO_LARGE')`, [id]);
  const grades: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === readPath(id) + "/grade") grades.push(request.method());
  });
  await page.goto(resultPath(id));
  await expect(exactText(page, "This review is too large for grading. Your submitted review is saved.")).toBeVisible();
  await page.reload();
  await expect(exactText(page, "Grading failed. Your review is still saved.")).toBeVisible();
  await expect(exactText(page, note)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry grading", exact: true })).toHaveCount(0);
  await expect(page.getByText(/^\d+ \/ 100$/)).toHaveCount(0);
  expect(grades).toEqual([]);
});
