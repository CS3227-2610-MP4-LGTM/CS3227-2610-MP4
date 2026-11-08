import "server-only";
import { z } from "zod";
import { getAccount } from "@/server/auth/account";
import { createClient } from "@/server/supabase/server";
import { cardSchema, submissionSchema, type DetailResult, type ListResult, type ReadFailure } from "@/lib/ta/submissions";
import { challengeIdSchema } from "@/server/learner/validation";
import { encodeSubmissionCursor, parseSubmissionQuery } from "./validation";
type Client = Awaited<ReturnType<typeof createClient>>;
async function withTa<T>(read: (client: Client) => Promise<T>): Promise<T | ReadFailure> {
  let client: Client;
  try {
    client = await createClient();
    const account = await getAccount(undefined, client);
    if (account.status === "unauthenticated") return { status: "unauthenticated" };
    if (account.status === "forbidden") return { status: "account_unavailable" };
    if (account.status !== "ok") return { status: "account_service_unavailable" };
    if (account.account.role !== "ta") return { status: "role_denied" };
  } catch { return { status: "account_service_unavailable" }; }
  try { return await read(client); } catch { return { status: "unavailable" }; }
}
const pageSchema = z.union([z.strictObject({ status: z.literal("ok"), items: z.array(cardSchema).max(51) }), z.strictObject({ status: z.enum(["forbidden", "invalid"]) })]);
export async function readSubmissionPage(search: URLSearchParams): Promise<ListResult> {
  return withTa(async client => {
    let query;
    try { query = parseSubmissionQuery(search); } catch { return { status: "invalid" } as const; }
    const { data, error } = await client.rpc("list_ta_submissions", { p_limit: query.limit, p_learner_id: query.learnerId, p_challenge_id: query.challengeId, p_grading_state: query.gradingState, p_before: query.anchor?.submittedAt, p_after_id: query.anchor?.id });
    if (error) return { status: "unavailable" } as const;
    const result = pageSchema.parse(data);
    if (result.status === "forbidden") return { status: "role_denied" } as const;
    if (result.status !== "ok") return { status: "invalid" } as const;
    const items = result.items.slice(0, query.limit), last = items.at(-1);
    return { status: "ok", page: { items, nextCursor: last && result.items.length > query.limit ? encodeSubmissionCursor({ submittedAt: last.submittedAt, id: last.id }, query) : null } };
  });
}
// Explicit projections prevent schema additions (especially profile fields) leaking into DTOs.
export async function readSubmission(id: string): Promise<DetailResult> {
  return withTa(async client => {
    if (!challengeIdSchema.safeParse(id).success) return { status: "invalid" } as const;
    const base = await client.from("submissions").select("id,learner_id,challenge_id,revision_id,attempt_number,previous_submission_id,submitted_at").eq("id", id).maybeSingle();
    if (base.error) throw base.error;
    if (!base.data) return { status: "not_found" } as const;
    const s = base.data;
    const results = await Promise.all([
      client.from("profiles").select("id,display_name").eq("id", s.learner_id).single(),
      client.from("challenge_revisions").select("id,title,description,language,difficulty,published_at").eq("id", s.revision_id).single(),
      client.from("revision_answers").select("real_diff").eq("revision_id", s.revision_id).single(),
      client.from("revision_flaws").select("id,revision_id,proposal_id,category,source_start_line,source_end_line,start_line,end_line,original_snippet,replacement_snippet,explanation,fix").eq("revision_id", s.revision_id).order("start_line").order("id"),
      client.from("submission_comments").select("id,ordinal,line,body").eq("submission_id", id).order("ordinal"),
      client.from("grading_runs").select("state,failure_code").eq("submission_id", id).order("run_number", { ascending: false }).limit(1),
      client.from("ai_grades").select("id,score,passed,identification_points,explanation_points,fix_points").eq("submission_id", id).maybeSingle(),
      client.from("grade_overrides").select("id,actor_id,created_at,audit_order,score,reason").eq("submission_id", id).order("audit_order"),
      client.from("review_flags").select("id,submission_id,source,kind,comment_id,reason,created_at").eq("submission_id", id).order("created_at").order("id"),
    ]);
    for (const result of results) if (result.error) throw result.error;
    const [profile, revision, code, flaws, comments, runs, grade, overrides, flags] = results;
    if (!profile.data || !revision.data || !code.data || !flaws.data || !comments.data || !overrides.data || !flags.data) throw new Error("Incomplete evidence");
    const answers = flaws.data.map(f => ({ id: f.id, revisionId: f.revision_id, proposalId: f.proposal_id, category: f.category, sourceStartLine: f.source_start_line, sourceEndLine: f.source_end_line, startLine: f.start_line, endLine: f.end_line, originalSnippet: f.original_snippet, replacementSnippet: f.replacement_snippet, explanation: f.explanation, fix: f.fix }));
    const audit = (r: { id: string; actor_id: string; created_at: string; audit_order: number; reason: string }) => ({ id: r.id, actorId: r.actor_id, createdAt: r.created_at, auditOrder: r.audit_order, reason: r.reason });
    const history = overrides.data.map(o => ({ ...audit(o), score: o.score }));
    const flagViews = await Promise.all(flags.data.map(async f => {
      const resolutions = await client.from("flag_resolutions").select("id,actor_id,created_at,audit_order,reason,disposition").eq("flag_id", f.id).order("audit_order");
      if (resolutions.error) throw resolutions.error;
      return { id: f.id, submissionId: f.submission_id, source: f.source, kind: f.kind, commentId: f.comment_id, reason: f.reason, createdAt: f.created_at, status: resolutions.data.length ? "resolved" : "open", resolutions: resolutions.data.map(r => ({ ...audit(r), disposition: r.disposition })) };
    }));
    let original = null;
    let matching: z.infer<typeof submissionSchema>["matching"] = { matches: [], missedFlawIds: [], unmatchedCommentIds: [], duplicateCommentIds: [] };
    let assessments: z.infer<typeof submissionSchema>["assessments"] = [];
    const state = runs.data?.[0]?.state ?? "pending";
    if (state === "completed") {
      const g = grade.data;
      if (!g) throw new Error("Missing completed grade");
      const [cr, ar, hints] = await Promise.all([
        client.from("ai_grade_comment_results").select("comment_id,kind,explanation_credit,fix_credit,feedback").eq("grade_id", g.id),
        client.from("ai_grade_assessments").select("flaw_id,comment_id,distance").eq("grade_id", g.id),
        client.from("ai_grade_eligible_hints").select("hint_id,category").eq("grade_id", g.id).order("ordinal"),
      ]);
      if (cr.error || ar.error || hints.error) throw new Error("Grade unavailable");
      const ordered = comments.data.map(c => { const found = cr.data.find(r => r.comment_id === c.id); if (!found) throw new Error("Missing comment evidence"); return found; });
      const perFlaw = answers.map(f => { const found = ar.data.find(r => r.flaw_id === f.id); if (!found) throw new Error("Missing flaw evidence"); return found; });
      matching = { matches: perFlaw.filter(a => a.comment_id !== null).map(a => ({ flawId: a.flaw_id, commentId: a.comment_id!, distance: a.distance! })), missedFlawIds: perFlaw.filter(a => a.comment_id === null).map(a => a.flaw_id), unmatchedCommentIds: ordered.filter(c => c.kind === "unmatched").map(c => c.comment_id), duplicateCommentIds: ordered.filter(c => c.kind === "duplicate").map(c => c.comment_id) };
      assessments = perFlaw.map(a => { const c = ordered.find(c => c.comment_id === a.comment_id); return { flawId: a.flaw_id, commentId: a.comment_id, explanationCredit: c?.explanation_credit ?? 0, fixCredit: c?.fix_credit ?? 0, feedback: c?.feedback ?? null }; }) as typeof assessments;
      original = { score: g.score, passed: g.passed, passMark: 60, identificationPoints: g.identification_points, explanationPoints: g.explanation_points, fixPoints: g.fix_points, matchedCount: matching.matches.length, missedCount: matching.missedFlawIds.length, unmatchedCommentIds: matching.unmatchedCommentIds, duplicateCommentIds: matching.duplicateCommentIds, comments: ordered.map(c => ({ commentId: c.comment_id, matched: c.kind === "matched", explanationCredit: c.explanation_credit, fixCredit: c.fix_credit, feedback: c.feedback })), eligibleHints: hints.data.map(h => ({ hintId: h.hint_id, category: h.category })) };
    }
    const latest = history.at(-1), r = revision.data;
    const effective = original ? { score: latest?.score ?? original.score, passed: (latest?.score ?? original.score) >= 60, source: latest ? "ta" : "ai" } : null;
    return { status: "ok", submission: submissionSchema.parse({ id: s.id, challengeId: s.challenge_id, revisionId: s.revision_id, learner: { id: profile.data.id, displayName: profile.data.display_name }, attemptNumber: s.attempt_number, previousSubmissionId: s.previous_submission_id, submittedAt: s.submitted_at, challenge: { id: s.challenge_id, revisionId: r.id, title: r.title, description: r.description, language: r.language, difficulty: r.difficulty, categories: [...new Set(answers.map(f => f.category))].sort(), publishedAt: r.published_at, code: code.data.real_diff }, comments: comments.data, answerKey: answers, matching, assessments, grading: { state, failureCode: runs.data?.[0]?.failure_code ?? null, original, effective, overrides: history }, flags: flagViews }) };
  });
}
