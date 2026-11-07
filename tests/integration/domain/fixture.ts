import type { Client } from "pg";

export const accountKeys = ["authorA", "authorB", "learnerA", "learnerB", "taA", "taB"] as const;
export type AccountKey = typeof accountKeys[number];
type Row = Record<string, unknown>;

function id(number: number) {
  return `37f00000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
}

export const accounts = Object.fromEntries(accountKeys.map((key, index) => [
  key,
  {
    id: id(index + 1),
    email: `t03-domain-${key.toLowerCase()}@example.test`,
    role: key.slice(0, -1),
  },
])) as Record<AccountKey, { id: string; email: string; role: string }>;

export const keys = {
  a: id(101),
  b: id(102),
  draft: id(103),
  unsubmitted: id(201),
  pinnedA: id(202),
  liveA: id(203),
  pinnedB: id(204),
  firstA: id(301),
  firstB: id(302),
  qA: id(401),
  qB: id(402),
  reportedComment: id(403),
  duplicateComment: id(404),
  secondMatch: id(405),
  runA: id(501),
  runB: id(502),
  gradeA: id(601),
  gradeB: id(602),
  report: id(701),
  rule: id(702),
  override: id(801),
  resolution: id(802),
  summaryA: id(901),
  summaryB: id(902),
  proposalSet: id(1003),
  proposal: id(1103),
  flaw: id(1203),
  hint: id(1303),
  pinnedAFlaw: id(1202),
  pinnedASecondFlaw: id(1212),
  pinnedAMissedFlaw: id(1213),
  pinnedBFlaw: id(1204),
  pinnedAHint: id(1302),
  pinnedASecondHint: id(1312),
  pinnedAMissedHint: id(1313),
  pinnedBHint: id(1304),
} as const;

export const workingCode = "const amount = 100;\n\n// Compute the total.\nconst total = amount * 2;\n";
export const flawedCode = "const amount = 100;\n\n// Compute the total.\nconst total = amount / 2;\n";
export const timestamp = "2026-11-07T00:00:00Z";
const revisionDetails = {
  title: "Checkout totals",
  description: "Review the amount calculation.",
  language: "javascript",
  difficulty: "easy",
};
const draftDetails = {
  ...revisionDetails, working_code: workingCode, flaw_count: 1, categories: ["logic_bug"],
};
const proposalDetails = {
  category: "logic_bug",
  original_snippet: "const total = amount * 2;",
  replacement_snippet: "const total = amount / 2;",
  source_start_line: 4,
  source_end_line: 4,
  explanation: "The calculation halves the amount.",
  fix: "Double the amount.",
};

const pinnedAExtraProposals = [
  {
    proposal: id(1112), flaw: keys.pinnedASecondFlaw, hint: keys.pinnedASecondHint,
    details: {
      category: "edge_case",
      original_snippet: "const remainder = total % 3;",
      replacement_snippet: "const remainder = total % 1;",
      source_start_line: 8, source_end_line: 8,
      explanation: "Modulo one always returns zero.", fix: "Use a divisor of three.",
    },
  },
  {
    proposal: id(1113), flaw: keys.pinnedAMissedFlaw, hint: keys.pinnedAMissedHint,
    details: {
      category: "logic_bug",
      original_snippet: "const valid = remainder !== 0;",
      replacement_snippet: "const valid = remainder === 0;",
      source_start_line: 12, source_end_line: 12,
      explanation: "The comparison reverses validity.", fix: "Check for a nonzero remainder.",
    },
  },
];
const pinnedAWorkingCode = workingCode
  + "\n// Retain the remainder.\n\nconst remainder = total % 3;\n"
  + "\n// Report validity.\n\nconst valid = remainder !== 0;\n";
export const pinnedAFlawedCode = pinnedAExtraProposals.reduce(
  (code, { details }) => code.replace(details.original_snippet, details.replacement_snippet),
  pinnedAWorkingCode.replace(proposalDetails.original_snippet, proposalDetails.replacement_snippet),
);

const revisions = [
  { challenge: keys.a, revision: keys.unsubmitted, number: 1 },
  { challenge: keys.a, revision: keys.pinnedA, number: 2 },
  { challenge: keys.a, revision: keys.liveA, number: 3 },
  { challenge: keys.b, revision: keys.pinnedB, number: 1 },
].map((entry, index) => ({
  ...entry,
  set: id(1001 + index),
  workingCode: entry.revision === keys.pinnedA ? pinnedAWorkingCode : workingCode,
  flawedCode: entry.revision === keys.pinnedA ? pinnedAFlawedCode : flawedCode,
  proposals: [
    { proposal: id(1101 + index), flaw: id(1201 + index), hint: id(1301 + index), details: proposalDetails },
    ...(entry.revision === keys.pinnedA ? pinnedAExtraProposals : []),
  ],
}));

const attempts = [
  {
    challenge: keys.a, revision: revisions[1], learner: accounts.learnerA.id,
    submission: keys.firstA, run: keys.runA, grade: keys.gradeA,
    score: 42, identificationPoints: 50 / 3, explanationPoints: 15, fixPoints: 10,
    comments: [
      {
        id: keys.qA, line: 4, body: "The operator changes the intended arithmetic.",
        kind: "matched", explanationCredit: 1, fixCredit: 1, feedback: "You explained the impact and fix.",
      },
      {
        id: keys.reportedComment, line: 1, body: "Please document where the constant comes from.",
        kind: "unmatched", explanationCredit: null, fixCredit: null, feedback: null,
      },
      {
        id: keys.duplicateComment, line: 5, body: "This calculation halves the amount.",
        kind: "duplicate", explanationCredit: null, fixCredit: null, feedback: null,
      },
      {
        id: keys.secondMatch, line: 8, body: "The divisor looks incorrect.",
        kind: "matched", explanationCredit: 0.5, fixCredit: 0.5, feedback: "Explain why the divisor changes the result.",
      },
    ],
    matches: [keys.qA, keys.secondMatch, null],
  },
  {
    challenge: keys.b, revision: revisions[3], learner: accounts.learnerB.id,
    submission: keys.firstB, run: keys.runB, grade: keys.gradeB,
    score: 60, identificationPoints: 50, explanationPoints: 0, fixPoints: 10,
    comments: [{
      id: keys.qB, line: 4, body: "The operator changes the intended arithmetic.",
      kind: "matched", explanationCredit: 0, fixCredit: 0.5, feedback: "Explain the impact and refine the fix.",
    }],
    matches: [keys.qB],
  },
];

export const rowIdColumn = {
  challenges: "id",
  challenge_drafts: "challenge_id",
  proposal_sets: "id",
  proposals: "id",
  proposal_decisions: "proposal_id",
  challenge_revisions: "id",
  revision_answers: "revision_id",
  revision_flaws: "id",
  flaw_hints: "id",
  submissions: "id",
  submission_comments: "id",
  grading_runs: "id",
  ai_grades: "id",
  ai_grade_evidence: "grade_id",
  ai_grade_assessments: "flaw_id",
  ai_grade_comment_results: "comment_id",
  ai_grade_eligible_hints: "grade_id",
  grade_overrides: "id",
  review_flags: "id",
  flag_resolutions: "id",
  performance_summaries: "id",
  performance_summary_evidence: "summary_id",
} as const;

export type Table = keyof typeof rowIdColumn;
export const tables = Object.keys(rowIdColumn) as Table[];
export type Relations = Map<Table, string>;

export function quote(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}

export function relation(relations: Relations, table: Table) {
  const schema = relations.get(table);
  if (!schema) throw new Error(`Missing fixture relation ${table}`);
  return `${quote(schema)}.${quote(table)}`;
}

export function insert(db: Client, table: string, row: Row) {
  const columns = Object.keys(row).map(quote).join(", ");
  const values = Object.values(row);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  return db.query(`insert into ${table} (${columns}) values (${placeholders})`, values);
}

export async function seed(db: Client, relations: Relations) {
  const put = (table: Table, row: Row) => insert(db, relation(relations, table), row);

  for (const [challenge, author] of [
    [keys.a, accounts.authorA.id], [keys.b, accounts.authorB.id], [keys.draft, accounts.authorB.id],
  ]) {
    await put("challenges", {
      id: challenge, author_id: author, status: "draft", row_version: 1,
      published_revision_id: null, created_at: timestamp, updated_at: timestamp,
    });
    await put("challenge_drafts", {
      ...draftDetails, challenge_id: challenge, draft_version: 1, generation_id: null,
    });
  }

  for (const entry of revisions) {
    await put("proposal_sets", {
      id: entry.set, challenge_id: entry.challenge, source_draft_version: 1,
      input_snapshot: JSON.stringify({
        ...revisionDetails, workingCode: entry.workingCode, flawCount: entry.proposals.length,
        categories: [...new Set(entry.proposals.map(({ details }) => details.category))],
      }),
      created_at: timestamp,
    });
    for (const { proposal, details } of entry.proposals) {
      await put("proposals", { ...details, id: proposal, proposal_set_id: entry.set });
      await put("proposal_decisions", { proposal_id: proposal, decision: "approved" });
    }
    await put("challenge_revisions", {
      ...revisionDetails, id: entry.revision, challenge_id: entry.challenge,
      revision_number: entry.number, flawed_code: entry.flawedCode, published_at: timestamp,
    });
    await put("revision_answers", {
      revision_id: entry.revision, working_code: entry.workingCode,
      real_diff: JSON.stringify({
        path: "challenge.js", before: entry.workingCode, after: entry.flawedCode,
        hunks: entry.proposals.map(({ details }) => ({
          oldStart: details.source_start_line, oldCount: 1, newStart: details.source_start_line, newCount: 1,
          lines: [
            { kind: "removed", text: details.original_snippet, oldLine: details.source_start_line, newLine: null },
            { kind: "added", text: details.replacement_snippet, oldLine: null, newLine: details.source_start_line },
          ],
        })),
      }),
    });
    for (const { proposal, flaw, hint, details } of entry.proposals) {
      await put("revision_flaws", {
        ...details, id: flaw, proposal_id: proposal, revision_id: entry.revision,
        start_line: details.source_start_line, end_line: details.source_end_line,
      });
      await put("flaw_hints", {
        id: hint, flaw_id: flaw, revision_id: entry.revision,
        text: "Consider the result of this expression.", generation_metadata: JSON.stringify({}),
      });
    }
  }

  const activateDraft = (entry: typeof revisions[number], version: number) => db.query(
    `update ${relation(relations, "challenge_drafts")}
      set generation_id = $2, draft_version = $3, working_code = $4, flaw_count = $5, categories = $6
      where challenge_id = $1`,
    [entry.challenge, entry.set, version, entry.workingCode, entry.proposals.length,
      [...new Set(entry.proposals.map(({ details }) => details.category))]],
  );

  for (const entry of [revisions[1], revisions[3]]) {
    await db.query(`update ${relation(relations, "challenges")}
      set status = 'published', published_revision_id = $2, row_version = 2 where id = $1`,
    [entry.challenge, entry.revision]);
    await activateDraft(entry, 2);
  }

  for (const attempt of attempts) {
    await put("submissions", {
      id: attempt.submission, learner_id: attempt.learner, challenge_id: attempt.challenge,
      revision_id: attempt.revision.revision, attempt_number: 1,
      previous_submission_id: null, submitted_at: timestamp,
    });
    for (const [ordinal, comment] of attempt.comments.entries()) {
      await put("submission_comments", {
        id: comment.id, submission_id: attempt.submission, ordinal, line: comment.line, body: comment.body,
      });
    }
    await put("grading_runs", {
      id: attempt.run, submission_id: attempt.submission, run_number: 1, state: "completed",
      failure_code: null, created_at: timestamp, finished_at: timestamp,
    });
    await put("ai_grades", {
      id: attempt.grade, submission_id: attempt.submission, score: attempt.score, passed: attempt.score >= 60,
      identification_points: attempt.identificationPoints, explanation_points: attempt.explanationPoints,
      fix_points: attempt.fixPoints,
    });
    await put("ai_grade_evidence", {
      grade_id: attempt.grade, grading_run_id: attempt.run, provider_output_retried: false,
      created_at: timestamp,
    });
    for (const comment of attempt.comments) {
      await put("ai_grade_comment_results", {
        grade_id: attempt.grade, comment_id: comment.id, kind: comment.kind,
        explanation_credit: comment.explanationCredit, fix_credit: comment.fixCredit, feedback: comment.feedback,
      });
    }
    let hintOrdinal = 0;
    for (const [index, { flaw, hint, details }] of attempt.revision.proposals.entries()) {
      const commentId = attempt.matches[index];
      await put("ai_grade_assessments", {
        grade_id: attempt.grade, flaw_id: flaw, comment_id: commentId, distance: commentId === null ? null : 0,
      });
      if (commentId === null) {
        await put("ai_grade_eligible_hints", {
          grade_id: attempt.grade, hint_id: hint, category: details.category, ordinal: hintOrdinal++,
        });
      }
    }
  }

  await put("review_flags", {
    id: keys.report, submission_id: keys.firstA, source: "learner", kind: "learner_report",
    comment_id: keys.reportedComment, reason: "The origin of this constant is unclear.", created_at: timestamp,
  });
  await put("review_flags", {
    id: keys.rule, submission_id: keys.firstB, source: "rule", kind: "near_pass_mark",
    comment_id: null, reason: null, created_at: timestamp,
  });
  await put("grade_overrides", {
    id: keys.override, submission_id: keys.firstA, actor_id: accounts.taA.id,
    audit_order: 1, score: 90, reason: "Adjusted after reviewing the concern.", created_at: timestamp,
  });
  await put("flag_resolutions", {
    id: keys.resolution, flag_id: keys.report, actor_id: accounts.taB.id,
    audit_order: 2, disposition: "upheld", reason: "The question was valid.", created_at: timestamp,
  });

  for (const [summary, learner, ta, submission] of [
    [keys.summaryA, accounts.learnerA.id, accounts.taA.id, keys.firstA],
    [keys.summaryB, accounts.learnerB.id, accounts.taB.id, keys.firstB],
  ]) {
    await put("performance_summaries", {
      id: summary, learner_id: learner, requested_by: ta, input_fingerprint: `fixture-${submission}`,
      output: JSON.stringify({
        strengths: [{ category: "logic_bug", text: "Checks calculation operators." }],
        blindSpots: [], nextSteps: [],
      }),
      created_at: timestamp,
    });
    await put("performance_summary_evidence", {
      summary_id: summary, item_kind: "strengths", item_ordinal: 0, submission_id: submission,
    });
  }

  await db.query(`update ${relation(relations, "challenges")}
    set published_revision_id = $2, row_version = 3 where id = $1`, [keys.a, keys.liveA]);
  await activateDraft(revisions[2], 3);

  // Learner B's attempt pins an archived challenge. Its revision remains private
  // to that Learner, the owning Author and moderating TAs.
  await db.query(`update ${relation(relations, "challenges")}
    set status = 'archived', row_version = 3 where id = $1`, [keys.b]);
}

const tas = ["taA", "taB"] as const;
const learners = ["learnerA", "learnerB"] as const;
const pinnedA = ["learnerA", ...tas] as const;
const pinnedB = ["learnerB", ...tas] as const;
const live = [...learners, ...tas] as const;

export type AccessMatrix = Record<Table, readonly (readonly [string, readonly AccountKey[]])[]>;
export const accessMatrix: AccessMatrix = {
  challenges: [
    [keys.a, ["authorA", ...live]], [keys.b, ["authorB", ...pinnedB]], [keys.draft, ["authorB"]],
  ],
  challenge_drafts: [[keys.a, ["authorA"]], [keys.b, ["authorB"]], [keys.draft, ["authorB"]]],
  proposal_sets: revisions.map(({ set, challenge }) => [set, [challenge === keys.a ? "authorA" : "authorB"]]),
  proposals: revisions.flatMap(({ proposals, challenge }) =>
    proposals.map(({ proposal }) => [proposal, [challenge === keys.a ? "authorA" : "authorB"]] as const)),
  proposal_decisions: revisions.flatMap(({ proposals, challenge }) =>
    proposals.map(({ proposal }) => [proposal, [challenge === keys.a ? "authorA" : "authorB"]] as const)),
  challenge_revisions: [
    [keys.unsubmitted, ["authorA"]], [keys.pinnedA, ["authorA", ...pinnedA]],
    [keys.liveA, ["authorA", ...live]], [keys.pinnedB, ["authorB", ...pinnedB]],
  ],
  revision_answers: [
    [keys.unsubmitted, ["authorA"]], [keys.pinnedA, ["authorA", ...tas]],
    [keys.liveA, ["authorA", ...tas]], [keys.pinnedB, ["authorB", ...tas]],
  ],
  revision_flaws: [
    [revisions[0].proposals[0].flaw, ["authorA"]],
    ...revisions[1].proposals.map(({ flaw }) => [flaw, ["authorA", ...tas]] as const),
    [keys.flaw, ["authorA", ...tas]], [keys.pinnedBFlaw, ["authorB", ...tas]],
  ],
  flaw_hints: [
    [revisions[0].proposals[0].hint, ["authorA"]],
    ...revisions[1].proposals.map(({ hint }) => [hint, ["authorA", ...tas]] as const),
    [keys.hint, ["authorA", ...tas]], [keys.pinnedBHint, ["authorB", ...tas]],
  ],
  submissions: [[keys.firstA, pinnedA], [keys.firstB, pinnedB]],
  submission_comments: [
    [keys.qA, pinnedA], [keys.qB, pinnedB], [keys.reportedComment, pinnedA],
    [keys.duplicateComment, pinnedA], [keys.secondMatch, pinnedA],
  ],
  grading_runs: [[keys.runA, pinnedA], [keys.runB, pinnedB]],
  ai_grades: [[keys.gradeA, pinnedA], [keys.gradeB, pinnedB]],
  ai_grade_evidence: [[keys.gradeA, tas], [keys.gradeB, tas]],
  ai_grade_assessments: [
    ...revisions[1].proposals.map(({ flaw }) => [flaw, tas] as const),
    [keys.pinnedBFlaw, tas],
  ],
  ai_grade_comment_results: [
    [keys.qA, pinnedA], [keys.qB, pinnedB], [keys.reportedComment, pinnedA],
    [keys.duplicateComment, pinnedA], [keys.secondMatch, pinnedA],
  ],
  ai_grade_eligible_hints: [[keys.gradeA, pinnedA]],
  grade_overrides: [[keys.override, pinnedA]],
  review_flags: [[keys.report, pinnedA], [keys.rule, pinnedB]],
  flag_resolutions: [[keys.resolution, pinnedA]],
  performance_summaries: [[keys.summaryA, tas], [keys.summaryB, tas]],
  performance_summary_evidence: [[keys.summaryA, tas], [keys.summaryB, tas]],
};

export function probeId(number = 1) {
  return id(9000 + number);
}
