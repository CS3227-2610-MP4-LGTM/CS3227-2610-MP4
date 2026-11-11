"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import { labelFor, proposalsHref, type DraftView, type ExpectedVersions } from "@/lib/author/drafts";
import type { RevisionFlawPreview } from "@/lib/author/preview";
import { publicationMessages, type AuthorPublication } from "@/lib/author/publication";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { categoryLabels } from "@/lib/learner/challenges";

export type PublishOutcome = { status: string; publication?: AuthorPublication };
export type Publish = (versions: ExpectedVersions, idempotencyKey: string) => Promise<PublishOutcome>;

type Phase =
  | "idle" | "publishing" | "ineligible" | "invalid_output" | "failed" | "limited" | "too_large" | "timeout"
  | "conflict" | "uncertain" | "stopped";

/** AUT-05.4 failures. `retry` offers a new explicit attempt; a timeout must be checked first (AUT-05.5). */
const failures: Partial<Record<Phase, { message: string; retry: boolean }>> = {
  ineligible: { message: publicationMessages.ineligible, retry: false },
  invalid_output: { message: publicationMessages.invalidOutput, retry: true },
  failed: { message: publicationMessages.failed, retry: true },
  limited: { message: publicationMessages.limited, retry: true },
  too_large: { message: publicationMessages.tooLarge, retry: false },
  timeout: { message: publicationMessages.timeout, retry: false },
};

/**
 * AUT-05: the explicit “Publish challenge” action beside the final preview. Each
 * new attempt uses a new Idempotency-Key; “Check publication” resolves the same one.
 */
export function PublishChallenge({ draft, flaws, publish, onPublished, reload, disabled = false, onBusyChange }: {
  draft: DraftView;
  flaws: readonly RevisionFlawPreview[];
  publish: Publish;
  onPublished: (publication: AuthorPublication) => void;
  reload: () => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const reportAccessFailure = useReportWorkspaceAccessFailure();
  const [phase, setPhase] = useState<Phase>("idle");
  // True once “Check publication” has confirmed that a timed-out operation failed.
  const [confirmed, setConfirmed] = useState(false);
  const busy = useRef(false);
  const attempt = useRef<{ key: string; versions: ExpectedVersions } | null>(null);
  const publishing = phase === "publishing";

  useEffect(() => { onBusyChange?.(publishing); }, [publishing, onBusyChange]);

  if (draft.status === "archived") return null;

  async function run(key: string, versions: ExpectedVersions, check = false) {
    if (busy.current) return;
    busy.current = true;
    attempt.current = { key, versions };
    setPhase("publishing");
    let result: PublishOutcome;
    try {
      result = await publish(versions, key);
    } catch {
      result = { status: "uncertain" };
    }
    busy.current = false;
    setConfirmed(check && result.status === "timeout");
    if (result.status === "ok" && result.publication) {
      attempt.current = null;
      setPhase("idle");
      onPublished(result.publication);
    } else if (isWorkspaceAccessFailure(result)) {
      // Account recovery belongs to ACC-03; publication is never replayed.
      setPhase("stopped");
      reportAccessFailure(result.status);
    } else if (result.status in failures || result.status === "conflict" || result.status === "uncertain") {
      setPhase(result.status as Phase);
    } else {
      setPhase("uncertain");
    }
  }

  function start() {
    if (disabled) return;
    run(crypto.randomUUID(), { expectedRowVersion: draft.rowVersion, expectedDraftVersion: draft.draftVersion });
  }

  const check = () => attempt.current && run(attempt.current.key, attempt.current.versions, true);
  const failure = failures[phase];
  const categories = [...new Set(flaws.map(flaw => flaw.category))];
  const headingId = `publish-${draft.id}`;
  const back = <Link href={proposalsHref(draft.id)} className="button secondary">Back to proposal preview</Link>;

  return <section className="proposal-generation" aria-labelledby={headingId}>
    <h3 id={headingId}>Publication</h3>
    <dl className="detail-list">
      <dt>Retained flaws</dt><dd>{flaws.length}</dd>
      <dt>Flaw categories</dt><dd>{categories.map(category => labelFor(categoryLabels, category)).join(", ")}</dd>
    </dl>
    <p>Publishing prepares one hint for each retained flaw. The challenge is not published until this finishes.</p>
    <div role="status" aria-live="polite" className="pending-status">
      {publishing && publicationMessages.publishing}
    </div>
    {failure && <div role="alert" className="notice error-notice">
      <p>{failure.message}</p>
      {phase === "timeout" && !confirmed
        && <button type="button" className="button secondary" onClick={() => void check()}>Check publication</button>}
    </div>}
    {phase === "conflict" && <div role="alert" className="notice error-notice">
      <p>{publicationMessages.changed}</p>
      <button type="button" className="button secondary" onClick={reload}>Reload draft</button>
    </div>}
    {phase === "uncertain" && <div role="alert" className="notice error-notice">
      <p>{publicationMessages.uncertain}</p>
      <button type="button" className="button secondary" onClick={() => void check()}>Check publication</button>
    </div>}
    <div className="form-actions">
      {(phase === "idle" || publishing) && <button type="button" className="button primary" disabled={publishing || disabled}
        onClick={start}>Publish challenge</button>}
      {(failure?.retry || (phase === "timeout" && confirmed))
        && <button type="button" className="button secondary" disabled={disabled} onClick={start}>Try publishing again</button>}
      {failure && back}
    </div>
  </section>;
}
