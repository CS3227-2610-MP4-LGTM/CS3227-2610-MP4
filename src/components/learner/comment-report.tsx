"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { reportErrorMessages, reportOutcomeMessages, reportReasonError, reportReasonLimit, type ReportFlag } from "@/lib/learner/reports";
import type { SubmissionView } from "@/lib/learner/submissions";
import { sendReport, type ReportRequest } from "./client-reports";

const copy = {
  action: "Report unmatched comment",
  instructions: "Explain why this comment identifies an issue missing from the answer key. Reporting does not change your grade.",
  help: `Up to ${reportReasonLimit.toLocaleString("en-US")} characters.`,
} as const;

type Phase = "editing" | "sending" | "uncertain" | "checking";
type Active = { commentId: string; phase: Phase; text: string; error?: string; request?: ReportRequest };
type Notice = { text: string; action?: "back" | "refresh" };
type Comment = SubmissionView["comments"][number];

const actionId = (commentId: string) => `report-action-${commentId}`;
const reportedId = (commentId: string) => `reported-${commentId}`;
const reasonId = (commentId: string) => `report-reason-${commentId}`;

export function useCommentReports({ submission, refresh, onFlag, onDenied }: {
  submission: SubmissionView | undefined;
  refresh: () => unknown;
  onFlag: (flag: ReportFlag) => void;
  onDenied: (response: Response) => void;
}) {
  const [active, setActive] = useState<Active>();
  const [notice, setNotice] = useState<Notice>();
  // Every focus request accompanies a state change, so the next commit applies it.
  const focusTarget = useRef<string | undefined>(undefined);
  const setFocus = (id: string) => { focusTarget.current = id; };
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const grading = submission?.grading;
  const unmatched = new Set(grading?.state === "completed" ? grading.original.unmatchedCommentIds : []);
  const reported = new Set((submission?.flags ?? []).filter(flag => flag.kind === "learner_report").map(flag => flag.commentId));
  // Only one report may be pending or unconfirmed; no different report is sent meanwhile.
  const locked = active !== undefined && active.phase !== "editing";

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const id = focusTarget.current;
    if (!id) return;
    focusTarget.current = undefined;
    document.getElementById(id)?.focus();
  });

  async function run(request: ReportRequest, checking: boolean) {
    if (inFlight.current || !submission) return;
    inFlight.current = true;
    setActive(current => current && { ...current, phase: checking ? "checking" : "sending", error: undefined, request });
    try {
      const outcome = await sendReport(submission.id, request);
      if (!mounted.current) return;
      const unconfirmed = (text: string) => {
        setActive(current => current && { ...current, phase: "uncertain" });
        setNotice({ text });
      };
      const restore = (text: string, error?: string) => {
        setActive(current => current && { ...current, phase: "editing", request: undefined, error });
        setNotice({ text });
        if (error) setFocus(reasonId(request.payload.commentId));
      };
      switch (outcome.status) {
        case "ok":
          onFlag(outcome.flag);
          setActive(undefined);
          setNotice({ text: reportOutcomeMessages.sent });
          setFocus(reportedId(request.payload.commentId));
          break;
        case "uncertain": unconfirmed(reportOutcomeMessages.uncertain); break;
        case "in_progress": unconfirmed(reportErrorMessages.inProgress); break;
        case "throttled":
          if (checking) unconfirmed(reportOutcomeMessages.rateLimited);
          else restore(reportOutcomeMessages.rateLimited);
          break;
        case "rejected": restore(outcome.message, outcome.fieldError); break;
        case "duplicate":
          setActive(undefined);
          setNotice({ text: reportErrorMessages.alreadyReported });
          void refresh();
          break;
        case "unavailable":
          setActive(undefined);
          setNotice({ text: reportErrorMessages.ineligible, action: "back" });
          break;
        case "conflict":
          setActive(undefined);
          setNotice({ text: reportOutcomeMessages.conflict, action: "refresh" });
          break;
        case "denied":
          setActive(undefined);
          setNotice(undefined);
          onDenied(outcome.response);
      }
    } finally {
      inFlight.current = false;
    }
  }

  function open(commentId: string) {
    if (locked) return;
    setNotice(undefined);
    setActive({ commentId, phase: "editing", text: "" });
    setFocus(reasonId(commentId));
  }

  function cancel() {
    if (!active || active.phase !== "editing") return;
    setFocus(actionId(active.commentId));
    setActive(undefined);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!active || active.phase !== "editing" || !submission) return;
    const error = reportReasonError(active.text);
    if (error) {
      setActive({ ...active, error });
      setFocus(reasonId(active.commentId));
      return;
    }
    // Each explicit send is a new request; only "Check report" reuses a key.
    void run({
      key: crypto.randomUUID(),
      payload: { commentId: active.commentId, reason: active.text.trim() },
      accountId: submission.learner.id,
    }, false);
  }

  function check() {
    if (active?.phase === "uncertain" && active.request) void run(active.request, true);
  }

  function reload() {
    setNotice(undefined);
    void refresh();
  }

  return {
    active, notice, locked, unmatched, reported, open, cancel, submit, check, reload,
    edit: (text: string) => setActive(current => current && current.phase === "editing" ? { ...current, text } : current),
  };
}

type Reports = ReturnType<typeof useCommentReports>;

export function ReportNotice({ reports }: { reports: Reports }) {
  const { notice, reload } = reports;
  return <div role="status">
    {notice && <p>{notice.text}</p>}
    {notice?.action && <button type="button" className="button secondary" onClick={reload}>
      {notice.action === "back" ? "Back to result" : "Refresh result"}
    </button>}
  </div>;
}

export function ReportControl({ comment, reports }: { comment: Comment; reports: Reports }) {
  const { active, locked, unmatched, reported } = reports;
  if (reported.has(comment.id)) return <p id={reportedId(comment.id)} tabIndex={-1}>Reported</p>;
  if (!unmatched.has(comment.id)) return null;
  if (active?.commentId === comment.id) return <ReportForm comment={comment} active={active} reports={reports} />;
  if (locked) return null;
  return <button type="button" id={actionId(comment.id)} className="button secondary"
    onClick={() => reports.open(comment.id)}>{copy.action}</button>;
}

function ReportForm({ comment, active, reports }: { comment: Comment; active: Active; reports: Reports }) {
  const ids = { heading: `report-heading-${comment.id}`, help: `report-help-${comment.id}`, error: `report-error-${comment.id}` };
  const editing = active.phase === "editing";
  const sending = active.phase === "sending";
  return <form className="review-comment" aria-labelledby={ids.heading} noValidate onSubmit={reports.submit}>
    <h3 id={ids.heading}>{copy.action}</h3>
    <p>{copy.instructions}</p>
    <div>
      <p className="field-help">Line {comment.line}</p>
      <p className="review-comment-body">{comment.body}</p>
    </div>
    <label htmlFor={reasonId(comment.id)}>Reason</label>
    <p id={ids.help} className="field-help">{copy.help}</p>
    <textarea id={reasonId(comment.id)} required aria-required="true" value={active.text} readOnly={!editing}
      aria-invalid={active.error ? "true" : undefined}
      aria-describedby={active.error ? `${ids.help} ${ids.error}` : ids.help}
      onChange={event => reports.edit(event.target.value)} />
    {active.error && <p id={ids.error} className="field-error">{active.error}</p>}
    {editing || sending ? <>
      <button type="submit" className="button" disabled={sending}>{sending ? "Sending report…" : "Send report"}</button>
      <button type="button" className="button secondary" disabled={sending} onClick={reports.cancel}>Cancel</button>
    </> : <button type="button" className="button" disabled={active.phase === "checking"} onClick={reports.check}>
      {active.phase === "checking" ? "Checking report…" : "Check report"}
    </button>}
  </form>;
}
