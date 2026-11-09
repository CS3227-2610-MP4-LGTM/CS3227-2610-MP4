import "server-only";
import { z } from "zod";
import { isWorkspaceAccessFailure, type WorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { genericReadFailure, type AttemptResult, type CatalogueResult, type ChallengeResult, type ReadFailure } from "@/lib/learner/challenges";
import { categoriesSchema, challengeCardSchema } from "@/lib/learner/challenge-schema";
import { createClient } from "@/server/supabase/server";
import { checkLearnerAccount, type LearnerClient } from "./access";
import { projectLearnerCode } from "./projection";
import {
  challengeIdSchema, encodeChallengeCursor, parseChallengeDetailQuery, parseChallengeListQuery,
} from "./validation";

const unavailable = { status: "unavailable" } as const;
const invalid = { status: "invalid" } as const;
const catalogueSchema = z.union([
  z.strictObject({
    status: z.literal("ok"),
    items: z.array(challengeCardSchema).max(51),
    anchorRevisionId: challengeIdSchema.optional(),
  }),
  z.strictObject({ status: z.enum(["forbidden", "invalid"]) }),
]);
const liveProjectionSchema = z.union([
  z.strictObject({ status: z.literal("ok"), revisionId: challengeIdSchema, categories: categoriesSchema }),
  z.strictObject({ status: z.enum(["forbidden", "not_found"]) }),
]);

async function withLearner<T>(read: (client: LearnerClient, learnerId: string) => Promise<T>): Promise<T | ReadFailure | WorkspaceAccessFailure> {
  let client: LearnerClient;
  let caller: Awaited<ReturnType<typeof checkLearnerAccount>>;
  try {
    client = await createClient();
    caller = await checkLearnerAccount(client);
  } catch {
    return { status: "account_service_unavailable" };
  }
  if (caller.status !== "ok") return caller;
  try {
    return await read(client, caller.account.id);
  } catch {
    return unavailable;
  }
}

async function readLiveProjection(client: LearnerClient, challengeId: string) {
  const { data, error } = await client.rpc("read_learner_challenge", { p_challenge_id: challengeId });
  if (error) return unavailable;
  const result = liveProjectionSchema.parse(data);
  if (result.status === "forbidden") {
    // The account may have lost access after the initial application check.
    const caller = await checkLearnerAccount(client);
    if (caller.status !== "ok") return caller;
  }
  return result;
}

export async function readChallengePage(search: URLSearchParams): Promise<CatalogueResult> {
  return withLearner(async (client): Promise<CatalogueResult> => {
    let query;
    try {
      query = parseChallengeListQuery(search);
    } catch {
      return invalid;
    }
    const cursorRevisionId = query.cursor?.revisionId;
    if (query.cursor && !cursorRevisionId) return invalid;

    const { data, error } = await client.rpc("list_learner_challenges", {
      p_limit: query.limit,
      p_language: query.language,
      p_difficulty: query.difficulty,
      p_category: query.category,
      p_before: query.cursor?.publishedAt,
      p_after_id: query.cursor?.challengeId,
    });
    if (error) return unavailable;
    const result = catalogueSchema.parse(data);
    if (result.status !== "ok") return result;
    if (cursorRevisionId && result.anchorRevisionId !== cursorRevisionId.toLowerCase()) return invalid;
    const items = result.items.slice(0, query.limit);
    const last = items.at(-1);
    const nextCursor = last && result.items.length > query.limit
      ? encodeChallengeCursor({
        publishedAt: last.publishedAt, challengeId: last.id, revisionId: last.revisionId,
      }, query)
      : null;
    return { status: "ok", page: { items, nextCursor } };
  });
}

export async function readChallengeWithAccess(id: string, search = new URLSearchParams()): Promise<ChallengeResult> {
  return withLearner(async (client): Promise<ChallengeResult> => {
    let challengeId;
    try {
      challengeId = parseChallengeDetailQuery(id, search);
    } catch {
      return invalid;
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const live = await readLiveProjection(client, challengeId);
      if (live.status !== "ok") return live;
      const { data, error } = await client.from("challenge_revisions")
        .select("id, title, description, language, difficulty, published_at, flawed_code")
        .eq("challenge_id", challengeId).eq("id", live.revisionId).maybeSingle();
      if (error) return unavailable;
      // The pointer can move before the RLS read. Reclassify a vanished
      // revision once, keeping each source and category set tied to its ID.
      if (!data) continue;

      const card = challengeCardSchema.parse({
        id: challengeId, revisionId: data.id, title: data.title, description: data.description,
        language: data.language, difficulty: data.difficulty, categories: live.categories, publishedAt: data.published_at,
      });
      return { status: "ok", challenge: { ...card, code: projectLearnerCode(card.language, data.flawed_code) } };
    }
    return unavailable;
  });
}

export async function readFirstAttemptWithAccess(id: string): Promise<AttemptResult> {
  return withLearner(async (client, learnerId): Promise<AttemptResult> => {
    const challengeId = challengeIdSchema.safeParse(id);
    if (!challengeId.success) return invalid;

    const live = await readLiveProjection(client, challengeId.data);
    if (live.status !== "ok") return live;
    const { data, error } = await client.from("submissions").select("id")
      .eq("learner_id", learnerId).eq("challenge_id", challengeId.data).eq("attempt_number", 1).maybeSingle();
    if (error) return unavailable;
    return { status: "ok", submissionId: data ? challengeIdSchema.parse(data.id) : null };
  });
}

export async function readChallenge(id: string, search = new URLSearchParams()) {
  const result = await readChallengeWithAccess(id, search);
  return isWorkspaceAccessFailure(result) ? genericReadFailure(result) : result;
}

export async function readFirstAttempt(id: string) {
  const result = await readFirstAttemptWithAccess(id);
  return isWorkspaceAccessFailure(result) ? genericReadFailure(result) : result;
}
