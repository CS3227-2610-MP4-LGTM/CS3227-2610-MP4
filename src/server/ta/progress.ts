import "server-only";
import { z } from "zod";
import { withTa } from "./submissions";
import { createClient } from "@/server/supabase/server";
import { challengeIdSchema as uuid, timestampSchema } from "@/server/learner/validation";
import { aggregateCategoryProgress, categories, selectRecommendations, type Evidence, type LearnerPageResult, type LearnerResult, type ProgressResult, type RecommendationResult } from "@/lib/ta/progress";
import { challengeCardSchema } from "@/lib/learner/challenge-schema";

type Client = Awaited<ReturnType<typeof createClient>>;
const identitySchema = z.strictObject({ id: uuid, displayName: z.string() });
const anchorSchema = z.strictObject({ createdAt: timestampSchema, id: uuid });
const cursorSchema = z.strictObject({ version: z.literal(1), anchor: anchorSchema });
const bound = (max: number) => z.string().regex(/^[1-9][0-9]?$/).transform(Number).pipe(z.number().max(max));
function fields(search: URLSearchParams) {
  const result = new Map<string, string>();
  for (const [key, value] of search) { if (result.has(key)) throw new Error("Duplicate field"); result.set(key, value); }
  return Object.fromEntries(result);
}
function parsePage(search: URLSearchParams) {
  const { limit = 20, cursor } = z.strictObject({ limit: bound(50).optional(), cursor: z.string().max(512).regex(/^[A-Za-z0-9_-]+$/).optional() }).parse(fields(search));
  if (!cursor) return { limit, anchor: undefined };
  const bytes = Buffer.from(cursor, "base64url");
  if (bytes.toString("base64url") !== cursor) throw new Error("Invalid cursor");
  return { limit, anchor: cursorSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))).anchor };
}
const identityResult = z.union([z.strictObject({ status: z.literal("ok"), learner: identitySchema }), z.strictObject({ status: z.enum(["forbidden", "not_found"]) })]);
async function identity(client: Client, id: string): Promise<LearnerResult> {
  const result = await client.rpc("read_ta_learner", { p_learner_id: id });
  if (result.error) throw result.error;
  const parsed = identityResult.parse(result.data);
  if (parsed.status === "ok") return parsed;
  return { status: parsed.status === "forbidden" ? "role_denied" : "not_found" };
}
export async function readLearner(id: string): Promise<LearnerResult> {
  return withTa(async client => uuid.safeParse(id).success ? identity(client, id) : { status: "invalid" } as const);
}
export async function readLearnerPage(search: URLSearchParams): Promise<LearnerPageResult> {
  return withTa(async client => {
    let query; try { query = parsePage(search); } catch { return { status: "invalid" } as const; }
    const result = await client.rpc("list_ta_learners", { p_limit: query.limit, p_before: query.anchor?.createdAt, p_after_id: query.anchor?.id });
    if (result.error) throw result.error;
    const parsed = z.union([z.strictObject({ status: z.literal("ok"), items: z.array(identitySchema).max(51), anchors: z.array(anchorSchema).max(51) }), z.strictObject({ status: z.enum(["forbidden", "invalid"]) })]).parse(result.data);
    if (parsed.status !== "ok") return { status: parsed.status === "forbidden" ? "role_denied" : "invalid" } as const;
    if (parsed.items.length !== parsed.anchors.length || parsed.items.some((item, i) => item.id !== parsed.anchors[i].id)) throw new Error("Invalid directory anchors");
    const items = parsed.items.slice(0, query.limit);
    const anchor = parsed.anchors[items.length - 1];
    return { status: "ok", page: { items, nextCursor: parsed.items.length > query.limit ? Buffer.from(JSON.stringify({ version: 1, anchor })).toString("base64url") : null } };
  });
}
// Page every ordinary user-scoped scan: the Data API caps each response. Never
// aggregate a truncated history or silently stop at the server's row limit.
async function scan<T>(read: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const result = await read(start, start + 499);
    if (result.error || !result.data) throw result.error ?? new Error("Missing evidence");
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}
async function submissions(client: Client, id: string) {
  return scan((start, end) => client.from("submissions").select("id,learner_id,challenge_id,revision_id,attempt_number").eq("learner_id", id).order("id").range(start, end));
}
async function aggregate(client: Client, id: string, history: Awaited<ReturnType<typeof submissions>>): Promise<ProgressResult> {
  const evidence: Evidence[] = [];
  for (const s of history.filter(s => s.attempt_number === 1)) {
    const run = await client.from("grading_runs").select("state").eq("submission_id", s.id).order("run_number", { ascending: false }).limit(1);
    if (run.error) throw run.error;
    if (run.data?.[0]?.state !== "completed") continue;
    const [flaws, grade] = await Promise.all([
      scan((start, end) => client.from("revision_flaws").select("id,category").eq("revision_id", s.revision_id).order("id").range(start, end)),
      client.from("ai_grades").select("id").eq("submission_id", s.id).single(),
    ]);
    if (grade.error || !grade.data || !flaws.length) throw grade.error ?? new Error("Missing original grade");
    const matches = await scan((start, end) => client.from("ai_grade_assessments").select("flaw_id,comment_id").eq("grade_id", grade.data.id).order("flaw_id").range(start, end));
    if (matches.length !== flaws.length || flaws.some(f => !matches.some(m => m.flaw_id === f.id))) throw new Error("Incomplete original matching");
    evidence.push({ id: s.id, learnerId: s.learner_id, attemptNumber: s.attempt_number, gradingState: "completed", flaws, matchedFlawIds: matches.filter(m => m.comment_id !== null).map(m => m.flaw_id) });
  }
  return { status: "ok", progress: aggregateCategoryProgress(id, evidence) };
}
export async function readCategoryProgress(id: string, search = new URLSearchParams()): Promise<ProgressResult> {
  return withTa(async client => {
    if (!uuid.safeParse(id).success || search.size) return { status: "invalid" } as const;
    const learner = await identity(client, id); if (learner.status !== "ok") return learner;
    return aggregate(client, id, await submissions(client, id));
  });
}
export async function readRecommendations(id: string, search: URLSearchParams): Promise<RecommendationResult> {
  return withTa(async client => {
    let limit; try { uuid.parse(id); limit = z.strictObject({ limit: bound(10).optional() }).parse(fields(search)).limit ?? 5; } catch { return { status: "invalid" } as const; }
    const learner = await identity(client, id); if (learner.status !== "ok") return learner;
    const history = await submissions(client, id);
    const progress = await aggregate(client, id, history); if (progress.status !== "ok") return progress;
    const live = await scan((start, end) => client.from("challenges").select("id,status,published_revision_id").eq("status", "published").order("id").range(start, end));
    const candidates = [];
    const attempted = new Set(history.map(s => s.challenge_id));
    for (const c of live) {
      if (attempted.has(c.id)) continue;
      if (!c.published_revision_id) throw new Error("Missing published revision");
      const [revision, flaws] = await Promise.all([
        client.from("challenge_revisions").select("id,title,description,language,difficulty,published_at").eq("id", c.published_revision_id).single(),
        scan((start, end) => client.from("revision_flaws").select("id,category").eq("revision_id", c.published_revision_id!).order("id").range(start, end)),
      ]);
      if (revision.error || !revision.data || !flaws.length) throw revision.error ?? new Error("Missing published material");
      const r = revision.data;
      candidates.push({ status: "published" as const, challenge: challengeCardSchema.parse({ id: c.id, revisionId: r.id, title: r.title, description: r.description, language: r.language, difficulty: r.difficulty, categories: categories.filter(category => flaws.some(f => f.category === category)).sort(), publishedAt: r.published_at }) });
    }
    return { status: "ok", recommendations: selectRecommendations(progress.progress, candidates, history.map(s => s.challenge_id), limit) };
  });
}
