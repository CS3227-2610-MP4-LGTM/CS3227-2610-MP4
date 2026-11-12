"use client";

import { useRef, useState } from "react";
import { ConfirmationDialog } from "@/components/account/confirmation-dialog";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import type { DraftView } from "@/lib/author/drafts";
import { lifecycleMessages as messages, type LifecycleAction, type LifecycleResult } from "@/lib/author/lifecycle";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";

export type LifecycleOutcome = { status: string; challenge?: LifecycleResult };
export type ChangeLifecycle = (versions: { expectedRowVersion: number }, idempotencyKey: string) => Promise<LifecycleOutcome>;

type Phase =
  | { kind: "idle" } | { kind: "confirming"; action: LifecycleAction } | { kind: "pending"; action: LifecycleAction }
  | { kind: "conflict" } | { kind: "failed"; action: LifecycleAction } | { kind: "uncertain" } | { kind: "stopped" };

const copy = {
  unpublish: {
    label: "Unpublish", title: messages.unpublishTitle, prompt: messages.unpublishPrompt,
    pending: messages.unpublishing, failed: messages.unpublishFailed,
  },
  archive: {
    label: "Archive", title: messages.archiveTitle, prompt: messages.archivePrompt,
    pending: messages.archiving, failed: messages.archiveFailed,
  },
} as const;

/**
 * AUT-06.4–06.6: “Unpublish” for a published challenge and terminal “Archive”
 * for any nonarchived one, each confirmed first. A new attempt uses a new
 * Idempotency-Key; “Refresh challenge” resolves an uncertain one with the same key.
 */
export function LifecycleActions({ draft, unpublish, archive, onChanged, reload }: {
  draft: DraftView;
  unpublish: ChangeLifecycle;
  archive: ChangeLifecycle;
  onChanged: (challenge: LifecycleResult) => void;
  reload: () => void;
}) {
  const reportAccessFailure = useReportWorkspaceAccessFailure();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = useRef(false);
  const attempt = useRef<{ action: LifecycleAction; key: string; versions: { expectedRowVersion: number } } | null>(null);

  if (draft.status === "archived") return null;
  const changes = { unpublish, archive };

  async function run(action: LifecycleAction, key: string, versions: { expectedRowVersion: number }) {
    if (busy.current) return;
    busy.current = true;
    attempt.current = { action, key, versions };
    setPhase({ kind: "pending", action });
    let result: LifecycleOutcome;
    try {
      result = await changes[action](versions, key);
    } catch {
      result = { status: "uncertain" };
    }
    busy.current = false;
    if (result.status === "ok" && result.challenge) {
      attempt.current = null;
      setPhase({ kind: "idle" });
      onChanged(result.challenge);
    } else if (isWorkspaceAccessFailure(result)) {
      // Account recovery belongs to ACC-03; the action is never replayed.
      setPhase({ kind: "stopped" });
      reportAccessFailure(result.status);
    } else if (result.status === "conflict") {
      setPhase({ kind: "conflict" });
    } else if (result.status === "failed") {
      setPhase({ kind: "failed", action });
    } else {
      setPhase({ kind: "uncertain" });
    }
  }

  function confirm(action: LifecycleAction) {
    run(action, crypto.randomUUID(), { expectedRowVersion: draft.rowVersion });
  }

  // An unresolved, stopped or pending change keeps both actions unavailable; only its own recovery continues.
  const locked = phase.kind === "pending" || phase.kind === "uncertain" || phase.kind === "stopped" || phase.kind === "conflict";
  const pending = phase.kind === "pending" ? copy[phase.action].pending : null;
  const actions: LifecycleAction[] = draft.status === "published" ? ["unpublish", "archive"] : ["archive"];
  const descriptionId = `lifecycle-${draft.id}`;

  return <div className="lifecycle-actions">
    <div role="status" aria-live="polite" className="pending-status">{pending}</div>
    {phase.kind === "conflict" && <div role="alert" className="notice error-notice">
      <p>{messages.conflict}</p>
      <button type="button" className="button secondary" onClick={reload}>Reload challenge</button>
    </div>}
    {phase.kind === "failed" && <p role="alert" className="notice error-notice">{copy[phase.action].failed}</p>}
    {phase.kind === "uncertain" && <div role="alert" className="notice error-notice">
      <p>{messages.uncertain}</p>
      <button type="button" className="button secondary"
        onClick={() => attempt.current && void run(attempt.current.action, attempt.current.key, attempt.current.versions)}>
        Refresh challenge
      </button>
    </div>}
    <div className="form-actions">
      {actions.map(action => <button key={action} type="button" className="button secondary" disabled={locked}
        onClick={() => { if (!locked) setPhase({ kind: "confirming", action }); }}>{copy[action].label}</button>)}
    </div>
    {phase.kind === "confirming" && <ConfirmationDialog title={copy[phase.action].title} descriptionId={descriptionId}
      onCancel={() => setPhase({ kind: "idle" })}>
      <p id={descriptionId}>{copy[phase.action].prompt}</p>
      <div className="form-actions">
        <button type="button" className="button primary" onClick={() => confirm(phase.action)}>{copy[phase.action].label}</button>
        <button type="button" className="button secondary" onClick={() => setPhase({ kind: "idle" })}>Cancel</button>
      </div>
    </ConfirmationDialog>}
  </div>;
}
