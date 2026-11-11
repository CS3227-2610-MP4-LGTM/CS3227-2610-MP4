"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ConfirmationDialog } from "@/components/account/confirmation-dialog";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import {
  configurationHref, labelFor, proposalMessages, type DraftView, type ExpectedVersions,
} from "@/lib/author/drafts";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { categoryLabels, difficultyLabels } from "@/lib/learner/challenges";

export type GenerateOutcome = { status: string; draft?: DraftView };
export type Generate = (versions: ExpectedVersions, idempotencyKey: string) => Promise<GenerateOutcome>;

type Phase =
  | "idle" | "unsaved" | "confirming" | "generating" | "invalid_output" | "limited" | "too_large" | "timeout"
  | "failed" | "conflict" | "uncertain" | "stopped";

const failures: Partial<Record<Phase, { message: string; retry: boolean }>> = {
  invalid_output: { message: proposalMessages.invalidOutput, retry: true },
  limited: { message: proposalMessages.limited, retry: false },
  too_large: { message: proposalMessages.tooLarge, retry: false },
  timeout: { message: proposalMessages.timeout, retry: true },
  failed: { message: proposalMessages.failed, retry: true },
};
const replaceWarningId = "replace-proposals-warning";

/**
 * AUT-03: the explicit “Generate proposals” action for a saved draft. Each new
 * attempt uses a new Idempotency-Key; “Check generation” resolves the same one.
 */
export function GenerateProposals({
  draft, unsaved = false, generate, onGenerated, reload, showBack = true, disabled = false, onBusyChange,
}: {
  draft: DraftView;
  unsaved?: boolean;
  generate: Generate;
  onGenerated: (draft: DraftView) => void;
  reload: () => void;
  showBack?: boolean;
  /** AUT-05.2: generation is unavailable while a publication is pending. */
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const reportAccessFailure = useReportWorkspaceAccessFailure();
  const [phase, setPhase] = useState<Phase>("idle");
  const busy = useRef(false);
  const attempt = useRef<{ key: string; versions: ExpectedVersions } | null>(null);
  const pending = phase === "generating";

  useEffect(() => { onBusyChange?.(pending); }, [pending, onBusyChange]);

  if (draft.status === "archived") return null;

  async function run(key: string, versions: ExpectedVersions) {
    if (busy.current) return;
    busy.current = true;
    attempt.current = { key, versions };
    setPhase("generating");
    let result: GenerateOutcome;
    try {
      result = await generate(versions, key);
    } catch {
      result = { status: "uncertain" };
    }
    busy.current = false;
    if (result.status === "ok" && result.draft) {
      attempt.current = null;
      setPhase("idle");
      onGenerated(result.draft);
    } else if (isWorkspaceAccessFailure(result)) {
      // Account recovery belongs to ACC-03; generation is never replayed.
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

  function request() {
    if (busy.current || disabled) return;
    if (unsaved) return setPhase("unsaved");
    if (draft.proposals.length || draft.generationId) return setPhase("confirming");
    start();
  }

  const failure = failures[phase];
  const generating = phase === "generating";
  const back = showBack && <Link href={configurationHref(draft.id)} className="button secondary">Back to configuration</Link>;

  return <section className="proposal-generation" aria-labelledby={`generate-${draft.id}`}>
    <h2 id={`generate-${draft.id}`}>AI flaw proposals</h2>
    <dl className="challenge-metadata">
      <dt>Flaw count</dt><dd>{draft.flawCount}</dd>
      <dt>Flaw categories</dt><dd>{draft.categories.map(category => labelFor(categoryLabels, category)).join(", ")}</dd>
      <dt>Difficulty</dt><dd>{labelFor(difficultyLabels, draft.difficulty)}</dd>
    </dl>
    <div role="status" aria-live="polite" className="pending-status">
      {generating && proposalMessages.generating}
    </div>
    {phase === "unsaved" && <p role="alert" className="notice error-notice">{proposalMessages.unsaved}</p>}
    {failure && <p role="alert" className="notice error-notice">{failure.message}</p>}
    {phase === "conflict" && <div role="alert" className="notice error-notice">
      <p>{proposalMessages.changed}</p>
      <button type="button" className="button secondary" onClick={reload}>Reload draft</button>
    </div>}
    {phase === "uncertain" && <div role="alert" className="notice error-notice">
      <p>{proposalMessages.uncertain}</p>
      <button type="button" className="button secondary"
        onClick={() => attempt.current && run(attempt.current.key, attempt.current.versions)}>Check generation</button>
    </div>}
    <div className="form-actions">
      <button type="button" className="button primary" disabled={generating || disabled}
        aria-disabled={generating || disabled} onClick={request}>Generate proposals</button>
      {/* A new attempt reads the draft's current versions; only “Check generation” reuses the stored ones. */}
      {failure?.retry && <button type="button" className="button secondary" disabled={disabled}
        onClick={start}>Try again</button>}
      {back}
    </div>
    {phase === "confirming" && <ConfirmationDialog title="Replace the current proposals?" descriptionId={replaceWarningId}
      onCancel={() => setPhase("idle")}>
      <p id={replaceWarningId}>{proposalMessages.replace}</p>
      <div className="form-actions">
        <button type="button" className="button primary" onClick={start}>Generate new proposals</button>
        <button type="button" className="button secondary" onClick={() => setPhase("idle")}>Cancel</button>
      </div>
    </ConfirmationDialog>}
  </section>;
}
