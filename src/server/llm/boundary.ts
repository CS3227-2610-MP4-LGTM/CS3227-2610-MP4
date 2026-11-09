import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { assembleCandidate, categories, validateInput, type InputEnvelope, type Proposal } from "./contracts";
import { type RunnerOptions, type RunResult, createOperationRunner } from "./execution";
import { errorCode, fail } from "./errors";
import type { RetainedFlaw } from "./safety";
const requestSchema = z.strictObject({
    operation: z.enum([
        "inject_flaws", "generate_hints", "assess_review", "summarize_learner"
    ]),
    resourceId: z.uuid(),
    idempotencyKey: z.uuid(),
    expectedVersion: z.number().int().positive().optional()
});
const selectionSchema = z.strictObject({
    matches: z.array(z.strictObject({
        key: z.uuid(),
        commentId: z.uuid()
    })).max(5)
});
type Selection = z.infer<typeof selectionSchema>;
type Client = SupabaseClient<Database>;
type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
const privateFlawSchema = z.object({
    id: z.uuid(),
    revision_id: z.uuid(),
    category: z.enum(categories),
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive(),
    source_start_line: z.number().int().positive(),
    source_end_line: z.number().int().positive(),
    original_snippet: z.string(),
    replacement_snippet: z.string(),
    explanation: z.string(),
    fix: z.string()
});
type PrivateFlaw = z.infer<typeof privateFlawSchema>;
function retained(f: PrivateFlaw) {
    return {
        key: f.id,
        category: f.category,
        startLine: f.start_line,
        endLine: f.end_line,
        originalSnippet: f.original_snippet,
        replacementSnippet: f.replacement_snippet,
        explanation: f.explanation,
        fix: f.fix
    };
}
function publicFlaw(f: ReturnType<typeof retained>) {
    return {
        key: f.key,
        category: f.category,
        startLine: f.startLine,
        endLine: f.endLine,
        explanation: f.explanation,
        fix: f.fix
    };
}
function fingerprint(value: unknown) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function checked<T>(query: PromiseLike<{
    data: T;
    error: unknown;
}>): Promise<NonNullable<T>> {
    const result = await query;
    if (result.error)
        fail("SERVICE_UNAVAILABLE");
    if (result.data === null || result.data === undefined)
        fail("NOT_FOUND");
    return result.data;
}
type Capture = {
    snapshot: InputEnvelope;
    retainedFlaws: RetainedFlaw[];
    fingerprint: string;
};
export function createLlmBoundary(options: RunnerOptions & { client: Client }) {
    const { client, accounting } = options;
    const runner = createOperationRunner(options);
    async function identity() {
        const result = await client.auth.getUser();
        if (result.error) {
            if (result.error.status && result.error.status >= 500)
                fail("SERVICE_UNAVAILABLE");
            fail("UNAUTHENTICATED");
        }
        if (!result.data.user)
            fail("UNAUTHENTICATED");
        const profileResult = await client.from("profiles").select("id,role").eq("id", result.data.user.id).maybeSingle();
        if (profileResult.error)
            fail("SERVICE_UNAVAILABLE");
        const profile = profileResult.data;
        if (!profile || ![
            "author", "learner", "ta"
        ].includes(profile.role) || profile.id !== result.data.user.id)
            fail("FORBIDDEN");
        return profile;
    }
    async function authorCapture(accountId: string, request: z.infer<typeof requestSchema>): Promise<Capture> {
        const access = await checked(client.rpc("challenge_generation_access", {
            resource_id: request.resourceId
        }));
        if (access !== "OK")
            fail(access);
        const challenge = await checked(client.from("challenges").select("id,author_id,status,row_version,published_revision_id").eq("id", request.resourceId).maybeSingle());
        if (challenge.author_id !== accountId)
            fail("FORBIDDEN");
        if (challenge.status === "archived")
            fail("INVALID_STATE");
        const draft = await checked(client.from("challenge_drafts").select("challenge_id,language,difficulty,working_code,flaw_count,categories,generation_id,draft_version").eq("challenge_id", request.resourceId).maybeSingle());
        if (request.expectedVersion === undefined)
            fail("VALIDATION_ERROR");
        if (request.expectedVersion !== draft.draft_version)
            fail("VERSION_CONFLICT");
        const injection = {
            language: draft.language,
            difficulty: draft.difficulty,
            workingCode: draft.working_code,
            flawCount: draft.flaw_count,
            categories: draft.categories
        };
        if (request.operation === "inject_flaws") {
            const snapshot = validateInput({
                schemaVersion: 1,
                operation: request.operation,
                payload: injection
            });
            return {
                snapshot,
                retainedFlaws: [],
                fingerprint: fingerprint({
                    snapshot,
                    challenge,
                    draft
                })
            };
        }
        if (!draft.generation_id)
            fail("INVALID_STATE");
        const generation = await checked(client.from("proposal_sets").select("id,challenge_id,input_snapshot").eq("id", draft.generation_id).maybeSingle());
        if (generation.challenge_id !== request.resourceId)
            fail("INVALID_STATE");
        const captured = generation.input_snapshot as Record<string, unknown>;
        for (const key of Object.keys(injection) as (keyof typeof injection)[]) {
            if (JSON.stringify(captured[key]) !== JSON.stringify(injection[key]))
                fail("INVALID_STATE");
        }
        const proposals = await checked(client.from("proposals").select("id,category,source_start_line,source_end_line,original_snippet,replacement_snippet,explanation,fix").eq("proposal_set_id", draft.generation_id).order("source_start_line").order("id"));
        const decisions = proposals.length ? await checked(client.from("proposal_decisions").select("proposal_id,decision").in("proposal_id", proposals.map(p => p.id))) : [];
        if (!proposals.length || decisions.length !== proposals.length || decisions.some(d => d.decision === "pending"))
            fail("INVALID_STATE");
        const approved = proposals.filter(p => decisions.some(d => d.proposal_id === p.id && d.decision === "approved"));
        if (!approved.length)
            fail("INVALID_STATE");
        // Model proposal keys are ASCII local keys; database identities stay server-owned.
        const candidate = assembleCandidate(draft.working_code, approved.map((p, i): Proposal => ({
            key: `p${i}`,
            category: p.category,
            sourceStartLine: p.source_start_line,
            sourceEndLine: p.source_end_line,
            originalSnippet: p.original_snippet,
            replacementSnippet: p.replacement_snippet,
            explanation: p.explanation,
            fix: p.fix
        })));
        const flaws = candidate.flaws.map((p, i) => ({
            ...p,
            key: approved[i].id
        }));
        const snapshot = validateInput({
            schemaVersion: 1,
            operation: "generate_hints",
            payload: {
                language: draft.language,
                difficulty: draft.difficulty,
                flawedCode: candidate.code,
                flaws: flaws.map(publicFlaw)
            }
        });
        return {
            snapshot,
            retainedFlaws: flaws,
            fingerprint: fingerprint({
                snapshot,
                challenge,
                draft,
                generation,
                proposals,
                decisions
            })
        };
    }
    async function assessmentCapture(accountId: string, request: z.infer<typeof requestSchema>, selection?: Selection): Promise<Capture> {
        const submissionResult = await client.from("submissions").select("id,learner_id,revision_id").eq("id", request.resourceId).maybeSingle();
        if (submissionResult.error)
            fail("SERVICE_UNAVAILABLE");
        const submission = submissionResult.data;
        if (!submission || submission.learner_id !== accountId)
            fail("FORBIDDEN");
        const existing = await checked(client.from("ai_grades").select("id").eq("submission_id", submission.id));
        const active = await checked(client.from("grading_runs").select("id,state").eq("submission_id", submission.id).in("state", ["pending", "running"]));
        if (existing.length || active.length)
            fail("INVALID_STATE");
        const revision = await checked(client.from("challenge_revisions").select("id,language,flawed_code").eq("id", submission.revision_id).maybeSingle());
        const comments = await checked(client.from("submission_comments").select("id,ordinal,line,body").eq("submission_id", submission.id).order("ordinal"));
        if (!accounting.gradingContext)
            fail("SERVICE_UNAVAILABLE");
        // The admin read follows verified identity, stored Learner role, ownership,
        // and eligible persisted state. No other operation uses this privilege.
        const context = z.object({
            revisionId: z.uuid(),
            flaws: z.array(privateFlawSchema).max(5)
        }).safeParse(await accounting.gradingContext({
            accountId,
            submissionId: submission.id
        }));
        if (!context.success || context.data.revisionId !== submission.revision_id || context.data.flaws.some(f => f.revision_id !== submission.revision_id))
            fail("SERVICE_UNAVAILABLE");
        const flaws = context.data.flaws.map(retained);
        const selected = selection ?? {
            matches: []
        };
        if (new Set(selected.matches.map(m => m.key)).size !== selected.matches.length || new Set(selected.matches.map(m => m.commentId)).size !== selected.matches.length)
            fail("FORBIDDEN");
        const matches = selected.matches.map(pair => {
            const flaw = flaws.find(f => f.key === pair.key), comment = comments.find(c => c.id === pair.commentId);
            if (!flaw || !comment || comment.line < flaw.startLine - 1 || comment.line > flaw.endLine + 1)
                fail("FORBIDDEN");
            return {
                ...publicFlaw(flaw),
                comment: {
                    id: comment.id,
                    line: comment.line,
                    body: comment.body
                }
            };
        });
        const snapshot = validateInput({
            schemaVersion: 1,
            operation: "assess_review",
            payload: {
                language: revision.language,
                flawedCode: revision.flawed_code,
                matches
            }
        });
        return {
            snapshot,
            retainedFlaws: flaws,
            fingerprint: fingerprint({
                snapshot,
                submission,
                comments,
                flaws
            })
        };
    }
    async function summaryCapture(learnerId: string): Promise<Capture> {
        const learner = await checked(client.from("profiles").select("id,role").eq("id", learnerId).maybeSingle());
        if (learner.role !== "learner")
            fail("FORBIDDEN");
        // Progress covers all completed first attempts; page through history rather
        // than letting the API's row limit silently truncate it.
        const history: Row<"submissions">[] = [];
        for (let offset = 0;; offset += 100) {
            const page = await checked(client.from("submissions").select("*").eq("learner_id", learnerId).order("submitted_at", {
                ascending: false
            }).order("id").range(offset, offset + 99));
            history.push(...page);
            if (page.length < 100)
                break;
        }
        const progress = categories.map(category => ({
            category,
            totalFlaws: 0,
            identifiedFlaws: 0,
            identificationRate: null as number | null,
            completedFirstAttempts: 0
        }));
        const selected: unknown[] = [];
        for (const submission of history) {
            const grades = await checked(client.from("ai_grades").select("id,score").eq("submission_id", submission.id));
            if (!grades.length)
                continue;
            if (submission.attempt_number !== 1 && selected.length >= 20)
                continue;
            const grade = grades[0];
            const flaws = await checked(client.from("revision_flaws").select("id,category").eq("revision_id", submission.revision_id).order("start_line").order("id"));
            const assessments = await checked(client.from("ai_grade_assessments").select("flaw_id,comment_id").eq("grade_id", grade.id));
            const counts = categories.map(category => ({
                category,
                totalFlaws: flaws.filter(f => f.category === category).length,
                identifiedFlaws: flaws.filter(f => f.category === category && assessments.some(a => a.flaw_id === f.id && a.comment_id !== null)).length
            })).filter(c => c.totalFlaws > 0);
            if (submission.attempt_number === 1)
                for (const c of counts) {
                    const target = progress.find(p => p.category === c.category)!;
                    target.totalFlaws += c.totalFlaws;
                    target.identifiedFlaws += c.identifiedFlaws;
                    target.completedFirstAttempts++;
                }
            if (selected.length >= 20)
                continue;
            const overrides = await checked(client.from("grade_overrides").select("score,audit_order").eq("submission_id", submission.id).order("audit_order", {
                ascending: false
            }).limit(1));
            const comments = await checked(client.from("submission_comments").select("id,body").eq("submission_id", submission.id).order("ordinal"));
            const feedback = await checked(client.from("ai_grade_comment_results").select("comment_id,feedback").eq("grade_id", grade.id));
            selected.push({
                submissionId: submission.id,
                revisionId: submission.revision_id,
                attemptNumber: submission.attempt_number,
                submittedAt: submission.submitted_at,
                originalScore: grade.score,
                effectiveScore: overrides[0]?.score ?? grade.score,
                categories: counts,
                comments: comments.map(c => ({
                    commentId: c.id,
                    body: c.body,
                    feedback: feedback.find(f => f.comment_id === c.id)?.feedback ?? null
                }))
            });
        }
        for (const c of progress)
            c.identificationRate = c.totalFlaws ? Math.round(c.identifiedFlaws / c.totalFlaws * 10000) / 10000 : null;
        if (!selected.length)
            fail("INVALID_STATE");
        const snapshot = validateInput({
            schemaVersion: 1,
            operation: "summarize_learner",
            payload: {
                submissions: selected,
                progress: {
                    learnerId,
                    categories: progress
                }
            }
        });
        return {
            snapshot,
            retainedFlaws: [],
            fingerprint: fingerprint(snapshot)
        };
    }
    return {
        async execute(value: unknown, serverSelection?: unknown): Promise<RunResult> {
            try {
                const parsed = requestSchema.safeParse(value);
                const selected = serverSelection === undefined ? undefined : selectionSchema.safeParse(serverSelection);
                if (!parsed.success || (selected && !selected.success))
                    fail("VALIDATION_ERROR");
                const request = parsed.data, caller = await identity();
                const required = request.operation === "assess_review" ? "learner" : request.operation === "summarize_learner" ? "ta" : "author";
                if (caller.role !== required)
                    fail("FORBIDDEN");
                const capture = () => request.operation === "assess_review" ? assessmentCapture(caller.id, request, selected?.data) : request.operation === "summarize_learner" ? summaryCapture(request.resourceId) : authorCapture(caller.id, request);
                const initial = await capture();
                const result = await runner.run({
                    accountId: caller.id,
                    resourceId: request.resourceId,
                    idempotencyKey: request.idempotencyKey,
                    ...initial
                });
                if (result.data) {
                    if (options.clock() >= result.meta.deadline) fail("AI_TIMEOUT");
                    // Reverify identity and snapshot after dispatch. No generated role result
                    // is persisted here; downstream atomic mutations must repeat their CAS.
                    const currentCaller = await identity();
                    if (currentCaller.id !== caller.id || currentCaller.role !== caller.role)
                        fail("FORBIDDEN");
                    const current = await capture();
                    if (options.clock() >= result.meta.deadline) fail("AI_TIMEOUT");
                    if (current.fingerprint !== initial.fingerprint)
                        fail("VERSION_CONFLICT");
                }
                return result;
            }
            catch (error) {
                return {
                    error: {
                        code: errorCode(error)
                    }
                };
            }
        },
        async readUsage() {
            try {
                const caller = await identity();
                if (!accounting.read)
                    fail("SERVICE_UNAVAILABLE");
                const usage = await accounting.read({
                    accountId: caller.id
                });
                return {
                    data: {
                        accountId: caller.id,
                        usage: usage.account,
                        budget: options.limits.account
                    }
                };
            }
            catch (error) {
                return {
                    error: {
                        code: errorCode(error)
                    }
                };
            }
        }
    };
}
