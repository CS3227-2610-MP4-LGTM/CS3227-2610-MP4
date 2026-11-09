import { createInspectionFixture } from "../inspection/fixture";
import { insert } from "../../domain/fixture";
import { answers, code } from "../../../unit/ta/inspection/evidence";
import { id, type Category } from "../../../unit/ta/progress/evidence";

// Derived scenarios preserve T-30's retained S1/S2/S3 evidence and identities.
export async function createProgressFixture() {
  const base = await createInspectionFixture();
  const rows: { table: string; key: string; value: unknown }[] = [];
  async function put(table: string, row: Record<string, unknown>, key = "id") {
    await insert(base.h.db, `public.${table}`, row); rows.push({ table, key, value: row[key] });
  }
  async function addCandidate(n: number, categories: Category[] = ["logic_bug", "edge_case"], difficulty = "easy", status = "published") {
    const cid = id(n), rid = id(n + 1000), set = id(n + 2000);
    const metadata = { title: `Practice ${n}`, description: "Review the changes.", language: "javascript", difficulty };
    await put("challenges", { id: cid, author_id: id(1), created_at: "2026-01-01T00:00:00Z" });
    await put("challenge_drafts", { challenge_id: cid, ...metadata, working_code: code.before, flaw_count: categories.length, categories }, "challenge_id");
    await put("proposal_sets", { id: set, challenge_id: cid, source_draft_version: 1,
      input_snapshot: JSON.stringify({ ...metadata, workingCode: code.before, flawCount: categories.length, categories }) });
    await put("challenge_revisions", { id: rid, challenge_id: cid, revision_number: 1, ...metadata, flawed_code: code.after,
      published_at: "2026-01-01T00:00:00Z" });
    await put("revision_answers", { revision_id: rid, working_code: code.before, real_diff: JSON.stringify(code) }, "revision_id");
    for (const [index, category] of categories.entries()) {
      const source = answers[index]; const pid = id(n + 3000 + index * 100); const fid = id(n + 4000 + index * 100);
      const details = { category, original_snippet: source.originalSnippet, replacement_snippet: source.replacementSnippet,
        source_start_line: source.sourceStartLine, source_end_line: source.sourceEndLine, explanation: source.explanation, fix: source.fix };
      await put("proposals", { id: pid, proposal_set_id: set, ...details });
      await put("proposal_decisions", { proposal_id: pid, decision: "approved" }, "proposal_id");
      await put("revision_flaws", { id: fid, revision_id: rid, proposal_id: pid, ...details, start_line: source.startLine, end_line: source.endLine });
      await put("flaw_hints", { id: id(n + 5000 + index * 100), flaw_id: fid, revision_id: rid, text: "Consider the boundary behavior.", generation_metadata: "{}" });
    }
    await base.h.db.query("update public.challenges set status=$1,published_revision_id=$2 where id=$3", [status, rid, cid]);
    return { id: cid, revisionId: rid };
  }
  async function addAttempt(n: number, candidate: { id: string; revisionId: string }, state: "pending" | "running" | "failed") {
    await put("submissions", { id: id(n), learner_id: id(11), challenge_id: candidate.id, revision_id: candidate.revisionId,
      attempt_number: 1, previous_submission_id: null, submitted_at: "2026-01-01T00:00:01Z" });
    await put("grading_runs", { id: id(n + 1000), submission_id: id(n), state, run_number: 1,
      failure_code: state === "failed" ? "AI_UNAVAILABLE" : null, finished_at: state === "failed" ? "2026-01-01T00:00:02Z" : null });
  }
  async function snapshot() {
    // Capture complete records so accidental updates are detected as well as inserts/deletes.
    const tables = ["profiles", "challenges", "challenge_drafts", "proposal_sets", "proposals", "proposal_decisions", "challenge_revisions", "revision_answers", "revision_flaws", "flaw_hints", "submissions", "submission_comments", "grading_runs", "ai_grades", "ai_grade_evidence", "ai_grade_comment_results", "ai_grade_assessments", "ai_grade_eligible_hints", "grade_overrides", "review_flags", "flag_resolutions", "performance_summaries", "performance_summary_evidence"];
    const result: Record<string, unknown> = {};
    for (const table of tables) result[table] = (await base.h.db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as records from public.${table} t`)).rows[0].records;
    for (const table of ["profile_roles", "submission_audit_orders", "llm_operations", "ai_usage_records", "llm_usage_events"]) result[table] = (await base.h.db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as records from private.${table} t`)).rows[0].records;
    return result;
  }
  return { ...base, addCandidate, addAttempt, snapshot, dispose: async () => {
    try {
      await base.h.db.query("begin"); await base.h.db.query("set local session_replication_role = replica");
      for (const row of rows.toReversed()) await base.h.db.query(`delete from public.${row.table} where ${row.key}=$1`, [row.value]);
      await base.h.db.query("commit");
    } catch (error) { await base.h.db.query("rollback"); throw error; }
    finally { await base.dispose(); }
  } };
}
