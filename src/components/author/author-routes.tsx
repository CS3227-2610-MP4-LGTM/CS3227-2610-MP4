"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import {
  authorChallengesHref, proposalsHref, type AuthorDraft, type AuthorReadResult, type DraftPatch, type DraftValues,
  type ExpectedVersions,
} from "@/lib/author/drafts";
import { lifecycleMessages, type LifecycleResult } from "@/lib/author/lifecycle";
import { publicationHref, publicationMessages, type AuthorRevision } from "@/lib/author/publication";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { AuthorChallengeDetail } from "./challenge-detail";
import { AuthorChallengeList } from "./challenge-list";
import {
  archiveChallenge, createDraft, decideProposal, generateProposals, patchDraft, publishChallenge, readChallengePage, readDraft,
  readFinalPreview, readRevision, unpublishChallenge, type RevisionReadResult,
} from "./client";
import { CreateChallengeForm } from "./create-challenge-form";
import { EditDraftForm } from "./edit-draft-form";
import { FlawConfiguration } from "./flaw-configuration";
import {
  rememberLifecycleChange, rememberProposalsGenerated, takeDraftSaved, takeLifecycleChange, takeProposalsGenerated,
} from "./notices";
import { ProposalPreview, type Decide } from "./proposal-preview";
import { PublicationResult } from "./publication-result";
import { PublishedRevision } from "./published-revision";

export function AuthorListRoute() {
  const params = new URLSearchParams(useSearchParams().toString());
  const notices = params.getAll("notice");
  const accountCreated = notices.length === 1 && notices[0] === "account-created";
  if (accountCreated) params.delete("notice");
  const [changed, setChanged] = useState<string | null>(null);
  useEffect(() => {
    // Session storage exists only in the browser, so the one-time notice is read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChanged(takeLifecycleChange());
  }, []);
  const lifecycleNotice = changed === "unpublished" ? lifecycleMessages.unpublished
    : changed === "archived" ? lifecycleMessages.archived : null;
  return <>
    <p className="eyebrow">Your workspace</p>
    <h1>My challenges</h1>
    {accountCreated && <p className="notice" role="status">Account created.</p>}
    <div role="status" aria-live="polite">{lifecycleNotice && <p className="notice">{lifecycleNotice}</p>}</div>
    <AuthorChallengeList search={params.toString()} readPage={readChallengePage}
      navigate={href => window.history.pushState(null, "", href)} />
  </>;
}

export function CreateChallengeRoute({ accountId }: { accountId?: string }) {
  const router = useRouter();
  const create = useCallback((input: DraftValues, key: string) => createDraft(input, key, accountId), [accountId]);
  return <>
    <p className="eyebrow">Your workspace</p>
    <h1>Create challenge</h1>
    <CreateChallengeForm create={create} navigate={href => router.push(href)} />
  </>;
}

/** Loads one own draft before rendering an editor; recovery never replays a save. */
function DraftLoader({ challengeId, children }: { challengeId: string; children: (draft: AuthorDraft) => ReactNode }) {
  const reportAccessFailure = useReportWorkspaceAccessFailure();
  const [result, setResult] = useState<AuthorReadResult>();
  const load = useCallback(async () => {
    setResult(undefined);
    const next = await readDraft(challengeId);
    setResult(next);
    if (isWorkspaceAccessFailure(next)) reportAccessFailure(next.status);
  }, [challengeId, reportAccessFailure]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // Next keeps visited routes mounted but hidden; drop the loaded draft so a
    // hidden editor holds no stale copy and returning rereads current versions.
    return () => setResult(undefined);
  }, [load]);

  if (!result) return <p role="status" className="loading-shell">Loading challenge…</p>;
  if (isWorkspaceAccessFailure(result)) return null;
  if (result.status === "ok") return children(result.draft);
  return <ReadFailure status={result.status} retry={() => void load()}
    message="We couldn't load this challenge. Try again." />;
}

const backToChallenges = <Link href={authorChallengesHref} className="button secondary">Back to challenges</Link>;

/** A failed own-challenge read: retry for an outage, otherwise a not-found or denial page. */
function ReadFailure({ status, retry, message }: { status: string; retry: () => void; message: string }) {
  if (status === "unavailable") return <section className="author-screen">
    <p role="alert" className="notice error-notice">{message}</p>
    <div className="form-actions">
      <button type="button" className="button primary" onClick={retry}>Try again</button>{backToChallenges}
    </div>
  </section>;
  return <section className="author-screen">
    <h1>{status === "not_found" ? "Challenge not found." : "This challenge isn't available to your account."}</h1>
    <div className="form-actions">{backToChallenges}</div>
  </section>;
}

/** Loads one own published revision; a denied or missing revision never shows its content (SYS-12.1). */
function RevisionLoader({ challengeId, revisionId, children }: {
  challengeId: string; revisionId: string | null; children: (revision: AuthorRevision) => ReactNode;
}) {
  const reportAccessFailure = useReportWorkspaceAccessFailure();
  const [result, setResult] = useState<RevisionReadResult>();
  const load = useCallback(async () => {
    setResult(undefined);
    const next: RevisionReadResult = revisionId ? await readRevision(challengeId, revisionId) : { status: "not_found" };
    setResult(next);
    if (isWorkspaceAccessFailure(next)) reportAccessFailure(next.status);
  }, [challengeId, revisionId, reportAccessFailure]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => setResult(undefined);
  }, [load]);

  if (!result) return <p role="status" className="loading-shell">Loading published challenge…</p>;
  if (isWorkspaceAccessFailure(result)) return null;
  if (result.status === "ok") return children(result.revision);
  return <ReadFailure status={result.status} retry={() => void load()} message={publicationMessages.revisionUnavailable} />;
}

function useDraftIo(challengeId: string, accountId?: string) {
  const save = useCallback((patch: DraftPatch) => patchDraft(challengeId, patch, accountId), [challengeId, accountId]);
  const reload = useCallback(() => readDraft(challengeId), [challengeId]);
  const generate = useCallback((versions: ExpectedVersions, key: string) =>
    generateProposals(challengeId, versions, key, accountId), [challengeId, accountId]);
  return { save, reload, generate };
}

/** AUT-03.2: a validated result opens Proposal preview with its arrival announcement. */
function useOpenProposals(challengeId: string) {
  const router = useRouter();
  return useCallback(() => {
    rememberProposalsGenerated(challengeId);
    router.push(proposalsHref(challengeId));
  }, [challengeId, router]);
}

export function ConfigurationRoute({ challengeId, accountId }: { challengeId: string; accountId?: string }) {
  const [notice, setNotice] = useState<string>();
  const { save, reload, generate } = useDraftIo(challengeId, accountId);
  const openProposals = useOpenProposals(challengeId);
  useEffect(() => {
    // Session storage exists only in the browser, so the one-time notice is read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (takeDraftSaved(challengeId)) setNotice("Draft saved.");
  }, [challengeId]);
  return <DraftLoader challengeId={challengeId}>
    {draft => <FlawConfiguration draft={draft} save={save} reload={reload} notice={notice}
      generate={generate} onGenerated={openProposals} />}
  </DraftLoader>;
}

export function EditDraftRoute({ challengeId, accountId }: { challengeId: string; accountId?: string }) {
  const { save, reload } = useDraftIo(challengeId, accountId);
  return <DraftLoader challengeId={challengeId}>
    {draft => <EditDraftForm draft={draft} save={save} reload={reload} />}
  </DraftLoader>;
}

export function ChallengeDetailRoute({ challengeId, accountId }: { challengeId: string; accountId?: string }) {
  const router = useRouter();
  const read = useCallback(() => readDraft(challengeId), [challengeId]);
  const { generate } = useDraftIo(challengeId, accountId);
  const openProposals = useOpenProposals(challengeId);
  const unpublish = useCallback((versions: { expectedRowVersion: number }, key: string) =>
    unpublishChallenge(challengeId, versions, key, accountId), [challengeId, accountId]);
  const archive = useCallback((versions: { expectedRowVersion: number }, key: string) =>
    archiveChallenge(challengeId, versions, key, accountId), [challengeId, accountId]);
  // AUT-06.4/06.5: success returns to “My challenges” with its one-time notice.
  const onLifecycleChanged = useCallback((challenge: LifecycleResult) => {
    rememberLifecycleChange(challenge.status);
    router.push(authorChallengesHref);
  }, [router]);
  return <AuthorChallengeDetail challengeId={challengeId} read={read} generate={generate} onGenerated={openProposals}
    unpublish={unpublish} archive={archive} onLifecycleChanged={onLifecycleChanged} />;
}

export function ProposalsRoute({ challengeId, accountId }: { challengeId: string; accountId?: string }) {
  const [generated, setGenerated] = useState(false);
  const [loads, setLoads] = useState(0);
  const { generate } = useDraftIo(challengeId, accountId);
  const decide: Decide = useCallback((proposalId, body) => decideProposal(challengeId, proposalId, body, accountId),
    [challengeId, accountId]);
  const readPreview = useCallback(() => readFinalPreview(challengeId), [challengeId]);
  const router = useRouter();
  const publish = useCallback((versions: ExpectedVersions, key: string) =>
    publishChallenge(challengeId, versions, key, accountId), [challengeId, accountId]);
  const onPublished = useCallback(() => router.push(publicationHref(challengeId)), [challengeId, router]);
  useEffect(() => {
    // Session storage exists only in the browser, so the one-time announcement is read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (takeProposalsGenerated(challengeId)) setGenerated(true);
  }, [challengeId]);
  // Reload and Refresh remount the loader, which rereads the saved draft and decisions. The arrival
  // announcement is one-shot, so a remount never re-announces a generation that did not happen.
  const reload = useCallback(() => {
    setGenerated(false);
    setLoads(count => count + 1);
  }, []);
  return <DraftLoader key={loads} challengeId={challengeId}>
    {draft => <ProposalPreview draft={draft} generated={generated} decide={decide} readPreview={readPreview}
      reload={reload} generate={generate} publish={publish} onPublished={onPublished} />}
  </DraftLoader>;
}

/** AUT-05.3: “Publication result” for the challenge's current published revision. */
export function PublicationRoute({ challengeId }: { challengeId: string }) {
  return <DraftLoader challengeId={challengeId}>
    {draft => <RevisionLoader challengeId={challengeId} revisionId={draft.publishedRevisionId}>
      {revision => <PublicationResult publication={revision.publication} />}
    </RevisionLoader>}
  </DraftLoader>;
}

/** AUT-05.3: one own published revision with its answer key and hints. */
export function RevisionRoute({ challengeId, revisionId }: { challengeId: string; revisionId: string }) {
  return <RevisionLoader challengeId={challengeId} revisionId={revisionId}>
    {revision => <PublishedRevision revision={revision} />}
  </RevisionLoader>;
}
