"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { ConfirmationDialog } from "@/components/account/confirmation-dialog";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import { useWorkspaceNavigation, WorkspaceLink } from "@/components/account/workspace-navigation";
import { CodeDiffView } from "@/components/code-diff";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { catalogueHref, type ChallengeView } from "@/lib/learner/challenges";
import {
  commentError, commentLimit, commentTextLimit, historyHref, submissionErrorMessages, submissionOutcomeMessages,
} from "@/lib/learner/submissions";
import { sendReview, type FrozenReview, type SubmissionOutcome } from "./client-submissions";

type Draft = { id: number; line: number; body: string };
type Editor = { id: number | null; line: number; body: string; error?: string };
type SubmitState =
  | { kind: "ready" | "confirm" | "conflict" | "submitted" }
  | { kind: "sending"; checking: boolean }
  | { kind: "uncertain"; request: FrozenReview; inProgress: boolean };
type Rejection = Extract<SubmissionOutcome, { status: "rejected" }>;

export function ReviewDraft({ accountId, challenge, openSubmission, previousSubmissionId, initialComments }: {
  accountId?: string;
  challenge: ChallengeView;
  openSubmission: (href: string) => void;
  previousSubmissionId?: string;
  initialComments?: readonly { line: number; body: string }[];
}) {
  const [baseline] = useState<Draft[]>(() =>
    initialComments?.map(({ line, body }, id) => ({ id, line, body })) ?? []);
  const [comments, setComments] = useState(baseline);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [state, setState] = useState<SubmitState>({ kind: "ready" });
  const [rejection, setRejection] = useState<Rejection>();
  const [announcement, setAnnouncement] = useState("");
  const editorId = useId();
  const editorField = useRef<HTMLTextAreaElement>(null);
  const submitAction = useRef<HTMLButtonElement>(null);
  const focusSubmit = useRef(false);
  const lineActions = useRef(new Map<number, HTMLButtonElement>());
  const editActions = useRef(new Map<number, HTMLButtonElement>());
  const returnFocus = useRef<{ line: number; commentId?: number }>(null);
  const nextId = useRef(baseline.length);
  const activeRequest = useRef<FrozenReview | null>(null);
  const reportAccessFailure = useReportWorkspaceAccessFailure();
  const { clearProtection, protectDraft } = useWorkspaceNavigation();
  const dirty = state.kind !== "submitted" && (comments.length > 0 || Boolean(editor?.body) || baseline.length > 0);

  const discard = useCallback(() => {
    activeRequest.current = null;
    nextId.current = baseline.length;
    returnFocus.current = null;
    focusSubmit.current = false;
    // A cached route can show this draft again. Its guard reconnects on re-entry.
    setComments(baseline);
    setEditor(null);
    setRejection(undefined);
    setAnnouncement("");
    setState({ kind: "ready" });
  }, [baseline]);

  useLayoutEffect(() => {
    if (dirty) return protectDraft(discard);
  }, [dirty, discard, protectDraft]);

  useLayoutEffect(() => () => { activeRequest.current = null; }, []);

  useLayoutEffect(() => {
    if (returnFocus.current) {
      const { line, commentId } = returnFocus.current;
      const action = commentId === undefined ? lineActions.current.get(line) : editActions.current.get(commentId);
      action?.focus();
      returnFocus.current = null;
    }
  }, [comments, editor]);

  useLayoutEffect(() => {
    if (state.kind === "ready" && focusSubmit.current) {
      focusSubmit.current = false;
      submitAction.current?.focus();
    }
  }, [state.kind]);

  const focusEditor = useCallback((field: HTMLTextAreaElement | null) => {
    editorField.current = field;
    field?.focus();
  }, []);

  function closeEditor(commentId?: number) {
    if (!editor) return;
    returnFocus.current = { line: editor.line, commentId: commentId ?? editor.id ?? undefined };
    setEditor(null);
  }

  function saveComment() {
    if (!editor) return;
    const error = commentError(editor.body);
    if (error) {
      setEditor({ ...editor, error });
      return;
    }
    const body = editor.body.trim();
    if (editor.id === null) {
      const comment = { id: nextId.current++, line: editor.line, body };
      setComments(previous => [...previous, comment].sort((left, right) => left.line - right.line || left.id - right.id));
      setAnnouncement(`Comment added on line ${editor.line}.`);
      closeEditor(comments.length + 1 === commentLimit ? comment.id : undefined);
    } else {
      setComments(previous => previous.map(comment => comment.id === editor.id ? { ...comment, body } : comment));
      setAnnouncement(`Comment saved on line ${editor.line}.`);
      closeEditor();
    }
  }

  function removeComment(comment: Draft) {
    returnFocus.current = { line: comment.line };
    setComments(previous => previous.filter(entry => entry.id !== comment.id));
    setAnnouncement(`Comment removed from line ${comment.line}.`);
  }

  function requestConfirmation() {
    if (editor) {
      setAnnouncement("Add or save your comment, or cancel editing, before submitting.");
      editorField.current?.focus();
      return;
    }
    setAnnouncement("");
    setRejection(undefined);
    setState({ kind: "confirm" });
  }

  function cancelConfirmation() {
    if (state.kind !== "confirm") return;
    focusSubmit.current = true;
    setState({ kind: "ready" });
  }

  async function submit(request: FrozenReview, checking: boolean) {
    if (activeRequest.current) return;
    activeRequest.current = request;
    setState({ kind: "sending", checking });
    const outcome = await sendReview(challenge.id, request, checking);
    if (activeRequest.current !== request) return;
    activeRequest.current = null;

    if (isWorkspaceAccessFailure(outcome)) {
      clearProtection();
      discard();
      reportAccessFailure(outcome.status);
    } else if (outcome.status === "ok") {
      clearProtection();
      setState({ kind: "submitted" });
      openSubmission(`${historyHref}/${outcome.id}`);
    } else if (outcome.status === "rejected") {
      setState({ kind: "ready" });
      setRejection(outcome);
    } else if (outcome.status === "conflict") {
      setState({ kind: "conflict" });
    } else {
      setState({ kind: "uncertain", request, inProgress: outcome.status === "in_progress" });
    }
  }

  const confirming = state.kind === "confirm" || (state.kind === "sending" && !state.checking);
  const checking = state.kind === "sending" && state.checking;
  const locked = state.kind !== "ready";
  const atLimit = comments.length >= commentLimit;
  const byLine = new Map<number, Draft[]>();
  for (const comment of comments) {
    const line = byLine.get(comment.line);
    if (line) line.push(comment);
    else byLine.set(comment.line, [comment]);
  }

  return <>
    <p>Comments are saved only on this page until you submit. Reloading or leaving will discard them.</p>
    <p className="field-help" id={`${editorId}-limits`}>
      Up to {commentLimit} comments, with up to {commentTextLimit.toLocaleString("en-US")} characters per comment.
    </p>
    {atLimit && <p role="status">Comment limit reached. Remove a comment to add another.</p>}
    {announcement && <p role="status">{announcement}</p>}
    <CodeDiffView code={challenge.code} gutterControl={line => line.newLine === null ? null :
        <button type="button" className="review-add-comment" aria-label={`Add comment on line ${line.newLine}`}
          ref={button => {
            if (button) lineActions.current.set(line.newLine, button);
            else lineActions.current.delete(line.newLine);
          }}
          disabled={locked || editor !== null || atLimit}
          onClick={() => { setAnnouncement(""); setEditor({ id: null, line: line.newLine, body: "" }); }}><span aria-hidden="true">+</span></button>
    } afterLine={line => line.newLine === null || (!byLine.has(line.newLine) && editor?.line !== line.newLine) ? null :
      <div className="review-line">
        {byLine.get(line.newLine)?.map(comment =>
          <div className="review-comment" key={comment.id}>
            <p className="field-help">Line {comment.line}</p>
            <p className="review-comment-body">{comment.body}</p>
            <div className="review-actions">
              <button type="button" className="button secondary" aria-label={`Edit comment on line ${comment.line}`}
                ref={button => {
                  if (button) editActions.current.set(comment.id, button);
                  else editActions.current.delete(comment.id);
                }}
                disabled={locked || editor !== null}
                onClick={() => { setAnnouncement(""); setEditor(comment); }}>Edit</button>
              <button type="button" className="button secondary" aria-label={`Remove comment on line ${comment.line}`}
                disabled={locked || editor !== null}
                onClick={() => removeComment(comment)}>Remove</button>
            </div>
          </div>,
        )}
        {editor?.line === line.newLine && <form className="review-editor" noValidate onSubmit={event => {
          event.preventDefault();
          saveComment();
        }}>
          <label htmlFor={editorId}>Comment on line {editor.line}</label>
          <textarea id={editorId} ref={focusEditor} required value={editor.body}
            aria-invalid={Boolean(editor.error)}
            aria-describedby={editor.error ? `${editorId}-limits ${editorId}-error` : `${editorId}-limits`}
            onChange={event => setEditor({ ...editor, body: event.target.value })} />
          {editor.error && <p id={`${editorId}-error`} role="alert" className="field-error">{editor.error}</p>}
          <div className="review-actions">
            <button type="submit" className="button primary">{editor.id === null ? "Add comment" : "Save comment"}</button>
            <button type="button" className="button secondary" onClick={() => closeEditor()}>Cancel</button>
          </div>
        </form>}
      </div>
    } />

    {rejection && <div className="notice error-notice">
      <p role="alert">{rejection.message}</p>
      {Object.entries(rejection.fieldErrors ?? {}).map(([field, messages]) =>
        <p key={field} className="field-error" role="alert">{messages.join(" ")}</p>,
      )}
      {rejection.recovery === "history" && <WorkspaceLink href={historyHref}>Review history</WorkspaceLink>}
      {previousSubmissionId && rejection.recovery === "challenges" &&
        <WorkspaceLink href={catalogueHref}>Back to challenges</WorkspaceLink>}
    </div>}
    {(state.kind === "ready" || confirming) &&
      <button type="button" className="button primary" ref={submitAction} disabled={Boolean(rejection?.recovery) || confirming}
        onClick={requestConfirmation}>Submit review</button>}
    {confirming && <ConfirmationDialog title="Submit review?" descriptionId={`${editorId}-confirmation`} onCancel={cancelConfirmation}>
      <div id={`${editorId}-confirmation`}>
        <p>{comments.length} {comments.length === 1 ? "comment" : "comments"}.</p>
        <p>Submitted comments cannot be changed.</p>
        {comments.length === 0 && <p className="notice error-notice">You haven&apos;t added any comments. Submit an empty review?</p>}
      </div>
      <div className="recovery-actions">
        <button type="button" className="button secondary" disabled={state.kind === "sending"}
          onClick={cancelConfirmation}>Keep reviewing</button>
        <button type="button" className="button primary" disabled={state.kind === "sending"} onClick={() => {
          void submit({
            key: crypto.randomUUID(),
            accountId,
            payload: { revisionId: challenge.revisionId, ...(previousSubmissionId && { previousSubmissionId }),
              comments: comments.map(({ line, body }) => ({ line, body })) },
          }, false);
        }}>{state.kind === "sending" ? <span role="status">Submitting review…</span> : "Confirm submission"}</button>
      </div>
    </ConfirmationDialog>}
    {(state.kind === "uncertain" || checking || state.kind === "conflict") && <div className="notice">
      {checking ? <p role="status">Checking submission…</p> : <p role="alert">
        {state.kind === "conflict" ? submissionOutcomeMessages.conflict :
          state.kind === "uncertain" && state.inProgress ? submissionErrorMessages.inProgress : submissionOutcomeMessages.uncertain}
      </p>}
      <div className="review-actions">
        {state.kind === "uncertain" && <button type="button" className="button secondary"
          onClick={() => void submit(state.request, true)}>Check submission</button>}
        <WorkspaceLink href={historyHref}>Review history</WorkspaceLink>
      </div>
    </div>}
  </>;
}
