import { localHarness } from "../../auth/local";
import { insert } from "../../domain/fixture";
import { answers, code, comments, id, submission, submittedAt } from "../../../unit/ta/inspection/evidence";

export async function createInspectionFixture() {
  const h = localHarness();
  const actorKeys = ["authorA", "authorB", "learnerA", "learnerB", "taA", "taB"] as const;
  const actors = {} as Record<typeof actorKeys[number], { id: string; email: string; password: string; client: ReturnType<typeof h.client> }>;
  const rows: { table: string; key: string; value: unknown }[] = [];
  const users: string[] = [];
  const password = "local TA inspection fixture";
  async function put(table: string, row: Record<string, unknown>, key = "id") {
    await insert(h.db, `public.${table}`, row); rows.push({ table, key, value: row[key] });
  }
  async function dispose() {
    try {
      await h.db.query("begin");
      await h.db.query("set local session_replication_role = replica");
      for (const row of rows.toReversed()) await h.db.query(`delete from public.${row.table} where ${row.key} = $1`, [row.value]);
      await h.db.query("delete from private.submission_audit_orders where submission_id = $1", [id(501)]);
      await h.db.query("commit");
      for (const user of users) {
        const result = await h.admin.auth.admin.deleteUser(user);
        if (result.error) throw new Error("Could not remove a local TA inspection identity");
      }
    } finally { await h.db.end(); }
  }
  async function revision(revisionId: string, number: number, changed = false) {
    const metadata = { title: changed ? "Checkout R2" : "Checkout totals", description: "Review the changes to discounts and basket totals.", language: "javascript", difficulty: "easy" };
    const setId = id(2000 + number);
    const revisionCode = changed ? { ...code, after: code.after.replace(answers[0].replacementSnippet, "  return price * fraction * 2;"),
      hunks: code.hunks.map((hunk, index) => index ? hunk : { ...hunk, lines: hunk.lines.map(line => line.kind === "added" ? { ...line, text: "  return price * fraction * 2;" } : line) }) } : code;
    await put("proposal_sets", { id: setId, challenge_id: id(101), source_draft_version: number,
      input_snapshot: JSON.stringify({ ...metadata, workingCode: code.before, flawCount: 2, categories: ["logic_bug", "edge_case"] }) });
    await put("challenge_revisions", { id: revisionId, challenge_id: id(101), revision_number: number,
      ...metadata, flawed_code: revisionCode.after });
    await put("revision_answers", { revision_id: revisionId, working_code: code.before,
      real_diff: JSON.stringify(revisionCode) }, "revision_id");
    for (const [index, flaw] of answers.entries()) {
      const proposalId = changed ? id(2301 + index) : flaw.proposalId;
      const details = { category: flaw.category, original_snippet: flaw.originalSnippet, replacement_snippet: changed && index === 0 ? "  return price * fraction * 2;" : flaw.replacementSnippet,
        source_start_line: flaw.sourceStartLine, source_end_line: flaw.sourceEndLine, explanation: flaw.explanation, fix: flaw.fix };
      await put("proposals", { id: proposalId, proposal_set_id: setId, ...details });
      await put("proposal_decisions", { proposal_id: proposalId, decision: "approved" }, "proposal_id");
      const flawId = changed ? id(3301 + index) : flaw.id;
      await put("revision_flaws", { id: flawId, proposal_id: proposalId, revision_id: revisionId, ...details,
        start_line: flaw.startLine, end_line: flaw.endLine });
      await put("flaw_hints", { id: changed ? id(3401 + index) : id(401 + index), flaw_id: flawId, revision_id: revisionId,
        text: index ? "Consider the smallest possible basket." : "Consider the returned value at discount extremes.", generation_metadata: "{}" });
    }
  }
  async function attempt(suffix: number, learnerId: string, attemptNumber: number, state: string, score?: number) {
    const sid = id(suffix), run = id(4000 + suffix), grade = id(suffix === 501 ? 701 : suffix === 502 ? 703 : suffix === 503 ? 702 : 5000 + suffix);
    await put("submissions", { id: sid, learner_id: learnerId, challenge_id: id(101), revision_id: id(201),
      attempt_number: attemptNumber, previous_submission_id: attemptNumber === 2 ? id(501) : null, submitted_at: submittedAt });
    const attemptComments = suffix === 514 ? [comments[0], { id: id(607), ordinal: 1, line: 3, body: "Duplicate concern" }].map((c, i) => ({ ...c, id: id(607 + i) })) : suffix === 501 ? comments : suffix === 502 ? [
      { id: id(603), ordinal: 0, line: 3, body: comments[0].body },
      { id: id(604), ordinal: 1, line: 10, body: "An empty basket makes reduce throw; pass zero as the initial accumulator." },
    ] : suffix === 503 ? [
      { id: id(605), ordinal: 0, line: 3, body: "Multiply by one minus fraction." },
      { id: id(606), ordinal: 1, line: 10, body: "This seems suspicious." },
    ] : [];
    for (const comment of attemptComments) await put("submission_comments", { ...comment, submission_id: sid });
    await put("grading_runs", { id: run, submission_id: sid, run_number: 1, state,
      failure_code: state === "failed" ? "AI_UNAVAILABLE" : null, created_at: submittedAt,
      finished_at: ["pending", "running"].includes(state) ? null : submittedAt });
    if (score === undefined) return;
    const components = score === 25 ? [0, 15, 10] : score === 100 ? [50, 30, 20] : score === 60 ? [50, 0, 10] : score === 50 ? [25, 15, 10] : [0, 0, 0];
    await put("ai_grades", { id: grade, submission_id: sid, score, passed: score >= 60,
      identification_points: components[0], explanation_points: components[1], fix_points: components[2] });
    await put("ai_grade_evidence", { grade_id: grade, grading_run_id: run, provider_output_retried: false }, "grade_id");
    for (const [index, comment] of attemptComments.entries()) {
      const duplicate = suffix === 514 && index === 1;
      const unmatched = (suffix === 501 && index === 1) || duplicate;
      const credits = suffix === 503 ? [0, index === 0 ? 1 : 0] : [1, 1];
      await put("ai_grade_comment_results", { grade_id: grade, comment_id: comment.id, kind: duplicate ? "duplicate" : unmatched ? "unmatched" : "matched",
        explanation_credit: unmatched ? null : credits[0], fix_credit: unmatched ? null : credits[1],
        feedback: unmatched ? null : suffix !== 503 ? "The consequence and proposed fix are clear." : index === 0
          ? "Explain why the behavior is incorrect." : "Explain the consequence and propose an actionable change." }, "comment_id");
    }
    for (const [index, flaw] of answers.entries()) {
      const commentId = score === 0 || ([501, 514].includes(suffix) && index === 1) ? null : attemptComments[index].id;
      await put("ai_grade_assessments", { grade_id: grade, flaw_id: flaw.id, comment_id: commentId, distance: commentId ? 0 : null }, "grade_id");
      if (!commentId) await put("ai_grade_eligible_hints", { grade_id: grade, hint_id: id(401 + index), category: flaw.category, ordinal: [501, 514].includes(suffix) ? 0 : index }, "grade_id");
    }
  }
  try {
    await h.db.connect();
    for (const [index, key] of actorKeys.entries()) {
      const role = key.slice(0, -1), actorId = id([1, 2, 11, 12, 21, 22][index]);
      const email = `t30-${key.toLowerCase()}@example.test`;
      const result = await h.admin.auth.admin.createUser({ id: actorId, email, password, email_confirm: true,
        user_metadata: { role, display_name: `${role === "ta" ? "TA" : role[0].toUpperCase() + role.slice(1)} ${key.at(-1)}` } });
      if (result.error || !result.data.user) throw new Error(`Could not provision local ${key}`);
      users.push(result.data.user.id);
      if (result.data.user.id !== actorId) throw new Error("Local fixture identity differs from the contract");
      const client = h.client();
      if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error(`Could not sign in local ${key}`);
      actors[key] = { id: actorId, email, password, client };
    }
    await put("challenges", { id: id(101), author_id: id(1), created_at: "2026-01-01T00:00:00Z" });
    await put("challenge_drafts", { challenge_id: id(101), draft_version: 1, generation_id: null, working_code: code.before,
      title: "Checkout totals", description: "Review the changes to discounts and basket totals.", language: "javascript", difficulty: "easy", flaw_count: 2, categories: ["logic_bug", "edge_case"] }, "challenge_id");
    await revision(id(201), 1);
    await h.db.query("update public.challenges set status = 'published', published_revision_id = $1 where id = $2", [id(201), id(101)]);
    await attempt(501, id(11), 1, "completed", 25);
    await attempt(502, id(11), 2, "completed", 100);
    await attempt(503, id(12), 1, "completed", 60);
    // Additional deterministic Learners keep derived status attempts independent.
    const statusIds: Record<string, string> = {};
    for (const [index, state] of ["pending", "running", "failed", "zero", "duplicate"].entries()) {
      const learner = await h.admin.auth.admin.createUser({ id: id(31 + index), email: `t30-${state}@example.test`, password,
        email_confirm: true, user_metadata: { role: "learner", display_name: `Learner ${state}` } });
      if (learner.error || !learner.data.user) throw new Error("Could not create status fixture learner");
      users.push(learner.data.user.id);
      statusIds[state] = id(510 + index);
      await attempt(510 + index, learner.data.user.id, 1, ["zero", "duplicate"].includes(state) ? "completed" : state, state === "zero" ? 0 : state === "duplicate" ? 50 : undefined);
    }
    const base = submission();
    await put("review_flags", { id: id(801), submission_id: id(501), source: "learner", kind: "learner_report", comment_id: id(602), reason: base.flags[0].reason });
    for (const [index, kind] of ["near_pass_mark", "assessment_disagreement"].entries()) await put("review_flags", {
      id: id(802 + index), submission_id: id(503), source: "rule", kind, comment_id: null, reason: null });
    await put("grade_overrides", { id: id(901), submission_id: id(501), actor_id: id(21), audit_order: 1, score: 70, reason: base.grading.overrides[0].reason });
    await put("flag_resolutions", { id: id(902), flag_id: id(801), actor_id: id(21), audit_order: 2, disposition: "upheld", reason: base.flags[0].resolutions[0].reason });
    return { h, actors, statusIds, dispose, publishNextRevision: async () => {
      await revision(id(211), 2, true);
      await h.db.query("update public.challenges set published_revision_id = $1 where id = $2", [id(211), id(101)]);
    } };
  } catch (error) { await dispose(); throw error; }
}
