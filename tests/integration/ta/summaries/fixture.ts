import { createProgressFixture } from "../progress/fixture";
import { insert, quote } from "../../domain/fixture";
import { id } from "../../../unit/ta/summaries/evidence";

export async function createSummaryFixture() {
  const f = await createProgressFixture();
  const added: { table: string; id: string }[] = [];
  async function put(table: string, row: Record<string, unknown>) {
    await insert(f.h.db, `public.${table}`, row); added.push({ table, id: row.id as string });
  }
  async function completed(n: number, at: string, category: "logic_bug" | "edge_case" = "logic_bug") {
    const candidate = await f.addCandidate(n, [category]); const sid = id(n + 20000), run = id(n + 30000), grade = id(n + 40000);
    await put("submissions", { id: sid, learner_id: id(11), challenge_id: candidate.id, revision_id: candidate.revisionId, attempt_number: 1, submitted_at: at });
    await put("grading_runs", { id: run, submission_id: sid, run_number: 1, state: "completed", created_at: at, finished_at: at });
    await put("ai_grades", { id: grade, submission_id: sid, score: 0, passed: false, identification_points: 0, explanation_points: 0, fix_points: 0 });
    await insert(f.h.db, "public.ai_grade_evidence", { grade_id: grade, grading_run_id: run, provider_output_retried: false });
    const flaws = await f.h.db.query("select id from public.revision_flaws where revision_id=$1", [candidate.revisionId]);
    await insert(f.h.db, "public.ai_grade_assessments", { grade_id: grade, flaw_id: flaws.rows[0].id, comment_id: null, distance: null });
    return { submissionId: sid, revisionId: candidate.revisionId, at };
  }
  // Scope cleanup to generated summary/accounting descendants of these fixture
  // accounts. Discover optional new summary mutation tables without prescribing
  // implementation storage, and never truncate shared tables.
  async function clearGenerated() {
    const tables = await f.h.db.query<{ schema: string; name: string; columns: string[]; primary_columns: string[] }>(`
      select n.nspname as schema,c.relname as name,array_agg(a.attname::text) as columns,
      array_agg(a.attname::text) filter(where exists(select 1 from pg_index i where i.indrelid=c.oid and i.indisprimary and a.attnum=any(i.indkey))) as primary_columns
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and a.atttypid='uuid'::regtype
      where n.nspname in('public','private') and c.relkind='r' and c.relname ~ '(summar|llm_|ai_usage)'
      group by c.oid,n.nspname,c.relname`);
    const owned = new Set(Object.values(f.actors).map(actor => actor.id));
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const t of tables.rows) {
        const condition = t.columns.map(c => `${quote(c)}=any($1::uuid[])`).join(" or ");
        const records = await f.h.db.query(`select * from ${quote(t.schema)}.${quote(t.name)} where ${condition}`, [[...owned]]);
        for (const row of records.rows) for (const key of t.primary_columns ?? []) if (row[key] && !owned.has(row[key])) { owned.add(row[key]); expanded = true; }
      }
    }
    await f.h.db.query("begin");
    try {
      await f.h.db.query("set local session_replication_role=replica");
      for (const t of tables.rows) await f.h.db.query(`delete from ${quote(t.schema)}.${quote(t.name)} where ${t.columns.map(c => `${quote(c)}=any($1::uuid[])`).join(" or ")}`, [[...owned]]);
      const grades = added.filter(row => row.table === "ai_grades").map(row => row.id);
      for (const table of ["ai_grade_assessments", "ai_grade_evidence"]) await f.h.db.query(`delete from public.${table} where grade_id=any($1::uuid[])`, [grades]);
      await f.h.db.query("delete from public.submission_comments where submission_id=any($1::uuid[])", [added.filter(row => row.table === "submissions").map(row => row.id)]);
      for (const row of added.toReversed()) await f.h.db.query(`delete from public.${quote(row.table)} where id=$1`, [row.id]);
      added.length = 0;
      // The freshness test appends through the real moderation endpoint. Keep
      // its base override/resolution and remove only its extra fixture records.
      await f.h.db.query("delete from public.grade_overrides where submission_id=$1 and id<>$2", [id(501), id(901)]);
      await f.h.db.query("commit");
    } catch (error) { await f.h.db.query("rollback"); throw error; }
  }
  return { ...f, completed, clearGenerated, dispose: async () => {
    try {
      await clearGenerated();
    } catch (error) { await f.h.db.query("rollback"); throw error; }
    finally { await f.dispose(); }
  } };
}
