import { createLearnerBrowseFixture } from "./learner-browse-fixture";
import { insert, quote } from "./fixture";

/** Local-only stored records: no grading, reports API or provider is invoked. */
export async function createLearnerHistoryFixture({ pageSize = 51 }: { pageSize?: number } = {}) {
  const base = await createLearnerBrowseFixture({ scope: "submission", pageSize });
  const { h, ids, actors } = base;
  const id = (n: number) => `52a00000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const time = "2026-01-01T00:00:02Z";
  const first = id(501), second = id(502), foreign = id(503);
  let serial = 2000;
  const submitted: string[] = [];
  const flagIds: string[] = [];
  const reportBody = "Whole currency units may discard cents; document the rounding policy.";
  const reason = '<img src="https://attacker.example.test/moderation" onerror="alert(1)"> ' + "The recorded reason must remain complete. ".repeat(30).trim();

  async function attempt(submissionId: string, challengeId: string, revisionId: string,
    state: "pending" | "running" | "failed" | "completed", owner = actors.learnerA,
    previous: string | null = null, score = 0, submittedAt = time) {
    await insert(h.db, "public.submissions", {
      id: submissionId, learner_id: owner.id, challenge_id: challengeId, revision_id: revisionId,
      attempt_number: previous ? 2 : 1, previous_submission_id: previous, submitted_at: submittedAt,
    });
    submitted.push(submissionId);
    const notes = score === 25 ? [
      { line: 3, body: "This returns the discount rather than the payable amount; multiply by one minus fraction." },
      { line: 6, body: reportBody },
    ] : score === 100 ? [
      { line: 3, body: "This returns the discount rather than the payable amount; multiply by one minus fraction." },
      { line: 10, body: "An empty basket makes reduce throw; pass zero as the initial accumulator." },
    ] : [];
    const comments: string[] = [];
    for (const [ordinal, note] of notes.entries()) {
      const commentId = id(serial++);
      comments.push(commentId);
      await insert(h.db, "public.submission_comments", { id: commentId, submission_id: submissionId, ordinal, ...note });
    }
    // The canonical reader projects a submission with no grading run as pending, and a running
    // run older than its 60-second deadline as failed. Seed accordingly; the running run is dated
    // ahead so it stays unexpired however long a suite or browser journey takes.
    if (state === "pending") return comments;
    const run = id(serial++);
    await insert(h.db, "public.grading_runs", {
      id: run, submission_id: submissionId, run_number: 1, state,
      created_at: state === "running" ? new Date(Date.now() + 3_600_000).toISOString() : time,
      finished_at: state === "completed" || state === "failed" ? time : null,
      failure_code: state === "failed" ? "AI_UNAVAILABLE" : null,
    });
    if (state !== "completed") return comments;
    const grade = id(serial++);
    await insert(h.db, "public.ai_grades", {
      id: grade, submission_id: submissionId, score, passed: score >= 60,
      identification_points: score === 100 ? 50 : 0,
      explanation_points: score === 100 ? 30 : score === 25 ? 15 : 0,
      fix_points: score === 100 ? 20 : score === 25 ? 10 : 0,
    });
    await insert(h.db, "public.ai_grade_evidence", { grade_id: grade, grading_run_id: run, provider_output_retried: false, created_at: time });
    for (const [index, comment] of comments.entries()) {
      const matched = score === 100 || index === 0;
      await insert(h.db, "public.ai_grade_comment_results", {
        grade_id: grade, comment_id: comment, kind: matched ? "matched" : "unmatched",
        explanation_credit: matched ? 1 : null, fix_credit: matched ? 1 : null,
        feedback: matched ? "The consequence and proposed fix are clear." : null,
      });
    }
    const { rows: flaws } = await h.db.query<{ id: string; hint: string; category: string }>(`
      select f.id, h.id as hint, f.category from public.revision_flaws f
      join public.flaw_hints h on h.flaw_id = f.id where f.revision_id = $1 order by f.start_line, f.id`, [revisionId]);
    let hintOrdinal = 0;
    for (const [index, flaw] of flaws.entries()) {
      const matched = score === 100 || (score === 25 && index === 0);
      await insert(h.db, "public.ai_grade_assessments", { grade_id: grade, flaw_id: flaw.id, comment_id: matched ? comments[index] : null, distance: matched ? 0 : null });
      if (!matched) await insert(h.db, "public.ai_grade_eligible_hints", { grade_id: grade, hint_id: flaw.hint, category: flaw.category, ordinal: hintOrdinal++ });
    }
    return comments;
  }
  async function dispose() {
    try {
      if (submitted.length) {
        await h.db.query("begin");
        try {
          await h.db.query("set local session_replication_role = replica");
          await h.db.query("delete from public.flag_resolutions where flag_id = any($1::uuid[])", [flagIds]);
          for (const table of ["grade_overrides", "review_flags"]) await h.db.query(`delete from public.${quote(table)} where submission_id = any($1::uuid[])`, [submitted]);
          await h.db.query("delete from private.submission_audit_orders where submission_id = any($1::uuid[])", [submitted]);
          await h.db.query("commit");
        } catch (error) { await h.db.query("rollback"); throw error; }
      }
    } finally { await base.dispose(); }
  }
  try {
    const comments = await attempt(first, ids.c1, ids.revision1, "completed", actors.learnerA, null, 25);
    await attempt(second, ids.c1, ids.revision1, "completed", actors.learnerA, first, 100);
    await attempt(foreign, ids.c1, ids.revision1, "completed", actors.learnerB);
    const states = ["pending", "running", "failed", "completed"] as const;
    for (const [index, challenge] of ids.practice.entries()) {
      await attempt(id(600 + index), challenge, `50a00000-0000-4000-8000-${String(1100 + index).padStart(12, "0")}`, states[index % states.length], actors.learnerA, null, 0, index >= 30 ? "2026-01-01T00:00:01Z" : time);
    }
    for (const [index, kind] of ["near_pass_mark", "grading_output_retried", "assessment_disagreement", "learner_report"].entries()) {
      const flag = id(801 + index); flagIds.push(flag);
      await insert(h.db, "public.review_flags", {
        id: flag, submission_id: first, source: index === 3 ? "learner" : "rule", kind,
        comment_id: index === 3 ? comments[1] : null, reason: index === 3 ? "Rounding is unspecified for fractional prices." : null, created_at: time,
      });
    }
    for (const [index, score] of [90, 70].entries()) await insert(h.db, "public.grade_overrides", {
      id: id(901 + index), submission_id: first, actor_id: index ? actors.taB.id : actors.taA.id,
      created_at: time, audit_order: index ? 3 : 1, score, reason: index ? reason : "The additional currency concern merits credit.",
    });
    for (const [index, disposition] of ["upheld", "dismissed"].entries()) await insert(h.db, "public.flag_resolutions", {
      id: id(911 + index), flag_id: flagIds[3], actor_id: index ? actors.taB.id : actors.taA.id,
      created_at: time, audit_order: index ? 4 : 2, disposition, reason: index ? reason : "The rounding requirement is ambiguous.",
    });
  } catch (error) { await dispose(); throw error; }
  return { ...base, dispose, first, second, foreign, submitted, flagIds, reason, reportBody, time, id };
}
