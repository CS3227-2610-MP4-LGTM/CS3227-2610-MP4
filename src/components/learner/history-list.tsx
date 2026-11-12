"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import type { HistoryResult } from "@/lib/learner/history";
import { historyHref } from "@/lib/learner/submissions";

const stateLabels = { pending: "Pending", running: "Running", failed: "Failed", completed: "Completed" };
export function HistoryList({ search, readPage, navigate }: {
  search: string; readPage: (search: string) => Promise<HistoryResult>; navigate: (href: string) => void;
}) {
  const [retry, setRetry] = useState(0);
  const request = useMemo(() => ({ search, retry }), [search, retry]);
  const [settled, setSettled] = useState<{ request: typeof request; result: HistoryResult }>();
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterPage = useRef<string | null>(null);
  const reportAccessFailure = useReportWorkspaceAccessFailure();
  useEffect(() => {
    let active = true;
    const settle = (result: HistoryResult) => { if (active) setSettled({ request, result }); };
    readPage(request.search).then(settle, () => settle({ status: "unavailable" }));
    return () => { active = false; };
  }, [request, readPage]);
  const result = settled?.request === request ? settled.result : undefined;
  useEffect(() => {
    if (result && isWorkspaceAccessFailure(result)) reportAccessFailure(result.status);
    else if (result?.status === "forbidden") reportAccessFailure("role_denied");
    else if (result && focusAfterPage.current === search) {
      focusAfterPage.current = null;
      heading.current?.focus();
    }
  }, [result, search, reportAccessFailure]);
  const params = new URLSearchParams(search);
  const pending = !result;
  function go(cursor: string | null, clean = false) {
    if (pending) return;
    if (clean) params.forEach((_, key) => params.delete(key));
    if (cursor) params.set("cursor", cursor); else params.delete("cursor");
    const next = clean ? "" : params.toString();
    focusAfterPage.current = next;
    navigate(next ? `${historyHref}?${next}` : historyHref);
  }
  if (result && (isWorkspaceAccessFailure(result) || result.status === "forbidden")) return null;
  const nextCursor = result?.status === "ok" ? result.page.nextCursor : null;
  return <section className="challenge-results" aria-labelledby="history-heading">
    <h1 id="history-heading" ref={heading} tabIndex={-1}>Review history</h1>
    <Link href="/learner/challenges">Browse challenges</Link>
    {pending ? <p role="status">Loading review history…</p>
      : result.status === "invalid" ? <p role="alert">This history page isn&apos;t valid.</p>
      : result.status !== "ok" ? <>
        <p role="alert">We couldn&apos;t load review history. Try again.</p>
        <button type="button" className="button secondary" onClick={() => setRetry(value => value + 1)}>Try again</button>
      </> : result.page.items.length === 0 ? <p role="status">No reviews yet.</p>
      : <ul className="challenge-list">{result.page.items.map(card => <li key={card.id} className="challenge-card">
        <dl>
          <dt>Challenge</dt><dd><Link prefetch={false} href={`${historyHref}/${card.id}`}>{card.title}</Link></dd>
          <dt>Attempt</dt><dd>{card.attemptNumber}</dd>
          <dt>Submitted</dt><dd><time dateTime={card.submittedAt}>{new Date(card.submittedAt).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}</time></dd>
          <dt>Grading status</dt><dd>{stateLabels[card.gradingState]}</dd>
          <dt>Effective score</dt><dd>{card.effectiveScore === null ? "Not available" : `${card.effectiveScore} / 100`}</dd>
          <dt>Open flags</dt><dd>{card.openFlagCount}</dd>
        </dl>
        <Link prefetch={false} href={`${historyHref}/${card.id}`}>View result</Link>
      </li>)}</ul>}
    {(params.has("cursor") || result?.status === "invalid" || nextCursor) && <div className="challenge-pagination">
      {(params.has("cursor") || result?.status === "invalid") && <button type="button" className="button secondary" disabled={pending}
        onClick={() => go(null, result?.status === "invalid")}>First page</button>}
      {nextCursor && <button type="button" className="button secondary" disabled={pending} onClick={() => go(nextCursor)}>Next page</button>}
    </div>}
  </section>;
}
