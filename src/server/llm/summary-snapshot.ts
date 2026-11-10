import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { aggregateCategoryProgress, type Evidence } from "@/lib/ta/progress";
import { categories, validateInput } from "./contracts";
import { fail } from "./errors";
type Client = SupabaseClient<Database>;
async function checked<T>(query: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const r = await query; if (r.error) fail("SERVICE_UNAVAILABLE"); if (r.data == null) fail("NOT_FOUND"); return r.data;
}
// Internal capture shared by the authorized boundary and TA summary reads. All
// queries stay user-scoped; only the explicit LLM projection leaves this module.
export async function captureSummary(client: Client, learnerId: string, allowEmpty = false) {
  const learner = await checked(client.from("profiles").select("id,role").eq("id", learnerId).maybeSingle());
  if (learner.role !== "learner") fail("FORBIDDEN");
  const history = [];
  for (let offset = 0; ; offset += 100) {
    const page = await checked(client.from("submissions").select("id,learner_id,revision_id,attempt_number,submitted_at").eq("learner_id", learnerId).order("submitted_at", { ascending: false }).order("id").range(offset, offset + 99));
    history.push(...page); if (page.length < 100) break;
  }
  const evidence: Evidence[] = [], selected = [], effectiveOverrides = [];
  for (const s of history) {
    const runs = await checked(client.from("grading_runs").select("state").eq("submission_id", s.id).order("run_number", { ascending: false }).limit(1));
    if (runs[0]?.state !== "completed") continue;
    const grade = await checked(client.from("ai_grades").select("id,score").eq("submission_id", s.id).single());
    if (s.attempt_number !== 1 && selected.length >= 20) continue;
    const flaws = await checked(client.from("revision_flaws").select("id,category").eq("revision_id", s.revision_id).order("id"));
    const matches = await checked(client.from("ai_grade_assessments").select("flaw_id,comment_id").eq("grade_id", grade.id).order("flaw_id"));
    if (matches.length !== flaws.length || flaws.some(f => !matches.some(m => m.flaw_id === f.id))) fail("SERVICE_UNAVAILABLE");
    const matchedFlawIds = matches.filter(m => m.comment_id !== null).map(m => m.flaw_id);
    evidence.push({ id: s.id, learnerId, attemptNumber: s.attempt_number, gradingState: "completed", flaws, matchedFlawIds });
    if (selected.length >= 20) continue;
    const overrides = await checked(client.from("grade_overrides").select("score,audit_order").eq("submission_id", s.id).order("audit_order", { ascending: false }).limit(1));
    effectiveOverrides.push({ submissionId: s.id, auditOrder: overrides[0]?.audit_order ?? null });
    const comments = await checked(client.from("submission_comments").select("id,body").eq("submission_id", s.id).order("ordinal"));
    const feedback = await checked(client.from("ai_grade_comment_results").select("comment_id,feedback").eq("grade_id", grade.id));
    selected.push({ submissionId: s.id, revisionId: s.revision_id, attemptNumber: s.attempt_number, submittedAt: s.submitted_at,
      originalScore: grade.score, effectiveScore: overrides[0]?.score ?? grade.score,
      categories: categories.map(category => ({ category, totalFlaws: flaws.filter(f => f.category === category).length, identifiedFlaws: flaws.filter(f => f.category === category && matchedFlawIds.includes(f.id)).length })).filter(c => c.totalFlaws > 0),
      comments: comments.map(c => ({ commentId: c.id, body: c.body, feedback: feedback.find(f => f.comment_id === c.id)?.feedback ?? null })) });
  }
  const envelope = { schemaVersion: 1, operation: "summarize_learner", payload: { submissions: selected, progress: aggregateCategoryProgress(learnerId, evidence) } } as const;
  if (!selected.length && !allowEmpty) fail("INVALID_STATE");
  const snapshot = selected.length ? validateInput(envelope) : envelope;
  return { snapshot, retainedFlaws: [], fingerprint: createHash("sha256").update(JSON.stringify({ snapshot, effectiveOverrides })).digest("hex") };
}
