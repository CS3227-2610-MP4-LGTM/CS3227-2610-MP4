"use client";

import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { categoryLabels, type Category } from "@/lib/learner/challenges";
import { learnerHintSchema, type LearnerHint } from "@/lib/learner/feedback";
import type { LearnerGrade } from "@/lib/learner/grading";
import { workspaceAccountHeader, type SubmissionView } from "@/lib/learner/submissions";

const hintResponse = z.strictObject({ data: learnerHintSchema });
type HintState = "ready" | "loading" | "failed" | "unavailable" | "refreshing";
type HintReads = {
  endpoint: string;
  accountId: string;
  handleAccountFailure: (response: Response) => boolean;
  refreshResult: () => Promise<SubmissionView | undefined>;
};

export function MissedCriteria({ grade, comments, ...reads }: HintReads & {
  grade: LearnerGrade;
  comments: SubmissionView["comments"];
}) {
  const commentsById = new Map(comments.map((comment, index) => [comment.id, { line: comment.line, number: index + 1 }]));
  const partial = grade.comments.flatMap(comment => {
    if (!comment.matched) return [];
    const criteria = [
      ...(comment.explanationCredit < 1 ? ["Explanation"] : []),
      ...(comment.fixCredit < 1 ? ["Actionable fix"] : []),
    ];
    const submitted = commentsById.get(comment.commentId);
    return criteria.length && submitted ? [{ id: comment.commentId, ...submitted, criteria }] : [];
  });
  const groups = Object.entries(categoryLabels).flatMap(([key, label]) => {
    const category = key as Category;
    const ids = grade.eligibleHints.filter(hint => hint.category === category).map(hint => hint.hintId);
    return ids.length ? [{ category, label, ids }] : [];
  });

  return <section aria-labelledby="missed-criteria">
    <h2 id="missed-criteria">Missed criteria</h2>
    {partial.length > 0 && <ul>
      {partial.map(({ id, line, number, criteria }) => <li key={id}>
        Comment {number} on line {line} · {criteria.join(" and ")}
      </li>)}
    </ul>}
    {!partial.length && !groups.length && <p>No missed criteria in this assessment.</p>}
    {groups.length ? <ul>
      {groups.map(({ category, label, ids }) =>
        <li key={`${category}:${ids.join(",")}`}>
          <HintCategory category={category} label={label} ids={ids} {...reads} />
        </li>)}
    </ul> : <p>No hints needed for missed flaws.</p>}
  </section>;
}

function HintCategory({ category, label, ids, endpoint, accountId, handleAccountFailure, refreshResult }: HintReads & {
  category: Category;
  label: string;
  ids: string[];
}) {
  const headingId = useId();
  const [hints, setHints] = useState<LearnerHint[]>([]);
  const [state, setState] = useState<HintState>("ready");
  const activeRequest = useRef<AbortController | null>(null);
  const allShown = hints.length === ids.length;

  useEffect(() => () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    // A hidden Cache Components route may be reopened without remounting.
    setHints([]);
    setState("ready");
  }, []);

  async function showHint() {
    if (activeRequest.current || allShown || (state !== "ready" && state !== "failed")) return;
    const hintId = ids[hints.length];
    const request = new AbortController();
    activeRequest.current = request;
    setState("loading");
    try {
      const response = await fetch(`${endpoint}/hints/${encodeURIComponent(hintId)}`, {
        cache: "no-store", signal: request.signal, headers: { [workspaceAccountHeader]: accountId },
      });
      if (request.signal.aborted || handleAccountFailure(response)) return;
      if (response.status === 403 || response.status === 404) {
        setState("unavailable");
        return;
      }
      if (!response.ok) throw new Error("Hint read failed");
      const { data } = hintResponse.parse(await response.json());
      if (request.signal.aborted) return;
      if (data.hintId !== hintId || data.category !== category) throw new Error("Mismatched hint");
      setHints(previous => [...previous, data]);
      setState("ready");
    } catch {
      if (!request.signal.aborted) setState("failed");
    } finally {
      if (activeRequest.current === request) activeRequest.current = null;
    }
  }

  async function refresh() {
    if (activeRequest.current || state !== "unavailable") return;
    const request = new AbortController();
    activeRequest.current = request;
    setState("refreshing");
    const result = await refreshResult();
    if (!request.signal.aborted) setState(result ? "ready" : "unavailable");
    if (activeRequest.current === request) activeRequest.current = null;
  }

  const action = state === "loading" ? "Loading hint…" : state === "failed" ? "Try again" : "Show hint";
  return <div role="group" aria-labelledby={headingId} className="review-comment">
    <h3 id={headingId}>{label} · {ids.length} missed</h3>
    <ol aria-live="polite" aria-relevant="additions">
      {hints.map(hint => <li className="review-comment-body" key={hint.hintId}>{hint.text}</li>)}
    </ol>
    {state === "failed" && <p role="alert">We couldn&apos;t load this hint. Try again.</p>}
    {state === "unavailable" || state === "refreshing" ? <>
      <p role="alert">This hint isn&apos;t available for this review.</p>
      <button type="button" className="button secondary" aria-disabled={state === "refreshing"}
        onClick={() => void refresh()}>Refresh result</button>
    </> : allShown ? <p>All hints shown</p> :
      <button type="button" className="button secondary" aria-label={`${action} for ${label}`}
        aria-disabled={state === "loading"} onClick={() => void showHint()}>{action}</button>}
  </div>;
}
