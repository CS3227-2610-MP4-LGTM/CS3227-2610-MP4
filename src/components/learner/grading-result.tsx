"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { z } from "zod";
import { AccessScreen } from "@/components/account/access-screen";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import { CodeDiffView } from "@/components/code-diff";
import type { WorkspaceAccessStatus } from "@/lib/auth/workspace-access";
import { accountAccessHeader, catalogueHref } from "@/lib/learner/challenges";
import { gradingFailureMessages, gradingFailureSchema, gradingIntentHeader, gradingViewSchema, type LearnerGrade } from "@/lib/learner/grading";
import { historyHref, submissionFailureSchema, submissionSuccessSchema, workspaceAccountHeader, type SubmissionView } from "@/lib/learner/submissions";
import { ChallengeMetadata } from "./challenge-metadata";

const gradeResponse = z.strictObject({ data: gradingViewSchema });
const pollInterval = 1000;
const gradeRequestTimeout = 65_000;
type ReadError = "unavailable" | "missing" | "denied";
type GradeRequest = { key: string; retry: boolean; accountId: string };

function accessFailure(response: Response): WorkspaceAccessStatus | undefined {
  if (response.status === 401) return "unauthenticated";
  const access = response.headers.get(accountAccessHeader);
  if (response.status === 403 && (access === "account_unavailable" || access === "role_denied")) return access;
  if (response.status === 503 && access === "account_service_unavailable") return access;
}

export function GradingResult({ submissionId, initialSubmission, accountId, initialReadFailed = false }: {
  submissionId: string;
  initialSubmission?: SubmissionView;
  accountId?: string;
  initialReadFailed?: boolean;
}) {
  const endpoint = `/api/v1/submissions/${encodeURIComponent(submissionId)}`;
  const [submission, setSubmission] = useState(initialSubmission);
  const [readError, setReadError] = useState<ReadError | undefined>(initialReadFailed ? "unavailable" : undefined);
  const [reading, setReading] = useState(false);
  const [observation, setObservation] = useState(0);
  const [posting, setPosting] = useState<GradeRequest>();
  const [uncertain, setUncertain] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const pendingRequest = useRef<GradeRequest | undefined>(undefined);
  const attemptedPending = useRef(false);
  const readVersion = useRef(0);
  const active = useRef(false);
  const postingRef = useRef(false);
  const reportAccessFailure = useReportWorkspaceAccessFailure();
  const expectedAccount = accountId ?? submission?.learner.id;

  function deny(response: Response) {
    const failure = accessFailure(response);
    if (failure) {
      setAccessDenied(true);
      reportAccessFailure(failure);
    } else {
      setReadError(response.status === 404 ? "missing" : "denied");
    }
    setSubmission(undefined);
  }

  async function readStatus(): Promise<SubmissionView | undefined> {
    const version = ++readVersion.current;
    setReading(true);
    const current = () => active.current && version === readVersion.current;
    try {
      const headers = new Headers();
      if (expectedAccount) headers.set(workspaceAccountHeader, expectedAccount);
      const response = await fetch(endpoint, { cache: "no-store", headers });
      if (!current()) return;
      if (!response.ok) {
        if (accessFailure(response) || response.status === 403 || response.status === 404) deny(response);
        else setReadError("unavailable");
        return;
      }
      const result = submissionSuccessSchema.parse(await response.json()).data;
      if (!current()) return;
      if (result.id.toLowerCase() !== submissionId.toLowerCase()) throw new Error("Mismatched submission");
      if (expectedAccount && result.learner.id.toLowerCase() !== expectedAccount.toLowerCase()) {
        setAccessDenied(true);
        setSubmission(undefined);
        reportAccessFailure("account_unavailable");
        return;
      }
      setSubmission(result);
      setReadError(undefined);
      if (result.grading.state === "completed" || result.grading.state === "running") {
        pendingRequest.current = undefined;
        setUncertain(false);
      }
      return result;
    } catch {
      if (current()) setReadError("unavailable");
    } finally {
      if (current()) {
        setReading(false);
        setObservation(version);
      }
    }
  }

  async function postGrade(operation: GradeRequest) {
    if (postingRef.current) return;
    postingRef.current = true;
    pendingRequest.current = operation;
    setPosting(operation);
    setUncertain(false);
    try {
      let definitiveFailure = false;
      try {
        const response = await fetch(endpoint + "/grade", {
          method: "POST", cache: "no-store", signal: AbortSignal.timeout(gradeRequestTimeout),
          headers: {
            "Content-Type": "application/json", "Idempotency-Key": operation.key,
            [workspaceAccountHeader]: operation.accountId,
            [gradingIntentHeader]: operation.retry ? "retry" : "initial",
          },
          body: "{}",
        });
        if (!active.current) return;
        if (accessFailure(response) || response.status === 403 || response.status === 404) {
          ++readVersion.current;
          setReading(false);
          deny(response);
          return;
        }
        const json = await response.json();
        if (!active.current) return;
        if (response.ok) {
          const { data: grading } = gradeResponse.parse(json);
          if (grading.state !== "completed") throw new Error("Unexpected grading acknowledgement");
          ++readVersion.current;
          setReading(false);
          setSubmission(view => view && { ...view, grading });
          setReadError(undefined);
          pendingRequest.current = undefined;
          return;
        }
        const { code, message } = submissionFailureSchema.parse(json).error;
        const failure = gradingFailureSchema.safeParse(code);
        definitiveFailure = failure.success && message === gradingFailureMessages[failure.data];
      } catch {
        // An interrupted POST may have started or completed the same run.
      }
      if (!active.current) return;
      const observed = await readStatus();
      if (!active.current) return;
      if (observed?.grading.state === "failed" && definitiveFailure) pendingRequest.current = undefined;
      if (pendingRequest.current === operation) setUncertain(true);
    } finally {
      postingRef.current = false;
      if (active.current) setPosting(undefined);
    }
  }

  const load = useEffectEvent(() => {
    if (!initialSubmission && !initialReadFailed) void readStatus();
  });
  const observe = useEffectEvent(() => {
    if (submission?.grading.state === "pending" && !attemptedPending.current) {
      attemptedPending.current = true;
      void postGrade({ key: crypto.randomUUID(), retry: false, accountId: submission.learner.id });
      return;
    }
    void readStatus();
  });

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) load(); });
    return () => {
      cancelled = true;
      active.current = false;
    };
  }, []);

  const state = submission?.grading.state;
  useEffect(() => {
    if (reading || readError || uncertain || (state !== "pending" && state !== "running")) return;
    const delay = state === "pending" && !attemptedPending.current ? 0 : pollInterval;
    const timer = setTimeout(() => observe(), delay);
    return () => clearTimeout(timer);
  }, [state, readError, reading, uncertain, posting, observation]);

  async function checkStatus() {
    const observed = await readStatus();
    const operation = pendingRequest.current;
    if (observed && operation && (observed.grading.state === "pending" || observed.grading.state === "failed")) {
      await postGrade(operation);
    }
  }

  if (accessDenied || readError === "denied") return <AccessScreen kind="record-denied" workspaceHref={catalogueHref} />;
  if (readError === "missing") return <section className="recovery-card">
    <h1>Review not found</h1>
    <p>We couldn&apos;t find this review.</p>
    <Link href={historyHref}>Review history</Link>
  </section>;
  if (!submission) {
    if (readError === "unavailable") return <section className="recovery-card">
      <h1>Review unavailable</h1>
      <p role="alert">We couldn&apos;t load this review result. Try again.</p>
      <button type="button" className="button" onClick={() => void readStatus()} disabled={reading}>Try again</button>
    </section>;
    return <p role="status">Loading review result…</p>;
  }

  const { challenge, grading, comments } = submission;
  const original = grading.original;
  const commentResults = new Map(original?.comments.map(comment => [comment.commentId, comment]));
  const retrying = posting?.retry === true;
  const recovery = readError === "unavailable" || uncertain;

  return <article className="challenge-workspace">
    <nav aria-label="Review result navigation">
      <Link href={historyHref}>Review history</Link>{" "}
      <Link href={catalogueHref}>Browse challenges</Link>
    </nav>
    <header>
      <h1>Review result</h1>
      <h2>{challenge.title}</h2>
      <ChallengeMetadata challenge={challenge} />
      <p>Attempt {submission.attemptNumber}</p>
      <p>Submitted <time dateTime={submission.submittedAt}>{new Date(submission.submittedAt).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}</time></p>
    </header>
    <div role="status">
      {grading.state === "pending" && <p>Grading pending</p>}
      {grading.state === "running" && <p>Grading your review…</p>}
      {grading.state === "failed" && <>
        <p>Grading failed. Your review is still saved.</p>
        <p>{gradingFailureMessages[grading.failureCode]}</p>
      </>}
      {original && <p className="sr-only">Grading complete.</p>}
    </div>
    {recovery && <div>
      <p role="alert">We couldn&apos;t update grading status.</p>
      <button type="button" className="button" onClick={() => void checkStatus()} disabled={reading}>Check status</button>
    </div>}
    {(retrying || (!recovery && grading.state === "failed" && grading.failureCode !== "PAYLOAD_TOO_LARGE")) &&
      <button type="button" className="button" disabled={Boolean(posting)}
        onClick={() => void postGrade({ key: crypto.randomUUID(), retry: true, accountId: submission.learner.id })}>
        {retrying ? "Retrying grading…" : "Retry grading"}
      </button>}
    {original && <OriginalAssessment grade={original} />}
    <CodeDiffView code={challenge.code} />
    <section aria-labelledby="submitted-comments">
      <h2 id="submitted-comments">Submitted comments</h2>
      {comments.length ? <ol>
        {comments.map(comment => {
          const assessed = commentResults.get(comment.id);
          const duplicate = original?.duplicateCommentIds.includes(comment.id);
          return <li className="review-comment" key={comment.id}>
            <p className="field-help">Line {comment.line}</p>
            <p className="review-comment-body">{comment.body}</p>
            {assessed && <>
              <p>{assessed.matched ? "Matched" : duplicate ? "Duplicate" : "Unmatched"}</p>
              {!assessed.matched && <>
                <p>{duplicate ? "Another comment already counts for this flaw." : "No flaw matched this comment's location."}</p>
                <p>No credit</p>
              </>}
              <dl>
                <dt>Explanation credit</dt><dd>{assessed.explanationCredit ?? "—"}</dd>
                <dt>Fix credit</dt><dd>{assessed.fixCredit ?? "—"}</dd>
              </dl>
            </>}
          </li>;
        })}
      </ol> : <p>No comments submitted.</p>}
    </section>
  </article>;
}

function OriginalAssessment({ grade }: { grade: LearnerGrade }) {
  return <section aria-labelledby="original-assessment">
    <h2 id="original-assessment">Original assessment</h2>
    <dl>
      <dt>Score</dt><dd>{grade.score} / 100</dd>
      <dt>Pass mark</dt><dd>{grade.passMark}</dd>
      <dt>Matched flaws</dt><dd>{grade.matchedCount}</dd>
      <dt>Missed flaws</dt><dd>{grade.missedCount}</dd>
    </dl>
    <p>{grade.passed ? "Passed" : "Not passed"}</p>
    <h3>Component points</h3>
    <dl>
      <dt>Identification</dt><dd>{grade.identificationPoints}</dd>
      <dt>Explanation</dt><dd>{grade.explanationPoints}</dd>
      <dt>Actionable fix</dt><dd>{grade.fixPoints}</dd>
    </dl>
  </section>;
}
