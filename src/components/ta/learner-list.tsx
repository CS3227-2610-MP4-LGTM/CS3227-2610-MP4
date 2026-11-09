"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { LearnerPageResult } from "@/lib/ta/progress";
import { useInspectionRead } from "./use-inspection-read";
export function LearnerList({ search, readPage, navigate }: { search: string; readPage: (search: string) => Promise<LearnerPageResult>; navigate: (href: string) => void }) {
  const { result, refresh, denied } = useInspectionRead(search, readPage);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (result && !denied) heading.current?.focus(); }, [result, denied]);
  const params = new URLSearchParams(search);
  function page(cursor?: string) {
    if (cursor) params.set("cursor", cursor); else params.delete("cursor");
    navigate(params.size ? `/ta/learners?${params}` : "/ta/learners");
  }
  if (denied) return null;
  return <>
    <h1 ref={heading} tabIndex={-1}>Learners</h1>
    {!result ? <p role="status">Loading learners…</p> : result.status === "invalid" ? <p role="alert">This learners page isn&apos;t valid.</p> : result.status !== "ok" ? <><p role="alert">We couldn&apos;t load learners. Try again.</p><button className="button secondary" onClick={refresh}>Try again</button></> : !result.page.items.length ? <p role="status">No learners yet.</p> :
      <ul className="challenge-list">{result.page.items.map(learner => <li key={learner.id} className="challenge-card ta-evidence"><dl><dt>Learner</dt><dd>{learner.displayName}</dd><dt>Learner ID</dt><dd>{learner.id}</dd></dl><Link prefetch={false} href={`/ta/learners/${learner.id}`}>View learner</Link></li>)}</ul>}
    {(params.has("cursor") || result?.status === "invalid") && <button className="button secondary" disabled={!result} onClick={() => page()}>First page</button>}
    {result?.status === "ok" && result.page.nextCursor && <button className="button secondary" onClick={() => page(result.page.nextCursor!)}>Next page</button>}
  </>;
}
