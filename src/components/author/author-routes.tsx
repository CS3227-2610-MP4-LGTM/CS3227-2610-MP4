"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import {
  authorChallengesHref, type AuthorDraft, type AuthorReadResult, type DraftPatch, type DraftValues,
} from "@/lib/author/drafts";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { AuthorChallengeDetail } from "./challenge-detail";
import { AuthorChallengeList } from "./challenge-list";
import { createDraft, patchDraft, readChallengePage, readDraft } from "./client";
import { CreateChallengeForm } from "./create-challenge-form";
import { EditDraftForm } from "./edit-draft-form";
import { FlawConfiguration } from "./flaw-configuration";
import { takeDraftSaved } from "./notices";

export function AuthorListRoute() {
  const params = new URLSearchParams(useSearchParams().toString());
  const notices = params.getAll("notice");
  const accountCreated = notices.length === 1 && notices[0] === "account-created";
  if (accountCreated) params.delete("notice");
  return <>
    <p className="eyebrow">Your workspace</p>
    <h1>My challenges</h1>
    {accountCreated && <p className="notice" role="status">Account created.</p>}
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

  const back = <Link href={authorChallengesHref} className="button secondary">Back to challenges</Link>;
  if (!result) return <p role="status" className="loading-shell">Loading challenge…</p>;
  if (isWorkspaceAccessFailure(result)) return null;
  if (result.status === "ok") return children(result.draft);
  if (result.status === "unavailable") return <section className="author-screen">
    <p role="alert" className="notice error-notice">We couldn&apos;t load this challenge. Try again.</p>
    <div className="form-actions">
      <button type="button" className="button primary" onClick={() => void load()}>Try again</button>{back}
    </div>
  </section>;
  return <section className="author-screen">
    <h1>{result.status === "not_found" ? "Challenge not found." : "This challenge isn't available to your account."}</h1>
    <div className="form-actions">{back}</div>
  </section>;
}

function useDraftIo(challengeId: string, accountId?: string) {
  const save = useCallback((patch: DraftPatch) => patchDraft(challengeId, patch, accountId), [challengeId, accountId]);
  const reload = useCallback(() => readDraft(challengeId), [challengeId]);
  return { save, reload };
}

export function ConfigurationRoute({ challengeId, accountId }: { challengeId: string; accountId?: string }) {
  const [notice, setNotice] = useState<string>();
  const { save, reload } = useDraftIo(challengeId, accountId);
  useEffect(() => {
    // Session storage exists only in the browser, so the one-time notice is read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (takeDraftSaved(challengeId)) setNotice("Draft saved.");
  }, [challengeId]);
  return <DraftLoader challengeId={challengeId}>
    {draft => <FlawConfiguration draft={draft} save={save} reload={reload} notice={notice} />}
  </DraftLoader>;
}

export function EditDraftRoute({ challengeId, accountId }: { challengeId: string; accountId?: string }) {
  const { save, reload } = useDraftIo(challengeId, accountId);
  return <DraftLoader challengeId={challengeId}>
    {draft => <EditDraftForm draft={draft} save={save} reload={reload} />}
  </DraftLoader>;
}

export function ChallengeDetailRoute({ challengeId }: { challengeId: string }) {
  const read = useCallback(() => readDraft(challengeId), [challengeId]);
  return <AuthorChallengeDetail challengeId={challengeId} read={read} />;
}
