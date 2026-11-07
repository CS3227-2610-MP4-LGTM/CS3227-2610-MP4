// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { localHarness } from "../auth/local";
import {
  accessMatrix, accountKeys, accounts, flawedCode, insert, keys, pinnedAFlawedCode, probeId, quote,
  relation, rowIdColumn, seed, tables, workingCode,
  type AccountKey, type Relations, type Table,
} from "./fixture";

const dbRoles = ["anon", "authenticated", "service_role"] as const;
const callers = [...accountKeys, "anon", "service_role"] as const;
type Caller = typeof callers[number];
type Role = typeof dbRoles[number];
type Row = Record<string, unknown>;
type CatalogTable = { schema: string; name: string; oid: number; rls: boolean };

let harness: ReturnType<typeof localHarness> | undefined;
let db: ReturnType<typeof localHarness>["db"];
let inTransaction = false;
let savepoint = 0;
const createdUsers = new Set<string>();
const relations: Relations = new Map();
let catalog: CatalogTable[];
let fixtureReady = false;

function table(name: Table) {
  return relation(relations, name);
}

async function isolated<T>(work: () => Promise<T>) {
  const name = `domain_probe_${++savepoint}`;
  await db.query(`savepoint ${name}`);
  try {
    return await work();
  } finally {
    await db.query(`rollback to savepoint ${name}`);
    await db.query(`release savepoint ${name}`);
  }
}

function roleOf(caller: Caller): Role {
  return caller === "anon" || caller === "service_role" ? caller : "authenticated";
}

function asCaller<T>(caller: Caller, work: () => Promise<T>) {
  return isolated(async () => {
    const role = roleOf(caller);
    const account = role === "authenticated" ? accounts[caller as AccountKey] : undefined;
    // Match the local API's restricted role and identity settings. Editable
    // metadata deliberately disagrees with the role provisioned in Postgres.
    await db.query(`set local role ${role}`);
    await db.query(
      `select set_config('request.jwt.claim.sub', $1, true),
        set_config('request.jwt.claims', $2, true)`,
      [account?.id ?? "", JSON.stringify({
        role, sub: account?.id,
        user_metadata: { role: account?.role === "ta" ? "learner" : "ta" },
      })],
    );
    return work();
  });
}

async function visibleIds(name: Table, ids = accessMatrix[name].map(([id]) => id)) {
  const key = quote(rowIdColumn[name]);
  const result = await db.query<{ id: string }>(
    `select ${key} as id from ${table(name)} where ${key} = any($1::uuid[]) order by ${key}`,
    [ids],
  );
  return result.rows.map(({ id }) => id);
}

async function fixtureRow(name: Table, id: string) {
  const result = await db.query<{ data: Row }>(
    `select to_jsonb(r) as data from ${table(name)} as r
      where ${quote(rowIdColumn[name])} = $1`, [id],
  );
  expect(result.rowCount, `${name}: fixture record ${id}`).toBe(1);
  return result.rows[0].data;
}

// Copy only test-owned data. Ignore schema-supplied generated columns so probes
// can run against implementations that use generated ownership discriminants.
async function copyRow(name: Table, id: string, patch: Row) {
  const source = await fixtureRow(name, id);
  const generated = await db.query<{ attname: string }>(
    "select attname from pg_attribute where attrelid = $1::regclass and attgenerated <> ''",
    [table(name)],
  );
  for (const { attname } of generated.rows) delete source[attname];
  return { ...source, ...patch };
}

async function rejectsConstraint(query: () => Promise<unknown>) {
  await expect(isolated(query)).rejects.toMatchObject({ code: expect.stringMatching(/^(23[0-9A-Z]{3}|P0001)$/) });
}

beforeAll(async () => {
  harness = localHarness();
  db = harness.db;
  await db.connect();
  await db.query("begin");
  inTransaction = true;
  const result = await db.query<CatalogTable>(`
    select n.nspname as schema, c.relname as name, c.oid, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')
      and (n.nspname, c.relname) not in (('public','profiles'), ('private','profile_roles'))
      and c.relname <> 'ai_usage_records'
    order by n.nspname, c.relname
  `);
  catalog = result.rows;
  for (const row of catalog) {
    const name = row.name as Table;
    if (!tables.includes(name)) continue;
    if (relations.has(name)) throw new Error(`Ambiguous domain table ${name}`);
    relations.set(name, row.schema);
  }
  // Missing relations are the expected red state before the migration. Once
  // all relations exist, seed or Auth errors fail the suite normally.
  if (relations.size !== tables.length) return;

  for (const key of accountKeys) {
    const account = accounts[key];
    const { data, error } = await harness.admin.auth.admin.createUser({
      id: account.id, email: account.email, password: "t03 local domain fixture",
      email_confirm: true, user_metadata: { display_name: key, role: account.role },
    });
    if (error || !data.user) throw new Error(`Unable to provision local domain account ${key}`);
    createdUsers.add(data.user.id);
    expect(data.user.id).toBe(account.id);
  }
  await seed(db, relations);
  fixtureReady = true;
});

afterAll(async () => {
  if (!harness) return;
  try {
    if (inTransaction) await db.query("rollback");
  } finally {
    await db.end();
  }
  // Deleting a fixture owner is safe only after the entire domain seed rolls back.
  const failedDeletes = [];
  for (const id of createdUsers) {
    const { error } = await harness.admin.auth.admin.deleteUser(id);
    if (error) failedDeletes.push(id);
  }
  expect(failedDeletes, "Local domain accounts that could not be removed").toEqual([]);
});

it("INTEGRATION-SPEC §2 declares every T-03 record as a database table", () => {
  expect(tables.filter((name) => !relations.has(name)), "Missing T-03 relations").toEqual([]);
});

it("SYS-10.1 requires RLS and denies implicit, anonymous and mutation access on domain tables in both schemas", async () => {
  const access = await db.query<{
    table_name: string; role_name: Role; rls: boolean; can_read: boolean;
    can_write: boolean; write_policy: boolean;
  }>(`
    select n.nspname || '.' || c.relname as table_name, roles.role_name,
      c.relrowsecurity as rls,
      has_table_privilege(roles.role_name, c.oid, 'SELECT')
        or has_any_column_privilege(roles.role_name, c.oid, 'SELECT') as can_read,
      has_table_privilege(roles.role_name, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        or has_any_column_privilege(roles.role_name, c.oid, 'INSERT,UPDATE,REFERENCES') as can_write,
      exists (
        select from pg_policy p where p.polrelid = c.oid and p.polcmd <> 'r'
          and exists (
            select from unnest(p.polroles) as policy_role(oid)
            where case when policy_role.oid = 0 then true
              else pg_has_role(roles.role_name::regrole::oid, policy_role.oid, 'MEMBER') end
          )
      ) as write_policy
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join unnest($1::name[]) as roles(role_name)
    where c.oid = any($2::oid[])
  `, [dbRoles, catalog.map((row) => row.oid)]);
  expect(catalog, "T-03 must create domain tables to check").not.toHaveLength(0);
  for (const row of access.rows) {
    const label = `${row.table_name} as ${row.role_name}`;
    expect.soft(row.rls, label).toBe(true);
    expect.soft(row.can_write || row.write_policy, label).toBe(false);
    if (row.role_name !== "authenticated") expect.soft(row.can_read, label).toBe(false);
  }
});

it.each(["public", "private"])("SYS-10.1 grants no default table, function or sequence access in %s", async (schema) => {
  const probe = `${quote(schema)}.t03_default_acl_probe`;
  await isolated(async () => {
    await db.query(`create table ${probe}_table (id integer)`);
    await db.query(`create function ${probe}_function() returns integer language sql as 'select 1'`);
    await db.query(`create sequence ${probe}_sequence`);
    const result = await db.query<{
      role_name: string; table_access: boolean; function_access: boolean; sequence_access: boolean;
    }>(`
      select role_name,
        has_table_privilege(role_name, $2::text, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') as table_access,
        has_function_privilege(role_name, $3::text, 'EXECUTE') as function_access,
        has_sequence_privilege(role_name, $4::text, 'USAGE,SELECT,UPDATE') as sequence_access
      from unnest($1::name[]) as roles(role_name)
    `, [dbRoles, `${probe}_table`, `${probe}_function()`, `${probe}_sequence`]);
    expect(result.rows).toEqual(dbRoles.map((role_name) => ({
      role_name, table_access: false, function_access: false, sequence_access: false,
    })));
  });
});

it("SYS-10.4 gives service_role no table or column privileges on any new domain relation", async () => {
  expect(catalog, "T-03 must create domain tables to check").not.toHaveLength(0);
  const result = await db.query<{ table_name: string }>(`
    select c.oid::regclass::text as table_name from pg_class c
    where c.oid = any($1::oid[])
      and (has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        or has_any_column_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
  `, [catalog.map((row) => row.oid)]);
  expect(result.rows).toEqual([]);
});

it.for(callers)("SYS-12.1 gives %s only its permitted direct database reads across the record matrix", async (caller, context) => {
  if (!fixtureReady) return context.skip();
  for (const name of tables) {
    const read = asCaller(caller, () => visibleIds(name));
    if (roleOf(caller) !== "authenticated") {
      await expect.soft(read, `${caller} reading ${name}`).rejects.toMatchObject({ code: "42501" });
    } else {
      const expected = accessMatrix[name]
        .filter(([, allowed]) => allowed.includes(caller as AccountKey))
        .map(([id]) => id).sort();
      await expect.soft(read, `${caller} reading ${name}`).resolves.toEqual(expected);
    }
  }
});

it("SYS-10.2 authorizes by the provisioned profile role despite forged editable role claims", async (context) => {
  if (!fixtureReady) return context.skip();
  const scope = () => db.query<{ id: string; role: string }>("select id, role from private.profile_roles");
  for (const key of accountKeys) {
    const account = accounts[key];
    const profile = await asCaller(key, scope);
    expect(profile.rows).toEqual([{ id: account.id, role: account.role }]);
  }
  await expect(asCaller("learnerA", () => visibleIds("performance_summaries"))).resolves.toEqual([]);
  await expect(asCaller("taA", () => visibleIds("performance_summaries"))).resolves.toEqual([keys.summaryA, keys.summaryB]);
});

it.for(callers)("SYS-12.1 rejects every direct insert, update and delete by %s", async (caller, context) => {
  if (!fixtureReady) return context.skip();
  for (const name of tables) {
    const key = quote(rowIdColumn[name]);
    const commands = [
      `insert into ${table(name)} (${key}) values ($1)`,
      `update ${table(name)} set ${key} = $1 where ${key} = $2`,
      `delete from ${table(name)} where ${key} = $1`,
    ];
    const target = accessMatrix[name][0][0];
    const bindings = [[probeId()], [probeId(), target], [target]];
    for (const [index, command] of commands.entries()) {
      await expect.soft(asCaller(caller, () => db.query(command, bindings[index])), command)
        .rejects.toMatchObject({ code: "42501" });
    }
  }
});

type CommentResult = {
  grade_id: string;
  comment_id: string;
  kind: "matched" | "unmatched" | "duplicate";
  explanation_credit: number | null;
  fix_credit: number | null;
  feedback: string | null;
};
type EligibleHint = { grade_id: string; hint_id: string; category: string; ordinal: number };

async function readOwnGrade() {
  const grade = await fixtureRow("ai_grades", keys.gradeA);
  const comments = await db.query<{ data: CommentResult }>(`
    select to_jsonb(result) as data from ${table("ai_grade_comment_results")} result
    join ${table("submission_comments")} comment on comment.id = result.comment_id
    where result.grade_id = $1 order by comment.ordinal
  `, [keys.gradeA]);
  const hints = await db.query<{ data: EligibleHint }>(`
    select to_jsonb(hint) as data from ${table("ai_grade_eligible_hints")} hint
    where hint.grade_id = $1 order by hint.ordinal
  `, [keys.gradeA]);
  return {
    grade,
    comments: comments.rows.map(({ data }) => data),
    hints: hints.rows.map(({ data }) => data),
  };
}

it("SYS-12.1 gives the owning Learner every safe grade value from direct scoped reads", async (context) => {
  if (!fixtureReady) return context.skip();
  const snapshot = await asCaller("learnerA", readOwnGrade);
  const { grade, comments, hints } = snapshot;
  expect(Object.keys(grade).sort()).toEqual([
    "id", "submission_id", "score", "passed", "identification_points", "explanation_points", "fix_points",
  ].sort());
  expect(grade).toMatchObject({ id: keys.gradeA, submission_id: keys.firstA });
  const matched = comments.filter(({ kind }) => kind === "matched");
  expect({
    score: grade.score,
    passed: grade.passed,
    identificationPoints: Number(Number(grade.identification_points).toFixed(2)),
    explanationPoints: grade.explanation_points,
    fixPoints: grade.fix_points,
    matchedCount: matched.length,
    missedCount: hints.length,
    unmatchedCommentIds: comments.filter(({ kind }) => kind === "unmatched").map(({ comment_id }) => comment_id),
    duplicateCommentIds: comments.filter(({ kind }) => kind === "duplicate").map(({ comment_id }) => comment_id),
    comments: comments.map(({ comment_id, kind, explanation_credit, fix_credit, feedback }) => ({
      commentId: comment_id, matched: kind === "matched",
      explanationCredit: explanation_credit, fixCredit: fix_credit, feedback,
    })),
    eligibleHints: hints.map(({ hint_id, category }) => ({ hintId: hint_id, category })),
  }).toEqual({
    score: 42, passed: false, identificationPoints: 16.67, explanationPoints: 15, fixPoints: 10,
    matchedCount: 2, missedCount: 1,
    unmatchedCommentIds: [keys.reportedComment], duplicateCommentIds: [keys.duplicateComment],
    comments: [
      {
        commentId: keys.qA, matched: true, explanationCredit: 1, fixCredit: 1,
        feedback: "You explained the impact and fix.",
      },
      { commentId: keys.reportedComment, matched: false, explanationCredit: null, fixCredit: null, feedback: null },
      { commentId: keys.duplicateComment, matched: false, explanationCredit: null, fixCredit: null, feedback: null },
      {
        commentId: keys.secondMatch, matched: true, explanationCredit: 0.5, fixCredit: 0.5,
        feedback: "Explain why the divisor changes the result.",
      },
    ],
    eligibleHints: [{ hintId: keys.pinnedAMissedHint, category: "logic_bug" }],
  });
  for (const comment of comments) {
    expect(Object.keys(comment).sort()).toEqual(
      ["grade_id", "comment_id", "kind", "explanation_credit", "fix_credit", "feedback"].sort(),
    );
    expect(comment.grade_id).toBe(keys.gradeA);
  }
  expect(hints).toEqual([{
    grade_id: keys.gradeA, hint_id: keys.pinnedAMissedHint, category: "logic_bug", ordinal: 0,
  }]);
  await expect(asCaller("taA", readOwnGrade)).resolves.toEqual(snapshot);
});

it("SEC-01.1 separates TA-only grading evidence and answer keys from Learner-readable data", async (context) => {
  if (!fixtureReady) return context.skip();
  const provenance = await asCaller("taA", () => fixtureRow("ai_grade_evidence", keys.gradeA));
  expect(provenance).toMatchObject({ grade_id: keys.gradeA, grading_run_id: keys.runA, provider_output_retried: false });
  expect(Object.keys(provenance).sort()).toEqual(["grade_id", "grading_run_id", "provider_output_retried", "created_at"].sort());
  await expect(asCaller("taA", () => fixtureRow("ai_grade_assessments", keys.pinnedAFlaw))).resolves.toEqual({
    grade_id: keys.gradeA, flaw_id: keys.pinnedAFlaw, comment_id: keys.qA, distance: 0,
  });
  await expect(asCaller("taA", () => fixtureRow("ai_grade_assessments", keys.pinnedAMissedFlaw))).resolves.toEqual({
    grade_id: keys.gradeA, flaw_id: keys.pinnedAMissedFlaw, comment_id: null, distance: null,
  });
  const historical = await asCaller("learnerA", () => fixtureRow("challenge_revisions", keys.pinnedA));
  expect(historical).toMatchObject({ flawed_code: pinnedAFlawedCode });
  expect(historical).not.toHaveProperty("working_code");
  expect(historical).not.toHaveProperty("real_diff");

  const joined = await asCaller("learnerA", () => db.query<{
    assessment: Row | null; provenance: Row | null; answer: Row | null; cached_hint: Row | null;
  }>(`
    select to_jsonb(assessment) as assessment, to_jsonb(provenance) as provenance,
      to_jsonb(answer) as answer, to_jsonb(cache) as cached_hint
    from ${table("ai_grades")} grade
    join ${table("submissions")} submission on submission.id = grade.submission_id
    join ${table("ai_grade_eligible_hints")} hint on hint.grade_id = grade.id
    left join ${table("ai_grade_assessments")} assessment on assessment.grade_id = grade.id
    left join ${table("ai_grade_evidence")} provenance on provenance.grade_id = grade.id
    left join ${table("revision_answers")} answer on answer.revision_id = submission.revision_id
    left join ${table("flaw_hints")} cache on cache.id = hint.hint_id
    where grade.id = $1
  `, [keys.gradeA]));
  expect(joined.rows).toEqual([{ assessment: null, provenance: null, answer: null, cached_hint: null }]);
});

it("SEC-01.1 blocks forged server-generated proposals, hints, grades and summaries even for eligible actors", async (context) => {
  if (!fixtureReady) return context.skip();
  const rows: [Caller, Table, string, Row][] = [
    ["authorA", "proposal_sets", keys.proposalSet, { id: probeId(), source_draft_version: 99 }],
    ["authorA", "flaw_hints", keys.hint, { id: probeId() }],
    ["learnerA", "ai_grades", keys.gradeA, { id: probeId() }],
    ["taA", "ai_grade_evidence", keys.gradeA, { provider_output_retried: true }],
    ["taA", "performance_summaries", keys.summaryA, { id: probeId(), input_fingerprint: "forged" }],
  ];
  for (const [caller, name, source, patch] of rows) {
    const row = await copyRow(name, source, patch);
    await expect.soft(asCaller(caller, () => insert(db, table(name), row)), name)
      .rejects.toMatchObject({ code: "42501" });
  }
});

it("SYS-12.5 denies direct cached hints and forged flags or resolutions even to actors with related records", async (context) => {
  if (!fixtureReady) return context.skip();
  for (const learner of ["learnerA", "learnerB"] as const) {
    await expect(asCaller(learner, () => visibleIds("flaw_hints"))).resolves.toEqual([]);
    await expect(asCaller(learner, () => visibleIds("performance_summaries"))).resolves.toEqual([]);
  }
  const flag = await copyRow("review_flags", keys.rule, { id: probeId(), kind: "grading_output_retried" });
  const resolution = await copyRow("flag_resolutions", keys.resolution, {
    id: probeId(), actor_id: accounts.taB.id, audit_order: 99, created_at: "2000-01-01T00:00:00Z",
  });
  await expect(asCaller("learnerB", () => insert(db, table("review_flags"), flag)))
    .rejects.toMatchObject({ code: "42501" });
  await expect(asCaller("taA", () => insert(db, table("flag_resolutions"), resolution)))
    .rejects.toMatchObject({ code: "42501" });
});

it("SYS-12.4 denies forged ownership and new submissions against unpublished or archived challenges", async (context) => {
  if (!fixtureReady) return context.skip();
  const forged = await copyRow("submissions", keys.firstA, { id: probeId(), learner_id: accounts.learnerB.id });
  const ownArchived = await copyRow("submissions", keys.firstB, {
    id: probeId(), attempt_number: 2, previous_submission_id: keys.firstB,
  });
  await expect(asCaller("learnerA", () => insert(db, table("submissions"), forged)))
    .rejects.toMatchObject({ code: "42501" });
  await expect(asCaller("learnerB", () => insert(db, table("submissions"), ownArchived)))
    .rejects.toMatchObject({ code: "42501" });
  await isolated(async () => {
    await db.query(`update ${table("challenges")} set status = 'unpublished', row_version = row_version + 1 where id = $1`, [keys.a]);
    const ownUnpublished = await copyRow("submissions", keys.firstA, {
      id: probeId(), attempt_number: 2, previous_submission_id: keys.firstA,
    });
    await expect(asCaller("learnerA", () => insert(db, table("submissions"), ownUnpublished)))
      .rejects.toMatchObject({ code: "42501" });
  });
});

it("SYS-12.4 preserves pinned code, keys, grades and scoped history through edits, unpublishing and archiving", async (context) => {
  if (!fixtureReady) return context.skip();
  const code = await fixtureRow("challenge_revisions", keys.pinnedA);
  const answer = await fixtureRow("revision_answers", keys.pinnedA);
  const grade = await asCaller("learnerA", readOwnGrade);
  await isolated(async () => {
    await db.query(`update ${table("challenge_drafts")}
      set title = 'Edited draft', generation_id = null, draft_version = draft_version + 1 where challenge_id = $1`, [keys.a]);
    for (const state of ["unpublished", "archived"]) {
      await db.query(`update ${table("challenges")}
        set status = $2, row_version = row_version + 1 where id = $1`, [keys.a, state]);
      const pinned = [keys.unsubmitted, keys.pinnedA, keys.liveA];
      await expect(asCaller("learnerA", () => visibleIds("challenge_revisions", pinned))).resolves.toEqual([keys.pinnedA]);
      await expect(asCaller("learnerB", () => visibleIds("challenge_revisions", pinned))).resolves.toEqual([]);
      await expect(asCaller("learnerB", () => visibleIds("challenges", [keys.a]))).resolves.toEqual([]);
      await expect(asCaller("taA", () => visibleIds("revision_answers", pinned))).resolves.toEqual([keys.pinnedA]);
      for (const [name, expected] of [
        ["revision_flaws", [keys.pinnedAFlaw, keys.pinnedASecondFlaw, keys.pinnedAMissedFlaw]],
        ["flaw_hints", [keys.pinnedAHint, keys.pinnedASecondHint, keys.pinnedAMissedHint]],
      ] as const) {
        const result = await asCaller("taA", () => db.query<{ id: string }>(`
          select id from ${table(name)} where revision_id = any($1::uuid[]) order by id
        `, [pinned]));
        expect(result.rows.map(({ id }) => id), `${name} after ${state}`).toEqual(expected);
      }
      await expect(asCaller("learnerA", () => visibleIds("revision_answers", pinned))).resolves.toEqual([]);
      await expect(asCaller("learnerA", () => fixtureRow("submissions", keys.firstA)))
        .resolves.toMatchObject({ revision_id: keys.pinnedA });
      await expect(asCaller("learnerA", () => fixtureRow("challenge_revisions", keys.pinnedA))).resolves.toEqual(code);
      await expect(asCaller("taA", () => fixtureRow("revision_answers", keys.pinnedA))).resolves.toEqual(answer);
      await expect(asCaller("learnerA", readOwnGrade)).resolves.toEqual(grade);
    }
  });
});

type Probe = readonly [name: Table, source: string, changes: Row];

async function insertCopy([name, source, changes]: Probe) {
  const row = await copyRow(name, source, changes);
  return insert(db, table(name), row);
}

it("INTEGRATION-SPEC §2 stores every referenced identity behind a validated foreign key", async (context) => {
  if (!fixtureReady) return context.skip();
  const references: [Table, string, readonly string[]][] = [
    ["challenges", "author_id", ["profiles", "profile_roles"]],
    ["challenges", "published_revision_id", ["challenge_revisions"]],
    ["challenge_drafts", "challenge_id", ["challenges"]],
    ["challenge_drafts", "generation_id", ["proposal_sets"]],
    ["proposal_sets", "challenge_id", ["challenges"]],
    ["proposals", "proposal_set_id", ["proposal_sets"]],
    ["proposal_decisions", "proposal_id", ["proposals"]],
    ["challenge_revisions", "challenge_id", ["challenges"]],
    ["revision_answers", "revision_id", ["challenge_revisions"]],
    ["revision_flaws", "revision_id", ["challenge_revisions", "revision_answers"]],
    ["revision_flaws", "proposal_id", ["proposals"]],
    ["flaw_hints", "flaw_id", ["revision_flaws"]],
    ["flaw_hints", "revision_id", ["challenge_revisions", "revision_flaws"]],
    ["submissions", "learner_id", ["profiles", "profile_roles"]],
    ["submissions", "challenge_id", ["challenges", "challenge_revisions"]],
    ["submissions", "revision_id", ["challenge_revisions"]],
    ["submissions", "previous_submission_id", ["submissions"]],
    ["submission_comments", "submission_id", ["submissions"]],
    ["grading_runs", "submission_id", ["submissions"]],
    ["ai_grades", "submission_id", ["submissions"]],
    ["ai_grade_evidence", "grade_id", ["ai_grades"]],
    ["ai_grade_evidence", "grading_run_id", ["grading_runs"]],
    ["ai_grade_assessments", "grade_id", ["ai_grades", "ai_grade_evidence"]],
    ["ai_grade_assessments", "flaw_id", ["revision_flaws"]],
    ["ai_grade_assessments", "comment_id", ["submission_comments", "ai_grade_comment_results"]],
    ["ai_grade_comment_results", "grade_id", ["ai_grades"]],
    ["ai_grade_comment_results", "comment_id", ["submission_comments"]],
    ["ai_grade_eligible_hints", "grade_id", ["ai_grades"]],
    ["ai_grade_eligible_hints", "hint_id", ["flaw_hints"]],
    ["grade_overrides", "submission_id", ["submissions"]],
    ["grade_overrides", "actor_id", ["profiles", "profile_roles"]],
    ["review_flags", "submission_id", ["submissions"]],
    ["review_flags", "comment_id", ["submission_comments"]],
    ["flag_resolutions", "flag_id", ["review_flags"]],
    ["flag_resolutions", "actor_id", ["profiles", "profile_roles"]],
    ["performance_summaries", "learner_id", ["profiles", "profile_roles"]],
    ["performance_summaries", "requested_by", ["profiles", "profile_roles"]],
    ["performance_summary_evidence", "summary_id", ["performance_summaries"]],
    ["performance_summary_evidence", "submission_id", ["submissions"]],
  ];
  const result = await db.query<{ source: string; column_name: string; target: string; delete_action: string }>(`
    select c.relname as source, a.attname as column_name, target.relname as target, k.confdeltype as delete_action
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_class target on target.oid = k.confrelid
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral unnest(k.conkey) as columns(number)
    join pg_attribute a on a.attrelid = c.oid and a.attnum = columns.number
    where k.contype = 'f' and k.convalidated and n.nspname in ('public','private')
  `);
  for (const [source, column, targets] of references) {
    const matching = result.rows.filter((row) => row.source === source && row.column_name === column && targets.includes(row.target));
    const label = `${source}.${column} references ${targets.join(" or ")}`;
    expect.soft(matching, label).not.toHaveLength(0);
    if (targets.includes("profiles")) {
      for (const row of matching) expect.soft(row.delete_action, label).toMatch(/^[ar]$/);
    }
  }
});

it("INTEGRATION-SPEC §2 rejects wrong stored roles for owners, audit actors and summary participants", async (context) => {
  if (!fixtureReady) return context.skip();
  const wrongRoles: Probe[] = [
    ["challenges", keys.draft, { id: probeId(), author_id: accounts.learnerA.id }],
    ["submissions", keys.firstA, { id: probeId(), learner_id: accounts.authorA.id, revision_id: keys.liveA }],
    ["grade_overrides", keys.override, { id: probeId(), actor_id: accounts.authorA.id, audit_order: 3 }],
    ["flag_resolutions", keys.resolution, { id: probeId(), actor_id: accounts.learnerA.id, audit_order: 3 }],
    ["performance_summaries", keys.summaryA, {
      id: probeId(), learner_id: accounts.authorB.id, input_fingerprint: "wrong-learner",
    }],
    ["performance_summaries", keys.summaryA, {
      id: probeId(), requested_by: accounts.learnerA.id, input_fingerprint: "wrong-ta",
    }],
  ];
  for (const probe of wrongRoles) await rejectsConstraint(() => insertCopy(probe));
});

it("INTEGRATION-SPEC §2 rejects cross-parent publication, generation, submission and comment references", async (context) => {
  if (!fixtureReady) return context.skip();
  await rejectsConstraint(() => db.query(
    `update ${table("challenges")} set published_revision_id = $1, row_version = row_version + 1 where id = $2`, [keys.pinnedB, keys.a],
  ));
  const otherDraft = await fixtureRow("challenge_drafts", keys.b);
  expect(otherDraft.generation_id).toBeTruthy();
  await rejectsConstraint(() => db.query(
    `update ${table("challenge_drafts")} set generation_id = $1, draft_version = draft_version + 1 where challenge_id = $2`,
    [otherDraft.generation_id, keys.a],
  ));
  const probes: Probe[] = [
    ["submissions", keys.firstA, {
      id: probeId(), revision_id: keys.pinnedB, attempt_number: 2, previous_submission_id: keys.firstA,
    }],
    ["submissions", keys.firstA, {
      id: probeId(), attempt_number: 2, previous_submission_id: keys.firstB,
    }],
    ["review_flags", keys.report, { id: probeId(), comment_id: keys.qB }],
  ];
  for (const probe of probes) await rejectsConstraint(() => insertCopy(probe));
});

it("INTEGRATION-SPEC §2 enforces one draft/answer/hint, unique revision numbers and one original grade", async (context) => {
  if (!fixtureReady) return context.skip();
  const duplicates: Probe[] = [
    ["challenge_drafts", keys.a, {}],
    ["challenge_revisions", keys.liveA, { id: probeId() }],
    ["revision_answers", keys.liveA, {}],
    ["flaw_hints", keys.hint, { id: probeId() }],
    ["ai_grades", keys.gradeA, { id: probeId() }],
    ["proposal_decisions", keys.proposal, { decision: "rejected" }],
    ["submission_comments", keys.qA, { id: probeId(), body: "Duplicate input position." }],
  ];
  for (const probe of duplicates) {
    await expect(isolated(() => insertCopy(probe))).rejects.toMatchObject({ code: "23505" });
  }
});

it("INTEGRATION-SPEC §2 limits attempts across revisions and active runs per submission", async (context) => {
  if (!fixtureReady) return context.skip();
  const retry = { id: probeId(), attempt_number: 2, previous_submission_id: keys.firstA };
  await expect(isolated(() => insertCopy(["submissions", keys.firstA, { id: probeId(), revision_id: keys.liveA }])))
    .rejects.toMatchObject({ code: "23505" });
  await isolated(async () => {
    await insertCopy(["submissions", keys.firstA, retry]);
    expect(await visibleIds("submissions", [probeId()])).toEqual([probeId()]);
    await rejectsConstraint(() => insertCopy(["submissions", keys.firstA, {
      id: probeId(2), attempt_number: 3, previous_submission_id: probeId(),
    }]));
    await rejectsConstraint(() => insertCopy(["submissions", keys.firstA, {
      ...retry, id: probeId(2),
    }]));
    const run = {
      id: probeId(3), submission_id: probeId(), state: "pending", run_number: 1, finished_at: null,
    };
    await insertCopy(["grading_runs", keys.runA, run]);
    await rejectsConstraint(() => insertCopy(["grading_runs", keys.runA, {
      ...run, id: probeId(4), run_number: 2, state: "running",
    }]));
  });
});

it("INTEGRATION-SPEC §1 accepts exact Unicode text and UTF-8 code boundaries and rejects invalid persisted bounds", async (context) => {
  if (!fixtureReady) return context.skip();
  const nearLimit = "é".repeat(9_999) + "ab";
  const patchDraft = (title: string, code: string) => db.query(
    `update ${table("challenge_drafts")} set title = $1, working_code = $2,
      generation_id = null, draft_version = draft_version + 1 where challenge_id = $3`,
    [title, code, keys.draft],
  );
  await isolated(async () => {
    const title = "🧪".repeat(120);
    await patchDraft(title, nearLimit);
    await expect(fixtureRow("challenge_drafts", keys.draft))
      .resolves.toMatchObject({ title, working_code: nearLimit });
  });
  for (const [title, code] of [
    ["🧪".repeat(121), nearLimit], ["\t \u00a0", nearLimit],
    ["Valid title", nearLimit + "x"], ["Valid title", " \r\n\t"],
  ]) {
    await rejectsConstraint(() => patchDraft(title, code));
  }
  await isolated(async () => {
    // The persisted value must be LF-normalized. Rejection is also valid at
    // this boundary because the application will normalize before writing.
    const save = await isolated(async () => {
      try {
        await patchDraft("Valid title", "one\r\ntwo\rthree\n");
        return await fixtureRow("challenge_drafts", keys.draft);
      } catch (error) {
        expect(error).toMatchObject({ code: expect.stringMatching(/^(23[0-9A-Z]{3}|P0001)$/) });
        return undefined;
      }
    });
    if (save) expect(save.working_code).toBe("one\ntwo\nthree\n");
  });
  const invalid: Probe[] = [
    ["challenge_revisions", keys.liveA, { id: probeId(), revision_number: 9, flawed_code: nearLimit + "x" }],
    ["challenge_revisions", keys.liveA, { id: probeId(), revision_number: 9, description: "a".repeat(4001) }],
    ["submission_comments", keys.qA, { id: probeId(), ordinal: 49, body: "x".repeat(2001) }],
    ["submission_comments", keys.qA, { id: probeId(), ordinal: 50 }],
    ["submission_comments", keys.qA, { id: probeId(), ordinal: 49, line: 0 }],
    ["submission_comments", keys.qA, { id: probeId(), ordinal: 49, line: 13 }],
    ["grade_overrides", keys.override, { id: probeId(), audit_order: 9, score: 101 }],
    ["performance_summaries", keys.summaryA, {
      id: probeId(), input_fingerprint: "long-summary",
      output: { strengths: [{ category: "logic_bug", text: "x".repeat(2001) }], blindSpots: [], nextSteps: [] },
    }],
  ];
  for (const probe of invalid) await rejectsConstraint(() => insertCopy(probe));
  for (const [count, categories] of [
    [0, ["logic_bug"]], [6, ["logic_bug"]], [1, []], [2, ["logic_bug", "logic_bug"]],
  ]) {
    await rejectsConstraint(() => db.query(
      `update ${table("challenge_drafts")}
        set flaw_count = $1, categories = $2, draft_version = draft_version + 1 where challenge_id = $3`,
      [count, categories, keys.draft],
    ));
  }
});

it("INTEGRATION-SPEC §2 keeps proposal source ranges disjoint, exact and within the snapshot", async (context) => {
  if (!fixtureReady) return context.skip();
  await isolated(async () => {
    await insertCopy(["proposal_sets", keys.proposalSet, { id: probeId(), source_draft_version: 9 }]);
    const valid = { id: probeId(2), proposal_set_id: probeId() };
    await isolated(() => insertCopy(["proposals", keys.proposal, valid]));
    for (const change of [
      { source_start_line: 0 },
      { source_end_line: 5 },
      { source_start_line: 4, source_end_line: 3 },
      { original_snippet: "Incorrect original" },
      { replacement_snippet: " \t" },
      { replacement_snippet: "return amount / 2;\n" },
    ]) {
      await rejectsConstraint(() => insertCopy(["proposals", keys.proposal, { ...valid, ...change }]));
    }
    await insertCopy(["proposals", keys.proposal, valid]);
    await rejectsConstraint(() => insertCopy(["proposals", keys.proposal, { ...valid, id: probeId(3) }]));
  });
});

it("INTEGRATION-SPEC §5 binds flag sources and enforces per-kind and per-reported-comment uniqueness", async (context) => {
  if (!fixtureReady) return context.skip();
  for (const source of [keys.rule, keys.report]) {
    await expect(isolated(() => insertCopy(["review_flags", source, { id: probeId() }])))
      .rejects.toMatchObject({ code: "23505" });
  }
  await isolated(async () => {
    const submission = probeId(1);
    const comment = probeId(2);
    await insertCopy(["submissions", keys.firstA, {
      id: submission, attempt_number: 2, previous_submission_id: keys.firstA,
    }]);
    await insertCopy(["submission_comments", keys.reportedComment, {
      id: comment, submission_id: submission, ordinal: 0,
    }]);
    for (const [source, patch] of [
      [keys.report, { comment_id: comment, reason: "\t " }],
      [keys.report, { comment_id: comment, reason: "x".repeat(2001) }],
      [keys.report, { comment_id: null }],
      [keys.report, { comment_id: comment, source: "rule" }],
      [keys.rule, { comment_id: comment }],
      [keys.rule, { reason: "Rule flags cannot have a reason." }],
      [keys.rule, { source: "learner" }],
    ] as const) {
      await expect(isolated(() => insertCopy(["review_flags", source, {
        id: probeId(3), submission_id: submission, ...patch,
      }]))).rejects.toMatchObject({ code: "23514" });
    }
  });
});

it("SYS-12.3 denies forged audit inserts, checks reasons and preserves stream-scoped audit history", async (context) => {
  if (!fixtureReady) return context.skip();
  const originalGrade = await fixtureRow("ai_grades", keys.gradeA);
  const originalOverride = await fixtureRow("grade_overrides", keys.override);
  const originalResolution = await fixtureRow("flag_resolutions", keys.resolution);
  const forged = await copyRow("grade_overrides", keys.override, {
    id: probeId(), actor_id: accounts.taB.id, audit_order: 3, created_at: "2000-01-01T00:00:00Z",
  });
  await expect(asCaller("taA", () => insert(db, table("grade_overrides"), forged)))
    .rejects.toMatchObject({ code: "42501" });

  for (const [name, source, usedByOtherRecord] of [
    ["grade_overrides", keys.override, 2],
    ["flag_resolutions", keys.resolution, 1],
  ] as const) {
    await rejectsConstraint(() => insertCopy([name, source, { id: probeId(), audit_order: usedByOtherRecord }]));
    await rejectsConstraint(() => insertCopy([name, source, { id: probeId(), audit_order: 9, reason: "\t\n " }]));
    await rejectsConstraint(() => insertCopy([name, source, { id: probeId(), audit_order: 9, reason: "x".repeat(2001) }]));
  }
  await isolated(async () => {
    await insertCopy(["grade_overrides", keys.override, { id: probeId(), submission_id: keys.firstB }]);
    await insertCopy(["grade_overrides", keys.override, { id: probeId(2), audit_order: 3, score: 91 }]);
    await insertCopy(["flag_resolutions", keys.resolution, { id: probeId(3), audit_order: 4, disposition: "dismissed" }]);
    expect(await fixtureRow("ai_grades", keys.gradeA)).toEqual(originalGrade);
    expect(await fixtureRow("grade_overrides", keys.override)).toEqual(originalOverride);
    expect(await fixtureRow("flag_resolutions", keys.resolution)).toEqual(originalResolution);
  });
});

it("INTEGRATION-SPEC §2 protects challenge ownership and blocks trusted SQL mutation or deletion of historical rows", async (context) => {
  if (!fixtureReady) return context.skip();
  await rejectsConstraint(() => db.query(
    `update ${table("challenges")} set author_id = $1 where id = $2`, [accounts.authorB.id, keys.a],
  ));
  const immutable: [Table, string, string, unknown][] = [
    ["proposal_sets", keys.proposalSet, "input_snapshot", {
      title: "New snapshot", description: "Still valid snapshot", language: "javascript", difficulty: "easy",
      workingCode, flawCount: 1, categories: ["logic_bug"],
    }],
    ["proposals", keys.proposal, "explanation", "Rewritten proposal."],
    ["challenge_revisions", keys.liveA, "title", "Rewritten title"],
    ["revision_answers", keys.liveA, "real_diff", {
      path: "challenge.js", before: workingCode, after: flawedCode,
      hunks: [{
        oldStart: 3, oldCount: 2, newStart: 3, newCount: 2,
        lines: [
          { kind: "context", text: "// Compute the total.", oldLine: 3, newLine: 3 },
          { kind: "removed", text: "const total = amount * 2;", oldLine: 4, newLine: null },
          { kind: "added", text: "const total = amount / 2;", oldLine: null, newLine: 4 },
        ],
      }],
    }],
    ["revision_flaws", keys.flaw, "explanation", "Rewritten explanation."],
    ["flaw_hints", keys.hint, "text", "Rewritten hint."],
    ["submissions", keys.firstA, "submitted_at", "2026-11-07T01:00:00Z"],
    ["submission_comments", keys.qA, "body", "Rewritten comment."],
    ["ai_grades", keys.gradeA, "score", 41],
    ["ai_grade_evidence", keys.gradeA, "provider_output_retried", true],
    ["ai_grade_assessments", keys.pinnedAFlaw, "distance", 1],
    ["ai_grade_comment_results", keys.qA, "feedback", "Rewritten feedback."],
    ["ai_grade_eligible_hints", keys.gradeA, "ordinal", 1],
    ["grade_overrides", keys.override, "score", 89],
    ["review_flags", keys.report, "reason", "Rewritten report."],
    ["flag_resolutions", keys.resolution, "reason", "Rewritten resolution."],
    ["performance_summaries", keys.summaryA, "input_fingerprint", "rewritten"],
  ];
  for (const [name, id, column, value] of immutable) {
    const before = await fixtureRow(name, id);
    const key = quote(rowIdColumn[name]);
    await rejectsConstraint(() => db.query(
      `update ${table(name)} set ${quote(column)} = $1 where ${key} = $2`, [value, id],
    ));
    await rejectsConstraint(() => db.query(`delete from ${table(name)} where ${key} = $1`, [id]));
    expect(await fixtureRow(name, id)).toEqual(before);
  }
});

it("INTEGRATION-SPEC §2 ties private grading and summary evidence to the correct submission, revision and Learner", async (context) => {
  if (!fixtureReady) return context.skip();
  const newSubmission = probeId(1);
  const newComment = probeId(2);
  const newRun = probeId(3);
  const newGrade = probeId(4);
  await isolated(async () => {
    await insertCopy(["submissions", keys.firstA, {
      id: newSubmission, attempt_number: 2, previous_submission_id: keys.firstA,
    }]);
    await insertCopy(["submission_comments", keys.qA, {
      id: newComment, submission_id: newSubmission,
    }]);
    await insertCopy(["grading_runs", keys.runA, {
      id: newRun, submission_id: newSubmission,
    }]);
    await insertCopy(["ai_grades", keys.gradeA, {
      id: newGrade, submission_id: newSubmission,
      score: 33, passed: false, identification_points: 50 / 3,
      explanation_points: 10, fix_points: 20 / 3,
    }]);
    await rejectsConstraint(() => insertCopy(["ai_grade_evidence", keys.gradeA, {
      grade_id: newGrade, grading_run_id: keys.runB,
    }]));
    await insertCopy(["ai_grade_evidence", keys.gradeA, {
      grade_id: newGrade, grading_run_id: newRun,
    }]);
    const commentResult = { grade_id: newGrade, comment_id: newComment };
    for (const change of [
      { comment_id: keys.qB },
      { explanation_credit: 0.25 },
      { feedback: "x".repeat(2001) },
    ]) {
      await rejectsConstraint(() => insertCopy(["ai_grade_comment_results", keys.qA, { ...commentResult, ...change }]));
    }
    await insertCopy(["ai_grade_comment_results", keys.qA, commentResult]);
    await rejectsConstraint(() => insertCopy(["ai_grade_comment_results", keys.reportedComment, {
      grade_id: newGrade, comment_id: keys.reportedComment,
    }]));
    for (const change of [{ comment_id: keys.qB }, { flaw_id: keys.pinnedBFlaw }]) {
      await rejectsConstraint(() => insertCopy(["ai_grade_assessments", keys.pinnedAFlaw, { ...commentResult, ...change }]));
    }
    await insertCopy(["ai_grade_assessments", keys.pinnedAFlaw, commentResult]);
    await insertCopy(["ai_grade_assessments", keys.pinnedAMissedFlaw, { grade_id: newGrade }]);
    await rejectsConstraint(() => insertCopy(["ai_grade_eligible_hints", keys.gradeA, {
      grade_id: newGrade, hint_id: keys.pinnedBHint,
    }]));
    await insertCopy(["ai_grade_eligible_hints", keys.gradeA, { grade_id: newGrade }]);
    await rejectsConstraint(() => insertCopy(["performance_summary_evidence", keys.summaryA, {
      submission_id: keys.firstB,
    }]));
    await rejectsConstraint(() => db.query(
      `update ${table("performance_summary_evidence")} set submission_id = $1 where summary_id = $2`,
      [newSubmission, keys.summaryA],
    ));
    await rejectsConstraint(() => db.query(
      `delete from ${table("performance_summary_evidence")} where summary_id = $1`,
      [keys.summaryA],
    ));
  });
});
