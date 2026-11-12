"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import { CodeDiffView } from "@/components/code-diff";
import {
  authorChallengesHref, editDraftHref, labelFor, proposalsHref, statusLabels, type DraftReadOutcome, type DraftView,
} from "@/lib/author/drafts";
import type { LifecycleResult } from "@/lib/author/lifecycle";
import { revisionHref } from "@/lib/author/publication";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { projectNewFile } from "@/lib/code-projection";
import { categoryLabels, difficultyLabels, languageLabels, type Language } from "@/lib/learner/challenges";
import { GenerateProposals, type Generate } from "./generate-proposals";
import { LifecycleActions, type ChangeLifecycle } from "./lifecycle-actions";

export function AuthorChallengeDetail({
  challengeId, read, generate, onGenerated, unpublish, archive, onLifecycleChanged,
}: {
  challengeId: string;
  read: () => Promise<DraftReadOutcome>;
  generate?: Generate;
  onGenerated?: (draft: DraftView) => void;
  /** AUT-06.4–06.6: lifecycle actions; the route returns to “My challenges” on success. */
  unpublish?: ChangeLifecycle;
  archive?: ChangeLifecycle;
  onLifecycleChanged?: (challenge: LifecycleResult) => void;
}) {
  const reportAccessFailure = useReportWorkspaceAccessFailure();
  const [result, setResult] = useState<DraftReadOutcome>();

  const load = useCallback(async () => {
    setResult(undefined);
    let next: DraftReadOutcome;
    try {
      next = await read();
    } catch {
      next = { status: "unavailable" };
    }
    setResult(next);
    if (isWorkspaceAccessFailure(next)) reportAccessFailure(next.status);
  }, [read, reportAccessFailure]);

  useEffect(() => {
    // Loading starts the read; its result arrives asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // A hidden (Activity) route keeps no stale copy; showing it again rereads.
    return () => setResult(undefined);
  }, [load, challengeId]);

  const back = <Link href={authorChallengesHref} className="button secondary">Back to challenges</Link>;
  if (!result) return <p role="status" className="loading-shell">Loading challenge…</p>;
  if (isWorkspaceAccessFailure(result)) return null;
  const draft = result.status === "ok" ? result.draft : undefined;
  if (!draft) {
    if (result.status === "not_found") return <section className="author-screen">
      <h1>Challenge not found.</h1><div className="form-actions">{back}</div>
    </section>;
    if (result.status === "forbidden") return <section className="author-screen">
      <h1>This challenge isn&apos;t available to your account.</h1><div className="form-actions">{back}</div>
    </section>;
    return <section className="author-screen">
      <p role="alert" className="notice error-notice">We couldn&apos;t load this challenge. Try again.</p>
      <div className="form-actions">
        <button type="button" className="button primary" onClick={() => void load()}>Try again</button>{back}
      </div>
    </section>;
  }

  const archived = draft.status === "archived";
  return <section className="author-screen" aria-labelledby="detail-heading">
    <p className="eyebrow">Challenge</p>
    <h1 id="detail-heading">{draft.title}</h1>
    <dl className="challenge-metadata">
      <dt>Status</dt><dd>{labelFor(statusLabels, draft.status)}</dd>
      <dt>Published revision</dt>
      <dd>{draft.publishedRevisionId
        ? "A published revision is live. Edits change only the working draft until a new revision is published."
        : "Not published yet."}</dd>
      <dt>Description</dt><dd>{draft.description}</dd>
      <dt>Language</dt><dd>{labelFor(languageLabels, draft.language)}</dd>
      <dt>Difficulty</dt><dd>{labelFor(difficultyLabels, draft.difficulty)}</dd>
      <dt>Flaw count</dt><dd>{draft.flawCount}</dd>
      <dt>Flaw categories</dt><dd>{draft.categories.map(category => labelFor(categoryLabels, category)).join(", ")}</dd>
    </dl>
    {archived && <p className="notice">Archived challenges can&apos;t be edited.</p>}
    <div className="form-actions">
      {!archived && <Link href={editDraftHref(draft.id)} className="button primary">Edit draft</Link>}
      {draft.proposals.length > 0 && <Link href={proposalsHref(draft.id)} className="button secondary">Proposal preview</Link>}
      {draft.publishedRevisionId && <Link href={revisionHref(draft.id, draft.publishedRevisionId)} className="button secondary">
        View published challenge
      </Link>}
      {back}
    </div>
    {unpublish && archive && onLifecycleChanged && <LifecycleActions draft={draft} unpublish={unpublish} archive={archive}
      onChanged={onLifecycleChanged} reload={() => void load()} />}
    {generate && onGenerated && <GenerateProposals draft={draft} generate={generate} onGenerated={onGenerated}
      reload={() => void load()} />}
    <section aria-labelledby="working-code-heading">
      <h2 id="working-code-heading">Working draft code</h2>
      <CodeDiffView code={projectNewFile(draft.language as Language, draft.workingCode)} />
    </section>
  </section>;
}
