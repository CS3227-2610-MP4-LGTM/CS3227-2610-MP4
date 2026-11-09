import { localHarness } from "../auth/local";
import { insert } from "./fixture";

const password = "local learner browse fixture";
const createdAt = "2026-01-01T00:00:00Z";
const newerAt = "2026-01-01T00:00:01Z";
const actorKeys = ["authorA", "authorB", "learnerA", "learnerB", "taA", "taB"] as const;
type ActorKey = typeof actorKeys[number];
type Actor = { id: string; email: string; password: string; client: ReturnType<ReturnType<typeof localHarness>["client"]> };
type Change = {
  category: string;
  start: number;
  end: number;
  replacement: string[];
  explanation: string;
  fix: string;
  hint: string;
};
type Publication = {
  title: string;
  description: string;
  language: "javascript" | "python";
  difficulty: "easy" | "medium" | "hard";
  source: string;
  changes: Change[];
  rejected?: Change[];
};

const checkout: Publication = {
  title: "Checkout totals",
  description: "Review the changes to discounts and basket totals.",
  language: "javascript",
  difficulty: "easy",
  source: [
    "function discounted(price, percent) {",
    "  const fraction = percent / 100;",
    "  return price * (1 - fraction);",
    "}",
    "",
    "// Basket totals use whole currency units.",
    "",
    "function basketTotal(items) {",
    "  const prices = items.map(item => item.price);",
    "  return prices.reduce((sum, price) => sum + price, 0);",
    "}",
    "",
  ].join("\n"),
  changes: [
    {
      category: "logic_bug", start: 3, end: 3, replacement: ["  return price * fraction;"],
      explanation: "Returns the discount amount instead of the payable price.",
      fix: "Multiply price by one minus fraction.",
      hint: "Consider what the returned value represents at the extremes of a discount.",
    },
    {
      category: "edge_case", start: 10, end: 10, replacement: ["  return prices.reduce((sum, price) => sum + price);"],
      explanation: "An empty basket causes reduce to throw.",
      fix: "Supply zero as the initial accumulator.",
      hint: "Consider the smallest possible basket.",
    },
  ],
};

const quotient: Publication = {
  title: "Safe quotient",
  description: "Review the changes to the quotient helper.",
  language: "python",
  difficulty: "medium",
  source: 'def quotient(a, b):\n    if b == 0:\n        raise ValueError("zero divisor")\n    return a / b\n',
  changes: [{
    category: "error_handling", start: 2, end: 4,
    replacement: ["    try:", "        return a / b", "    except Exception:", "        return 0"],
    explanation: "A broad exception handler silently turns failures into success.",
    fix: "Validate zero explicitly and let unexpected exceptions propagate.",
    hint: "Consider whether callers can distinguish success from failure.",
  }],
};

const nextCheckout: Publication = {
  ...checkout,
  changes: checkout.changes.map((change, index) => ({
    ...change, category: "performance",
    replacement: [index === 0 ? "  return price * fraction * fraction;" : "  return prices.reduce((sum, price) => sum + price) + 1;"],
  })),
  rejected: [{
    category: "security", start: 6, end: 6, replacement: ["// Rejected proposal"],
    explanation: "This proposal is only a fixture.", fix: "Keep the original comment.",
    hint: "The rejected proposal has no published hint.",
  }],
};

function revisionSource(publication: Publication) {
  const lines = publication.source.split("\n");
  for (const { start, end, replacement } of publication.changes.toReversed()) {
    lines.splice(start - 1, end - start + 1, ...replacement);
  }
  return lines.join("\n");
}

export const longCheckoutLine = `// ${"checkout ".repeat(40).trimEnd()}`;

export async function createLearnerBrowseFixture({
  scope, pageSize = 21, cleanupFeatureSubmissions = scope === "submission",
}: { scope: "integration" | "e2e" | "submission"; pageSize?: number; cleanupFeatureSubmissions?: boolean }) {
  const h = localHarness();
  const prefix = { integration: "49a00000", e2e: "49b00000", submission: "50a00000" }[scope];
  const id = (n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const practice = Array.from({ length: pageSize }, (_, index) => id(1000 + index));
  const ids = {
    c1: id(101), c2: id(102), draft: id(103), unpublished: id(104), archived: id(105), missing: id(106),
    differentLanguage: id(107), differentDifficulty: id(108), differentCategory: id(109),
    revision1: id(201), revision2: id(211), quotientRevision: id(202),
    archivedRevision: id(205), unpublishedRevision: id(204),
    differentLanguageRevision: id(207), differentDifficultyRevision: id(208), differentCategoryRevision: id(209),
    reviewChallenge: id(112), reviewRevision: id(212),
    firstA: id(501), secondA: id(502), firstB: id(503), failedB: id(504),
    practice, longSource: practice[0],
  };
  const actors = {} as Record<ActorKey, Actor>;
  const createdUsers: string[] = [];
  const rows: { table: string; key: string; id: string }[] = [];
  const longPublication: Publication = {
    ...checkout,
    title: "Practice checkout 01",
    source: `${longCheckoutLine}\n${checkout.source}`.trimEnd(),
    changes: [{ ...checkout.changes[0], start: 4, end: 4 }],
  };
  let nextId = 2000;

  async function put(table: string, row: Record<string, unknown>, key = "id") {
    await insert(h.db, `public.${table}`, row);
    rows.push({ table, key, id: row[key] as string });
  }

  async function setPublication(challengeId: string, revisionId: string) {
    await h.db.query(`update public.challenges set published_revision_id = $2,
      status = 'published', row_version = row_version + 1 where id = $1`, [challengeId, revisionId]);
  }

  async function addChallenge(challengeId: string, author: Actor) {
    await put("challenges", { id: challengeId, author_id: author.id, created_at: createdAt, updated_at: createdAt });
  }

  async function addRevision(challengeId: string, revisionId: string, number: number,
    publication: Publication, publishedAt: string) {
    const { title, description, language, difficulty, source, changes, rejected = [] } = publication;
    const metadata = { title, description, language, difficulty };
    const flawedCode = revisionSource(publication);
    const setId = id(nextId++);
    const configured = [...changes, ...rejected];
    await put("proposal_sets", {
      id: setId, challenge_id: challengeId, source_draft_version: number, created_at: createdAt,
      input_snapshot: JSON.stringify({
        ...metadata, workingCode: source, flawCount: configured.length,
        categories: [...new Set(configured.map(({ category }) => category))],
      }),
    });
    await put("challenge_revisions", {
      ...metadata, id: revisionId, challenge_id: challengeId, revision_number: number,
      flawed_code: flawedCode, published_at: publishedAt,
    });

    const sourceLines = source.split("\n");
    let offset = 0;
    const hunks = changes.map(({ start, end, replacement }) => {
      const original = sourceLines.slice(start - 1, end);
      const newStart = start + offset;
      offset += replacement.length - original.length;
      return {
        oldStart: start, oldCount: original.length, newStart, newCount: replacement.length,
        lines: [
          ...original.map((text, index) => ({ kind: "removed", text, oldLine: start + index, newLine: null })),
          ...replacement.map((text, index) => ({ kind: "added", text, oldLine: null, newLine: newStart + index })),
        ],
      };
    });
    await put("revision_answers", {
      revision_id: revisionId, working_code: source,
      real_diff: JSON.stringify({
        path: language === "javascript" ? "challenge.js" : "challenge.py", before: source, after: flawedCode, hunks,
      }),
    }, "revision_id");

    for (const [index, change] of configured.entries()) {
      const { category, start, end, replacement, explanation, fix, hint } = change;
      const proposalId = id(nextId++);
      const details = {
        category, original_snippet: sourceLines.slice(start - 1, end).join("\n"),
        replacement_snippet: replacement.join("\n"), source_start_line: start, source_end_line: end, explanation, fix,
      };
      await put("proposals", { ...details, id: proposalId, proposal_set_id: setId });
      const hunk = hunks[index];
      await put("proposal_decisions", { proposal_id: proposalId, decision: hunk ? "approved" : "rejected" }, "proposal_id");
      if (hunk) {
        const flawId = number === 1 && challengeId === ids.c1 ? id(301 + index)
          : challengeId === ids.c2 ? id(303) : id(nextId++);
        const hintId = number === 1 && challengeId === ids.c1 ? id(401 + index)
          : challengeId === ids.c2 ? id(403) : id(nextId++);
        await put("revision_flaws", {
          ...details, id: flawId, proposal_id: proposalId, revision_id: revisionId,
          start_line: hunk.newStart, end_line: hunk.newStart + hunk.newCount - 1,
        });
        await put("flaw_hints", {
          id: hintId, flaw_id: flawId, revision_id: revisionId, text: hint, generation_metadata: "{}",
        });
      }
    }
  }

  async function publish(challengeId: string, revisionId: string, author: Actor,
    publication: Publication, publishedAt = createdAt) {
    await addChallenge(challengeId, author);
    await addRevision(challengeId, revisionId, 1, publication, publishedAt);
    await setPublication(challengeId, revisionId);
  }

  async function addAttempt({
    submissionId, learner, challengeId, revisionId, previousId = null, state, score,
  }: {
    submissionId: string; learner: Actor; challengeId: string; revisionId: string; previousId?: string | null;
    state: "completed" | "pending" | "failed"; score?: number;
  }) {
    const submittedAt = previousId ? "2026-01-01T00:00:03Z" : "2026-01-01T00:00:02Z";
    await put("submissions", {
      id: submissionId, learner_id: learner.id, challenge_id: challengeId, revision_id: revisionId,
      attempt_number: previousId ? 2 : 1, previous_submission_id: previousId, submitted_at: submittedAt,
    });
    const runId = id(nextId++);
    await put("grading_runs", {
      id: runId, submission_id: submissionId, run_number: 1, state,
      failure_code: state === "failed" ? "AI_UNAVAILABLE" : null, created_at: submittedAt,
      finished_at: state === "pending" ? null : submittedAt,
    });
    if (score !== undefined) {
      const gradeId = id(nextId++);
      await put("ai_grades", {
        id: gradeId, submission_id: submissionId, score, passed: score >= 60,
        identification_points: score === 100 ? 50 : 0,
        explanation_points: score === 100 ? 30 : 15,
        fix_points: score === 100 ? 20 : 10,
      });
      await put("ai_grade_evidence", {
        grade_id: gradeId, grading_run_id: runId, provider_output_retried: false, created_at: submittedAt,
      }, "grade_id");
    }
  }

  async function disposeCreatedSubmissions() {
    if (!cleanupFeatureSubmissions || createdUsers.length === 0) return;
    const { rows: [ledger] } = await h.db.query<{ exists: boolean }>(
      "select to_regclass('private.submission_create_requests') is not null as exists",
    );
    if (ledger.exists) {
      await h.db.query("delete from private.submission_create_requests where actor_id = any($1::uuid[])", [createdUsers]);
    }
    const seeded = rows.filter(row => row.table === "submissions").map(row => row.id);
    const { rows: submissions } = await h.db.query<{ id: string }>(`
      select id from public.submissions where learner_id = any($1::uuid[]) and id <> all($2::uuid[])
    `, [createdUsers, seeded]);
    const submissionIds = submissions.map(row => row.id);
    if (!submissionIds.length) return;
    await h.db.query("delete from public.submission_comments where submission_id = any($1::uuid[])", [submissionIds]);
    await h.db.query("delete from public.grading_runs where submission_id = any($1::uuid[])", [submissionIds]);
    await h.db.query("delete from public.submissions where id = any($1::uuid[])", [submissionIds]);
  }

  async function dispose() {
    try {
      if (rows.length) {
        await h.db.query("begin");
        try {
          // Committed rows are needed by PostgREST. Bypass immutability and circular
          // fixture FKs only within this connection's cleanup transaction.
          await h.db.query("set local session_replication_role = replica");
          await disposeCreatedSubmissions();
          for (const row of rows.toReversed()) {
            await h.db.query(`delete from public.${row.table} where ${row.key} = $1`, [row.id]);
          }
          await h.db.query("commit");
          rows.length = 0;
        } catch (error) {
          await h.db.query("rollback");
          throw error;
        }
      }
    } finally {
      await h.db.end();
    }
    const failures = [];
    for (const userId of createdUsers) {
      if ((await h.admin.auth.admin.deleteUser(userId)).error) failures.push(userId);
    }
    if (failures.length) throw new Error("Could not delete one or more local Learner browse identities");
  }

  try {
    await h.db.connect();
    for (const [index, name] of actorKeys.entries()) {
      const role = name.slice(0, -1);
      const displayName = `${role === "ta" ? "TA" : role[0].toUpperCase() + role.slice(1)} ${name.at(-1)}`;
      const actorId = id([1, 2, 11, 12, 21, 22][index]);
      const email = `t10-${scope}-${name.toLowerCase()}@example.test`;
      const creation = await h.admin.auth.admin.createUser({
        id: actorId, email, password, email_confirm: true, user_metadata: { role, display_name: displayName },
      });
      if (creation.error || !creation.data.user) throw new Error(`Could not provision local ${name}`);
      createdUsers.push(creation.data.user.id);
      if (creation.data.user.id !== actorId) throw new Error(`Unexpected local ID for ${name}`);
      const client = h.client();
      const login = await client.auth.signInWithPassword({ email, password });
      if (login.error || !login.data.session) throw new Error(`Could not sign in local ${name}`);
      actors[name] = { id: actorId, email, password, client };
    }

    await publish(ids.c1, ids.revision1, actors.authorA, checkout);
    await publish(ids.c2, ids.quotientRevision, actors.authorB, quotient);
    await addChallenge(ids.draft, actors.authorA);
    await publish(ids.unpublished, ids.unpublishedRevision, actors.authorA, checkout, newerAt);
    await publish(ids.archived, ids.archivedRevision, actors.authorB, quotient, newerAt);
    await h.db.query("update public.challenges set status = 'unpublished' where id = $1", [ids.unpublished]);
    await h.db.query("update public.challenges set status = 'archived' where id = $1", [ids.archived]);

    await publish(ids.differentLanguage, ids.differentLanguageRevision, actors.authorB, {
      ...quotient, title: "Python filter control", difficulty: "easy",
      changes: quotient.changes.map(change => ({ ...change, category: "logic_bug" })),
    }, newerAt);
    await publish(ids.differentDifficulty, ids.differentDifficultyRevision, actors.authorA, {
      ...checkout, title: "Difficulty filter control", difficulty: "hard",
    }, newerAt);
    await publish(ids.differentCategory, ids.differentCategoryRevision, actors.authorA, {
      ...checkout, title: "Category filter control", changes: [checkout.changes[1]],
    }, newerAt);

    for (const [index, challengeId] of practice.entries()) {
      await publish(challengeId, id(1100 + index), actors.authorA, index === 0 ? longPublication : {
        ...checkout,
        title: `Practice checkout ${String(index + 1).padStart(2, "0")}`,
        changes: [checkout.changes[0]],
      });
    }
    if (scope === "submission") await publish(ids.reviewChallenge, ids.reviewRevision, actors.authorA, checkout);
    if (scope !== "submission") {
      const c1 = { challengeId: ids.c1, revisionId: ids.revision1 };
      await addAttempt({ ...c1, submissionId: ids.firstA, learner: actors.learnerA, state: "completed", score: 25 });
      await addAttempt({ ...c1, submissionId: ids.secondA, learner: actors.learnerA,
        previousId: ids.firstA, state: "completed", score: 100 });
      await addAttempt({ ...c1, submissionId: ids.firstB, learner: actors.learnerB, state: "pending" });
      await addAttempt({ submissionId: ids.failedB, learner: actors.learnerB, challengeId: ids.c2,
        revisionId: ids.quotientRevision, state: "failed" });
    }
  } catch (error) {
    await dispose();
    throw error;
  }

  async function publishNextRevision() {
    await addRevision(ids.c1, ids.revision2, 2, nextCheckout, newerAt);
    await setPublication(ids.c1, ids.revision2);
  }

  return {
    h, actors, ids, dispose, publishNextRevision,
    checkout: { ...checkout, flawedCode: revisionSource(checkout) },
    nextCheckout: { ...nextCheckout, flawedCode: revisionSource(nextCheckout) },
    quotient: { ...quotient, flawedCode: revisionSource(quotient) },
    longPublication: { ...longPublication, revisionId: id(1100), flawedCode: revisionSource(longPublication) },
    createdAt, newerAt,
  };
}
