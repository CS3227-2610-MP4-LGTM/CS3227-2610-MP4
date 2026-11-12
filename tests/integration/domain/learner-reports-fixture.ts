import { createLearnerBrowseFixture } from "./learner-browse-fixture";
import { insert, quote } from "./fixture";

type Kind = "matched" | "duplicate" | "unmatched";
type State = "pending" | "running" | "failed" | "completed";
type Note = { line: number; body: string; kind: Kind };

/**
 * Local-only stored records for T-15 Learner reports. Seeds owned completed attempts with
 * matched, duplicate and unreported unmatched comments, ineligible grading states, historical
 * results and another Learner's attempt. No grading, provider or admin client is invoked.
 */
export async function createLearnerReportsFixture() {
  const base = await createLearnerBrowseFixture({ scope: "submission", pageSize: 0 });
  const { h, ids, actors } = base;
  const id = (n: number) => `53a00000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const time = "2026-01-01T00:00:02Z";
  let serial = 2000;
  const submitted: string[] = [];
  const notes = new Map<string, { revisionId: string; comments: (Note & { id: string })[] }>();
  const matchedText = "This returns the discount rather than the payable amount; multiply by one minus fraction.";
  const body = (label: string) => `Unmatched ${label}: whole currency units may discard cents.`;

  async function grade(submissionId: string) {
    const { revisionId, comments } = notes.get(submissionId)!;
    const run = id(serial++);
    await insert(h.db, "public.grading_runs", { id: run, submission_id: submissionId, run_number: 1, state: "completed", created_at: time, finished_at: time, failure_code: null });
    const matched = comments.some(comment => comment.kind === "matched");
    const gradeId = id(serial++);
    await insert(h.db, "public.ai_grades", {
      id: gradeId, submission_id: submissionId, score: matched ? 25 : 0, passed: false,
      identification_points: 0, explanation_points: matched ? 15 : 0, fix_points: matched ? 10 : 0,
    });
    await insert(h.db, "public.ai_grade_evidence", { grade_id: gradeId, grading_run_id: run, provider_output_retried: false, created_at: time });
    for (const comment of comments) {
      await insert(h.db, "public.ai_grade_comment_results", {
        grade_id: gradeId, comment_id: comment.id, kind: comment.kind,
        explanation_credit: comment.kind === "matched" ? 1 : null, fix_credit: comment.kind === "matched" ? 1 : null,
        feedback: comment.kind === "matched" ? "The consequence and proposed fix are clear." : null,
      });
    }
    const { rows: flaws } = await h.db.query<{ id: string; hint: string; category: string }>(`
      select f.id, h.id as hint, f.category from public.revision_flaws f
      join public.flaw_hints h on h.flaw_id = f.id where f.revision_id = $1 order by f.start_line, f.id`, [revisionId]);
    const matcher = comments.find(comment => comment.kind === "matched");
    let hintOrdinal = 0;
    for (const [index, flaw] of flaws.entries()) {
      const hit = index === 0 && matcher;
      await insert(h.db, "public.ai_grade_assessments", { grade_id: gradeId, flaw_id: flaw.id, comment_id: hit ? matcher.id : null, distance: hit ? 0 : null });
      if (!hit) await insert(h.db, "public.ai_grade_eligible_hints", { grade_id: gradeId, hint_id: flaw.hint, category: flaw.category, ordinal: hintOrdinal++ });
    }
  }

  async function attempt(submissionId: string, challengeId: string, revisionId: string, state: State,
    entries: Note[], owner = actors.learnerA, previous: string | null = null) {
    await insert(h.db, "public.submissions", {
      id: submissionId, learner_id: owner.id, challenge_id: challengeId, revision_id: revisionId,
      attempt_number: previous ? 2 : 1, previous_submission_id: previous, submitted_at: time,
    });
    submitted.push(submissionId);
    const comments = [];
    for (const [ordinal, entry] of entries.entries()) {
      const commentId = id(serial++);
      comments.push({ ...entry, id: commentId });
      await insert(h.db, "public.submission_comments", { id: commentId, submission_id: submissionId, ordinal, line: entry.line, body: entry.body });
    }
    notes.set(submissionId, { revisionId, comments });
    if (state === "completed") await grade(submissionId);
    else if (state !== "pending") {
      // A running run older than its 60-second deadline projects as failed; date it ahead.
      await insert(h.db, "public.grading_runs", {
        id: id(serial++), submission_id: submissionId, run_number: 1, state,
        created_at: state === "running" ? new Date(Date.now() + 3_600_000).toISOString() : time,
        finished_at: state === "failed" ? time : null, failure_code: state === "failed" ? "AI_UNAVAILABLE" : null,
      });
    }
    return Object.fromEntries(comments.map(comment => [comment.body, comment.id]));
  }

  /** Completes a seeded pending attempt directly, as grading would, without a provider. */
  async function complete(submissionId: string) {
    await grade(submissionId);
  }

  /** Seeds a TA resolution directly in the local harness (T-31 owns the TA journey). */
  async function resolve(flagId: string, disposition: "upheld" | "dismissed" = "dismissed", reason = "The answer key already covers this.") {
    const resolutionId = id(serial++);
    await h.db.query(`
      insert into public.flag_resolutions (id, flag_id, actor_id, created_at, audit_order, disposition, reason)
      select $1, f.id, $3, $4, coalesce((select max(o.audit_order) from private.submission_audit_orders o
        where o.submission_id = f.submission_id), 0) + 1, $5, $6
      from public.review_flags f where f.id = $2`, [resolutionId, flagId, actors.taA.id, time, disposition, reason]);
    return resolutionId;
  }

  async function dispose() {
    try {
      if (submitted.length) {
        await h.db.query("begin");
        try {
          await h.db.query("set local session_replication_role = replica");
          await h.db.query("delete from public.flag_resolutions where flag_id in (select id from public.review_flags where submission_id = any($1::uuid[]))", [submitted]);
          await h.db.query("delete from public.review_flags where submission_id = any($1::uuid[])", [submitted]);
          const { rows: [ledger] } = await h.db.query<{ present: boolean }>("select to_regclass('private.learner_report_requests') is not null as present");
          if (ledger.present) await h.db.query(`delete from private.${quote("learner_report_requests")} where submission_id = any($1::uuid[])`, [submitted]);
          await h.db.query("delete from private.submission_audit_orders where submission_id = any($1::uuid[])", [submitted]);
          await h.db.query("commit");
        } catch (error) { await h.db.query("rollback"); throw error; }
      }
    } finally { await base.dispose(); }
  }

  const first = id(501), second = id(502), unpublished = id(503), archived = id(504), foreign = id(505);
  const pending = id(506), running = id(507), failed = id(508), late = id(509);
  const text = {
    matched: matchedText,
    duplicate: "Another comment about the same discount calculation.",
    firstUnmatched: body("first"), raceUnmatched: body("race"), secondUnmatched: body("second"),
    secondRace: body("second race"), unpublishedUnmatched: body("unpublished"), archivedUnmatched: body("archived"),
    foreignUnmatched: body("foreign"), pendingNote: body("pending"), runningNote: body("running"),
    failedNote: body("failed"), lateUnmatched: body("late"),
  };
  let comments: Record<keyof typeof text, string>;
  try {
    const a = await attempt(first, ids.c1, ids.revision1, "completed", [
      { line: 3, body: text.matched, kind: "matched" }, { line: 3, body: text.duplicate, kind: "duplicate" },
      { line: 6, body: text.firstUnmatched, kind: "unmatched" }, { line: 8, body: text.raceUnmatched, kind: "unmatched" },
    ]);
    const b = await attempt(second, ids.c1, ids.revision1, "completed", [
      { line: 3, body: `${text.matched} Retry.`, kind: "matched" },
      { line: 6, body: text.secondUnmatched, kind: "unmatched" }, { line: 8, body: text.secondRace, kind: "unmatched" },
    ], actors.learnerA, first);
    const c = await attempt(unpublished, ids.unpublished, ids.unpublishedRevision, "completed", [{ line: 6, body: text.unpublishedUnmatched, kind: "unmatched" }]);
    const d = await attempt(archived, ids.archived, ids.archivedRevision, "completed", [{ line: 1, body: text.archivedUnmatched, kind: "unmatched" }]);
    const e = await attempt(foreign, ids.c1, ids.revision1, "completed", [
      { line: 3, body: `${text.matched} Learner B.`, kind: "matched" }, { line: 6, body: text.foreignUnmatched, kind: "unmatched" },
    ], actors.learnerB);
    const f = await attempt(pending, ids.c2, ids.quotientRevision, "pending", [{ line: 1, body: text.pendingNote, kind: "unmatched" }]);
    const g = await attempt(running, ids.differentLanguage, ids.differentLanguageRevision, "running", [{ line: 1, body: text.runningNote, kind: "unmatched" }]);
    const k = await attempt(failed, ids.differentDifficulty, ids.differentDifficultyRevision, "failed", [{ line: 1, body: text.failedNote, kind: "unmatched" }]);
    const l = await attempt(late, ids.reviewChallenge, ids.reviewRevision, "pending", [{ line: 6, body: text.lateUnmatched, kind: "unmatched" }]);
    const all = { ...a, ...b, ...c, ...d, ...e, ...f, ...g, ...k, ...l };
    comments = Object.fromEntries(Object.entries(text).map(([key, value]) => [key, all[value]])) as typeof comments;
    // The base fixture already leaves ids.unpublished unpublished and ids.archived archived.
  } catch (error) { await dispose(); throw error; }
  return {
    ...base, dispose, complete, resolve, id, time, text, comments, submitted,
    first, second, unpublished, archived, foreign, pending, running, failed, late,
  };
}
