import { randomUUID } from "node:crypto";
import { insert } from "../domain/fixture";
import { createLearnerBrowseFixture } from "../domain/learner-browse-fixture";

type Scope = "author" | "author-e2e";
type Draft = {
  title: string;
  description: string;
  language: "python" | "java" | "javascript" | "typescript";
  difficulty: "easy" | "medium" | "hard";
  working_code: string;
  flaw_count: number;
  categories: string[];
};

/**
 * Extends the shared Learner browse fixture with one working draft per seeded
 * challenge, plus an archived Author A challenge. Author-created rows, revisions
 * published through the API and any private request ledger rows for these
 * identities are removed on dispose.
 */
export async function createAuthorFixture(scope: Scope) {
  const base = await createLearnerBrowseFixture({ scope, pageSize: 0 });
  const { h, ids, actors, checkout, quotient } = base;
  const prefix = scope === "author" ? "81a00000" : "81b00000";
  const id = (n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const archivedA = id(8105);
  const userIds = Object.values(actors).map(actor => actor.id);
  // Revisions the base fixture seeded; any other revision of these Authors was published through the API.
  const { rows: seededRevisions } = await h.db.query<{ id: string }>(`select r.id from public.challenge_revisions r
    join public.challenges c on c.id = r.challenge_id where c.author_id = any($1::uuid[])`, [userIds]);
  const seededRevisionIds = seededRevisions.map(row => row.id);

  const checkoutDraft = (title: string, difficulty: Draft["difficulty"] = "easy"): Draft => ({
    title, description: checkout.description, language: "javascript", difficulty,
    working_code: checkout.source, flaw_count: 2, categories: ["logic_bug", "edge_case"],
  });
  const quotientDraft = (title: string, language: Draft["language"] = "python"): Draft => ({
    title, description: quotient.description, language, difficulty: "medium",
    working_code: quotient.source, flaw_count: 1, categories: ["error_handling"],
  });
  const drafts: Record<string, Draft> = {
    [ids.c1]: checkoutDraft("Checkout totals working draft"),
    [ids.draft]: checkoutDraft("Draft checkout"),
    [ids.unpublished]: checkoutDraft("Unpublished checkout"),
    [ids.differentDifficulty]: checkoutDraft("Hard checkout", "hard"),
    [ids.differentCategory]: checkoutDraft("Category checkout"),
    [archivedA]: checkoutDraft("Archived checkout"),
    [ids.c2]: quotientDraft("Safe quotient working draft"),
    [ids.archived]: quotientDraft("Archived quotient"),
    [ids.differentLanguage]: quotientDraft("Python filter working draft"),
  };

  async function dispose() {
    try {
      await h.db.query("begin");
      try {
        // Bypass immutable-row triggers and fixture FKs only inside this cleanup transaction.
        await h.db.query("set local session_replication_role = replica");
        const { rows: ledgers } = await h.db.query<{ table_name: string; column_name: string }>(`
          select table_name, column_name from information_schema.columns
          where table_schema = 'private' and column_name in ('actor_id', 'author_id')
        `);
        for (const { table_name, column_name } of ledgers) {
          await h.db.query(`delete from private.${JSON.stringify(table_name)} where ${JSON.stringify(column_name)}::text = any($1::text[])`, [userIds]);
        }
        // Remove Author material these identities own, including rows created through the API.
        // Rows the base fixture tracks are deleted again by base.dispose(), which is then a no-op.
        const owned = "select id from public.challenges where author_id = any($1::uuid[])";
        const sets = `select id from public.proposal_sets where challenge_id in (${owned})`;
        const proposals = `select id from public.proposals where proposal_set_id in (${sets})`;
        // Remove revisions published through the API (T-22), with their answers, flaws and hints.
        const publishedRevisions = `select id from public.challenge_revisions where challenge_id in (${owned})
          and id <> all($2::uuid[])`;
        for (const [table, column] of [["flaw_hints", "revision_id"], ["revision_flaws", "revision_id"],
          ["revision_answers", "revision_id"], ["challenge_revisions", "id"]]) {
          await h.db.query(`delete from public.${table} where ${column} in (${publishedRevisions})`, [userIds, seededRevisionIds]);
        }
        await h.db.query(`delete from public.proposal_decisions where proposal_id in (${proposals})`, [userIds]);
        await h.db.query(`delete from public.proposals where id in (${proposals})`, [userIds]);
        await h.db.query(`delete from public.challenge_drafts where challenge_id in (${owned})`, [userIds]);
        await h.db.query(`delete from public.proposal_sets where challenge_id in (${owned})`, [userIds]);
        await h.db.query(`delete from public.challenges where author_id = any($1::uuid[])
          and id not in (select challenge_id from public.challenge_revisions)`, [userIds]);
        await h.db.query("commit");
      } catch (error) {
        await h.db.query("rollback");
        throw error;
      }
    } finally {
      await base.dispose();
    }
  }

  try {
    await insert(h.db, "public.challenges", {
      id: archivedA, author_id: actors.authorA.id, status: "archived",
      created_at: "2026-01-01T00:00:02Z", updated_at: "2026-01-01T00:00:02Z",
    });
    for (const [challengeId, values] of Object.entries(drafts)) {
      await insert(h.db, "public.challenge_drafts", { challenge_id: challengeId, ...values });
    }
  } catch (error) {
    await dispose();
    throw error;
  }

  /** Installs a validated one-proposal active set on a draft, as T-21 generation would. */
  async function activateProposalSet(challengeId: string) {
    const { rows: [current] } = await h.db.query<{
      title: string; description: string; language: string; difficulty: string;
      working_code: string; flaw_count: number; categories: string[]; draft_version: number;
    }>(`select title, description, language::text, difficulty::text, working_code, flaw_count,
        categories::text[] as categories, draft_version from public.challenge_drafts where challenge_id = $1`, [challengeId]);
    const setId = randomUUID();
    const proposalId = randomUUID();
    const line = current.working_code.split("\n")[0];
    await insert(h.db, "public.proposal_sets", {
      id: setId, challenge_id: challengeId, source_draft_version: current.draft_version,
      input_snapshot: JSON.stringify({
        title: current.title, description: current.description, language: current.language,
        difficulty: current.difficulty, workingCode: current.working_code, flawCount: current.flaw_count,
        categories: current.categories,
      }),
    });
    await insert(h.db, "public.proposals", {
      id: proposalId, proposal_set_id: setId, category: current.categories[0],
      original_snippet: line, replacement_snippet: `${line} // changed`,
      source_start_line: 1, source_end_line: 1,
      explanation: "Fixture proposal explanation.", fix: "Fixture proposal fix.",
    });
    await insert(h.db, "public.proposal_decisions", { proposal_id: proposalId, decision: "pending" });
    await h.db.query(`update public.challenge_drafts set generation_id = $2, draft_version = draft_version + 1
      where challenge_id = $1`, [challengeId, setId]);
    await h.db.query("update public.challenges set row_version = row_version + 1 where id = $1", [challengeId]);
    return { setId, proposalId };
  }

  return { ...base, ids: { ...base.ids, archivedA }, drafts, activateProposalSet, dispose };
}
