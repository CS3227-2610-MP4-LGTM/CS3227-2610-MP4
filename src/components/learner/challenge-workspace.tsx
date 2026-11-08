"use client";

import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { AccessScreen } from "@/components/account/access-screen";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import { CodeDiffView } from "@/components/code-diff";
import { isWorkspaceAccessFailure, type WorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { catalogueHref, type AttemptResult, type ChallengeResult, type ChallengeView, type ReadFailure } from "@/lib/learner/challenges";
import { ChallengeMetadata } from "./challenge-metadata";

type WorkspaceProps = {
  challengeId: string;
  readChallenge: (id: string) => Promise<ChallengeResult>;
  readFirstAttempt: (id: string) => Promise<AttemptResult>;
};
type WorkspaceResult = { status: "ok"; challenge: ChallengeView; submissionId: string | null } | ReadFailure;

export function ChallengeWorkspace(props: WorkspaceProps) {
  return <ReviewWorkspace key={props.challengeId} {...props} />;
}

function ReviewWorkspace({ challengeId, readChallenge, readFirstAttempt }: WorkspaceProps) {
  const [result, setResult] = useState<WorkspaceResult>();
  const [retry, setRetry] = useState(0);
  const reportAccessFailure = useReportWorkspaceAccessFailure();
  const focusHeading = useCallback((heading: HTMLHeadingElement | null) => {
    heading?.focus();
  }, []);

  const load = useEffectEvent(async (id: string): Promise<WorkspaceResult | WorkspaceAccessFailure> => {
    const [materialRead, attemptRead] = await Promise.allSettled([readChallenge(id), readFirstAttempt(id)]);
    const material = materialRead.status === "fulfilled" ? materialRead.value : { status: "unavailable" as const };
    const attempt = attemptRead.status === "fulfilled" ? attemptRead.value : { status: "unavailable" as const };
    if (material.status === "unauthenticated" || attempt.status === "unauthenticated") return { status: "unauthenticated" };
    if (isWorkspaceAccessFailure(material)) return material;
    if (isWorkspaceAccessFailure(attempt)) return attempt;
    if (material.status !== "ok") return material;
    if (attempt.status !== "ok") return attempt;
    return { status: "ok", challenge: material.challenge, submissionId: attempt.submissionId };
  });

  useEffect(() => {
    let active = true;
    const settle = (value: WorkspaceResult | WorkspaceAccessFailure) => {
      if (!active) return;
      if (isWorkspaceAccessFailure(value)) reportAccessFailure(value.status);
      else setResult(value);
    };
    load(challengeId).then(settle, () => settle({ status: "unavailable" }));
    return () => {
      active = false;
      // Cache Components can hide the route instead of unmounting it.
      // Reopening the route should perform a fresh, authorized read.
      setResult(undefined);
    };
  }, [challengeId, reportAccessFailure, retry]);

  if (!result) return <p role="status">Loading challenge…</p>;
  if (result.status === "forbidden") return <AccessScreen kind="record-denied" workspaceHref={catalogueHref} />;

  const backLink = <Link href={catalogueHref}>Back to challenges</Link>;
  if (result.status === "not_found" || result.status === "invalid") {
    return <section className="recovery-card">
      <h1 ref={focusHeading} tabIndex={-1}>Challenge not found</h1>
      <p role="alert">We couldn&apos;t find this challenge.</p>
      {backLink}
    </section>;
  }
  if (result.status !== "ok") {
    return <section>
      <h1 ref={focusHeading} tabIndex={-1}>Challenge</h1>
      <p role="alert">We couldn&apos;t load this challenge. Try again.</p>
      <button type="button" className="button secondary" onClick={() => {
        setResult(undefined);
        setRetry(value => value + 1);
      }}>Try again</button>
    </section>;
  }

  return <article className="challenge-workspace">
    {backLink}
    <header>
      <h1 ref={focusHeading} tabIndex={-1}>{result.challenge.title}</h1>
      <ChallengeMetadata challenge={result.challenge} />
    </header>
    <CodeDiffView code={result.challenge.code} />
    {result.submissionId && <div className="notice">
      <p>You have already submitted a review of this challenge.</p>
      <Link href={`/learner/history/${result.submissionId}`}>View first attempt</Link>
    </div>}
  </article>;
}
