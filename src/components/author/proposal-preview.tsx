"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import { CodeDiffView } from "@/components/code-diff";
import {
  configurationHref, labelFor, proposalMessages, type DraftView, type ExpectedVersions,
} from "@/lib/author/drafts";
import { proposalDiff, type FinalPreview, type ProposalDecision } from "@/lib/author/preview";
import type { CodeDiff, CodeDiffLine } from "@/lib/code-diff";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { categoryLabels } from "@/lib/learner/challenges";
import type { AuthorPublication } from "@/lib/author/publication";
import { GenerateProposals, type Generate } from "./generate-proposals";
import { PublishChallenge, type Publish } from "./publish-challenge";

type ProposalView = {
  id: string; category: string; sourceStartLine: number; sourceEndLine: number; originalSnippet: string;
  replacementSnippet: string; explanation: string; fix: string; decision: ProposalDecision;
};
type Choice = "approved" | "rejected";
export type Decide = (proposalId: string, body: ExpectedVersions & { decision: Choice }) =>
  Promise<{ status: string; draft?: DraftView }>;
export type ReadPreview = () => Promise<{ status: string; preview?: { draftVersion: number } & FinalPreview }>;

const decisionLabels: Record<ProposalDecision, string> = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
type DecisionIssue = { proposalId: string; kind: "failed" | "uncertain" | "conflict" };
type PreviewState = { status: "none" | "loading" | "failed" | "conflict" } | { status: "ok"; preview: FinalPreview };

/** One side of a proposal's edit, shown through the shared diff view (SYS-04.2). */
const side = (diff: CodeDiff, kind: CodeDiffLine["kind"]): CodeDiff =>
  ({ ...diff, hunks: diff.hunks.map(hunk => ({ ...hunk, lines: hunk.lines.filter(line => line.kind === kind) })) });

const range = (label: string, start: number, end: number) =>
  start === end ? `${label} line ${start}` : `${label} lines ${start}–${end}`;

/**
 * AUT-04: “Proposal preview”. Every proposal shows its AI evidence with a saved
 * decision; the final candidate is always read from the server, never assembled
 * here, and any saved decision change invalidates a shown preview.
 */
export function ProposalPreview({
  draft: initial, generated = false, decide, readPreview, reload, generate, publish, onPublished,
}: {
  draft: DraftView;
  generated?: boolean;
  decide: Decide;
  readPreview: ReadPreview;
  reload: () => void;
  generate: Generate;
  /** AUT-05: offered only beside the shown final preview. */
  publish?: Publish;
  onPublished?: (publication: AuthorPublication) => void;
}) {
  const reportAccessFailure = useReportWorkspaceAccessFailure();
  const [draft, setDraft] = useState(initial);
  // Set after mount so the live region exists empty first and the arrival is announced.
  const [notice, setNotice] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [issue, setIssue] = useState<DecisionIssue | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ status: "none" });
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const busy = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const [arrivals, setArrivals] = useState(0);
  // AUT-03.2 and AUT-05.2: generation and publication never run at the same time.
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    // AUT-03.2: arriving after generation announces the result and moves focus to the page heading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (generated) setArrivals(count => count + 1);
  }, [generated]);

  useEffect(() => {
    if (!arrivals) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotice(true);
    pageHeadingRef.current?.focus();
  }, [arrivals]);

  useEffect(() => {
    if (!focusTarget) return;
    document.getElementById(focusTarget)?.focus();
  }, [focusTarget, draft]);

  useEffect(() => {
    if (preview.status === "ok") headingRef.current?.focus();
  }, [preview]);

  const proposals = draft.proposals as ProposalView[];
  const archived = draft.status === "archived";
  const undecided = proposals.some(p => p.decision === "pending");
  const approved = proposals.some(p => p.decision === "approved");
  const back = <Link href={configurationHref(draft.id)} className="button secondary">Back to configuration</Link>;

  async function choose(proposal: ProposalView, decision: Choice) {
    if (busy.current || archived || publishing) return;
    busy.current = true;
    setSaving(proposal.id);
    setIssue(null);
    setNotice(false);
    let result: Awaited<ReturnType<Decide>>;
    try {
      result = await decide(proposal.id, {
        expectedRowVersion: draft.rowVersion, expectedDraftVersion: draft.draftVersion, decision,
      });
    } catch {
      result = { status: "uncertain" };
    }
    busy.current = false;
    setSaving(null);
    setFocusTarget(`decide-${proposal.id}-${decision}`);
    if (result.status === "ok" && result.draft) {
      setDraft(result.draft);
      setPreview({ status: "none" });
    } else if (isWorkspaceAccessFailure(result)) {
      setIssue({ proposalId: proposal.id, kind: "uncertain" });
      reportAccessFailure(result.status);
    } else {
      const kind = result.status === "conflict" ? "conflict" : result.status === "failed" ? "failed" : "uncertain";
      setIssue({ proposalId: proposal.id, kind });
      if (kind !== "failed") setPreview({ status: "none" });
    }
  }

  async function showPreview() {
    if (busy.current || publishing) return;
    busy.current = true;
    setPreview({ status: "loading" });
    let result: Awaited<ReturnType<ReadPreview>>;
    try {
      result = await readPreview();
    } catch {
      result = { status: "unavailable" };
    }
    busy.current = false;
    if (result.status === "ok" && result.preview && result.preview.draftVersion === draft.draftVersion) {
      setPreview({ status: "ok", preview: result.preview });
    } else if (result.status === "ok" && result.preview) {
      // AUT-04.5: the saved draft moved on (for example in another tab); retrying cannot help.
      setPreview({ status: "conflict" });
    } else {
      if (isWorkspaceAccessFailure(result)) reportAccessFailure(result.status);
      setPreview({ status: "failed" });
    }
  }

  function adoptGenerated(next: DraftView) {
    setDraft(next);
    setIssue(null);
    setPreview({ status: "none" });
    setNotice(false);
    setArrivals(count => count + 1);
  }

  const blocked = issue?.kind === "uncertain" || issue?.kind === "conflict";

  return <section className="author-screen" aria-labelledby="proposals-heading">
    <p className="eyebrow">{draft.title}</p>
    <h1 id="proposals-heading" ref={pageHeadingRef} tabIndex={-1}>Proposal preview</h1>
    <div role="status" aria-live="polite" className="pending-status">
      {notice && proposalMessages.generated}
      {saving && proposalMessages.saving}
      {preview.status === "loading" && "Loading preview…"}
    </div>
    {archived && <p className="notice">Archived challenges can&apos;t be edited.</p>}

    {!proposals.length ? <>
      <p className="notice">{proposalMessages.absent}</p>
      <div className="form-actions">{back}</div>
    </> : <>
      <p>AI-generated proposals. Each one awaits your decision before publishing.</p>
      <ol className="proposal-list" aria-label="Proposals">
        {proposals.map((proposal, index) => {
          const pending = saving === proposal.id;
          const problem = issue?.proposalId === proposal.id ? issue.kind : null;
          const diff = proposalDiff(draft.language, proposal);
          return <li key={proposal.id} className="proposal-item" aria-labelledby={`proposal-${proposal.id}`}>
            <h2 id={`proposal-${proposal.id}`}>Proposal {index + 1}: {labelFor(categoryLabels, proposal.category)}</h2>
            <p>{range("Source", proposal.sourceStartLine, proposal.sourceEndLine)} (working code)</p>
            <h3>Original code</h3>
            <CodeDiffView code={side(diff, "removed")} label={`Proposal ${index + 1} original code`} showPath={false} />
            <h3>Replacement code</h3>
            <CodeDiffView code={side(diff, "added")} label={`Proposal ${index + 1} replacement code`} showPath={false} />
            <h3>Explanation</h3>
            <p>{proposal.explanation}</p>
            <h3>Fix</h3>
            <p>{proposal.fix}</p>
            <p className="decision-status">Decision: <strong>{decisionLabels[proposal.decision] ?? proposal.decision}</strong></p>
            {problem === "failed" && <p role="alert" className="notice error-notice">{proposalMessages.decisionFailed}</p>}
            {problem === "uncertain" && <div role="alert" className="notice error-notice">
              <p>{proposalMessages.decisionUncertain}</p>
              <button type="button" className="button secondary" onClick={reload}>Refresh draft</button>
            </div>}
            {problem === "conflict" && <div role="alert" className="notice error-notice">
              <p>{proposalMessages.decisionConflict}</p>
              <button type="button" className="button secondary" onClick={reload}>Reload draft</button>
            </div>}
            {!archived && <div className="form-actions">
              {(["approved", "rejected"] as const).map(choice => <button key={choice} type="button"
                id={`decide-${proposal.id}-${choice}`} className="button secondary" disabled={pending || publishing}
                aria-pressed={proposal.decision === choice} onClick={() => void choose(proposal, choice)}>
                {choice === "approved" ? "Approve" : "Reject"}
              </button>)}
            </div>}
          </li>;
        })}
      </ol>

      {undecided ? <p className="notice">{proposalMessages.undecided}</p>
        : !approved ? <p className="notice">{proposalMessages.noneApproved}</p>
        : <div className="form-actions">
          <button type="button" className="button primary" disabled={blocked || !!saving || publishing || preview.status === "loading"}
            onClick={() => void showPreview()}>Preview final challenge</button>
        </div>}
      {preview.status === "failed" && <div role="alert" className="notice error-notice">
        <p>{proposalMessages.previewFailed}</p>
        <button type="button" className="button secondary" onClick={() => void showPreview()}>Try again</button>
      </div>}
      {preview.status === "conflict" && <div role="alert" className="notice error-notice">
        <p>{proposalMessages.decisionConflict}</p>
        <button type="button" className="button secondary" onClick={reload}>Reload draft</button>
      </div>}
      {!archived && <GenerateProposals draft={draft} generate={generate} onGenerated={adoptGenerated} reload={reload}
        showBack={false} disabled={publishing} onBusyChange={setGenerating} />}
      <div className="form-actions">{back}</div>
    </>}

    {preview.status === "ok" && <section className="final-preview" aria-labelledby="final-preview-heading">
      <h2 id="final-preview-heading" ref={headingRef} tabIndex={-1}>Final challenge preview</h2>
      <p>Working code compared with the flawed code Learners will review.</p>
      <CodeDiffView code={preview.preview.code} />
      <h3>Answer key</h3>
      <ol>
        {preview.preview.flaws.map(flaw => <li key={flaw.proposalId}>
          <p><strong>{labelFor(categoryLabels, flaw.category)}</strong>: {range("Final", flaw.startLine, flaw.endLine)}
            {" "}({range("source", flaw.sourceStartLine, flaw.sourceEndLine)})</p>
          <p>Explanation: {flaw.explanation}</p>
          <p>Fix: {flaw.fix}</p>
        </li>)}
      </ol>
      {publish && onPublished && <PublishChallenge draft={draft} flaws={preview.preview.flaws} publish={publish}
        onPublished={onPublished} reload={reload} disabled={generating} onBusyChange={setPublishing} />}
    </section>}
  </section>;
}
