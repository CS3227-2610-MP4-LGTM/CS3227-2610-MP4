// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { localHarness } from "../auth/local";
import { flawedCode, insert, timestamp } from "./fixture";

const ids = {
  challenge: "37f10000-0000-4000-8000-000000000101",
  revision: "37f10000-0000-4000-8000-000000000201",
  submission: "37f10000-0000-4000-8000-000000000301",
  otherSubmission: "37f10000-0000-4000-8000-000000000302",
  run: "37f10000-0000-4000-8000-000000000501",
  grade: "37f10000-0000-4000-8000-000000000601",
};

let harness: ReturnType<typeof localHarness> | undefined;
let transactionStarted = false;
const createdUsers: string[] = [];

async function createAccount(
  { admin }: ReturnType<typeof localHarness>,
  name: string,
  role: "author" | "learner",
) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `t03-run-history-${name}@example.test`,
    password: "t03 local grading history fixture",
    email_confirm: true,
    user_metadata: { display_name: name, role },
  });
  if (error || !data.user) throw new Error(`Unable to provision local grading history account ${name}`);
  createdUsers.push(data.user.id);
  return data.user.id;
}

beforeAll(async () => {
  harness = localHarness();
  const { db } = harness;
  await db.connect();
  const authorId = await createAccount(harness, "author", "author");
  const learnerId = await createAccount(harness, "source", "learner");
  const otherLearnerId = await createAccount(harness, "target", "learner");

  await db.query("begin");
  transactionStarted = true;
  await insert(db, "public.challenges", { id: ids.challenge, author_id: authorId });
  await insert(db, "public.challenge_revisions", {
    id: ids.revision, challenge_id: ids.challenge, revision_number: 1,
    title: "Grading history fixture", description: "A pinned code revision.",
    language: "javascript", difficulty: "easy", flawed_code: flawedCode,
  });
  await db.query(
    `update public.challenges set status = 'published', published_revision_id = $1, row_version = 2
      where id = $2`, [ids.revision, ids.challenge],
  );

  for (const [id, owner] of [[ids.submission, learnerId], [ids.otherSubmission, otherLearnerId]]) {
    await insert(db, "public.submissions", {
      id, learner_id: owner, challenge_id: ids.challenge, revision_id: ids.revision, attempt_number: 1,
    });
  }
  await insert(db, "public.grading_runs", {
    id: ids.run, submission_id: ids.submission, state: "completed", run_number: 1,
    created_at: timestamp, finished_at: timestamp,
  });
  await insert(db, "public.ai_grades", {
    id: ids.grade, submission_id: ids.submission, score: 0, passed: false,
    identification_points: 0, explanation_points: 0, fix_points: 0,
  });
  await insert(db, "public.ai_grade_evidence", {
    grade_id: ids.grade, grading_run_id: ids.run, provider_output_retried: false,
  });
});

afterAll(async () => {
  if (!harness) return;
  try {
    if (transactionStarted) await harness.db.query("rollback");
  } finally {
    await harness.db.end();
  }

  const failedDeletes: string[] = [];
  for (const id of createdUsers) {
    const { error } = await harness.admin.auth.admin.deleteUser(id);
    if (error) failedDeletes.push(id);
  }
  expect(failedDeletes, "Local grading history accounts that could not be removed").toEqual([]);
});

const mutations = [
  { action: "reparenting to another submission", set: "submission_id = $2", value: ids.otherSubmission },
  { action: "renumbering", set: "run_number = $2", value: 2 },
  { action: "regression to pending", set: "state = $2, finished_at = null", value: "pending" },
  { action: "regression to running", set: "state = $2, finished_at = null", value: "running" },
] as const;

it.for(mutations)("SYS-12.4 REV-01 rejects $action on a completed grading run", async ({ set, value }) => {
  const db = harness!.db;
  await db.query("savepoint grading_run_mutation");
  try {
    await expect(db.query(
      `update public.grading_runs set ${set} where id = $1`, [ids.run, value],
    )).rejects.toMatchObject({ code: expect.stringMatching(/^(23514|P0001)$/) });
  } finally {
    await db.query("rollback to savepoint grading_run_mutation");
    await db.query("release savepoint grading_run_mutation");
  }

  const history = await db.query(
    `select run.submission_id, run.run_number, run.state, evidence.grading_run_id
      from public.ai_grade_evidence evidence
      join public.grading_runs run on run.id = evidence.grading_run_id
      where evidence.grade_id = $1`, [ids.grade],
  );
  expect(history.rows).toEqual([{
    submission_id: ids.submission, run_number: 1, state: "completed", grading_run_id: ids.run,
  }]);
});
