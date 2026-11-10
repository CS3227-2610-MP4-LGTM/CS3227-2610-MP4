"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { categoryLabels, difficultyLabels, languageLabels } from "@/lib/learner/challenges";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import type { LearnerResult, ProgressResult, RecommendationResult } from "@/lib/ta/progress";
import { useInspectionRead } from "./use-inspection-read";

type Props = { learnerId: string; readLearner: (id: string) => Promise<LearnerResult>; readProgress: (id: string) => Promise<ProgressResult>; readRecommendations: (id: string) => Promise<RecommendationResult>; summarySlot?: ReactNode; onRetryIdentity?: () => void };
// Section-local requests retain only successful content for this mounted learner.
// Cleanup prevents a late response from another request restoring stale access.
function useSection<T extends { status: string }>(id: string, read: (id: string) => Promise<T>) {
  const [retry, setRetry] = useState(0);
  const request = useMemo(() => ({ retry, id }), [retry, id]);
  const [state, setState] = useState<{ request: typeof request; result: T | { status: "unavailable" }; previous?: T }>();
  const report = useReportWorkspaceAccessFailure();
  useEffect(() => {
    let active = true;
    const settle = (result: T | { status: "unavailable" }) => {
      if (!active) return;
      setState(old => ({ request, result, previous: result.status === "ok" ? result as T : old?.request.id === id ? old.previous : undefined }));
    };
    read(id).then(settle, () => settle({ status: "unavailable" }));
    return () => { active = false; };
  }, [id, read, request]);
  const result = state?.request === request ? state.result : undefined;
  const denied = !!result && isWorkspaceAccessFailure(result);
  useEffect(() => { if (result && isWorkspaceAccessFailure(result)) report(result.status); }, [result, report]);
  return { result, content: state?.request.id === id ? state.previous : undefined, pending: !result, denied, refresh: () => setRetry(value => value + 1) };
}
export function LearnerDetail(props: Props) {
  const { result, refresh, denied } = useInspectionRead(props.learnerId, props.readLearner);
  if (denied) return null;
  if (!result) return <p role="status">Loading learner performance…</p>;
  if (result.status !== "ok") return <><p role="alert">{result.status === "not_found" ? "Learner not found." : "We couldn't load learner performance. Try again."}</p>{result.status !== "not_found" && <button className="button secondary" onClick={props.onRetryIdentity ?? refresh}>Try again</button>}<Link prefetch={false} href="/ta/learners">Back to learners</Link></>;
  return <DetailSections key={props.learnerId} {...props} learner={result.learner} />;
}
function DetailSections({ learnerId, learner, readProgress, readRecommendations, summarySlot }: Props & { learner: { id: string; displayName: string } }) {
  const progress = useSection(learnerId, readProgress);
  const recommendations = useSection(learnerId, readRecommendations);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  if (progress.denied || recommendations.denied) return null;
  const p = progress.content?.status === "ok" ? progress.content.progress : undefined;
  const r = recommendations.content?.status === "ok" ? recommendations.content.recommendations : undefined;
  return <>
    <h1 ref={heading} tabIndex={-1}>Learner performance</h1>
    <dl className="ta-evidence"><dt>Learner</dt><dd>{learner.displayName}</dd><dt>Learner ID</dt><dd>{learner.id}</dd></dl>
    <Link prefetch={false} href={`/ta/submissions?learnerId=${learnerId}`}>View submissions</Link>
    <section aria-labelledby="performance-summary"><h2 id="performance-summary">Performance summary</h2>{summarySlot}</section>
    <button className="button secondary" disabled={progress.pending || recommendations.pending} onClick={() => { progress.refresh(); recommendations.refresh(); }}>Refresh progress and recommendations</button>
    <section aria-labelledby="category-progress"><h2 id="category-progress">Category progress</h2>
      {progress.pending && <p role="status">Loading category progress…</p>}
      {progress.result && progress.result.status !== "ok" && <><p role="alert">We couldn&apos;t load category progress. Try again.</p><button className="button secondary" onClick={progress.refresh}>Try again</button>{p && <p>Previously loaded progress</p>}</>}
      {p && <>
        <p>Progress uses completed first attempts. Retries and grade overrides do not change these identification counts.</p>
        <p>Not observed means no completed first-attempt flaws in that category.</p>
        {p.categories.every(c => c.totalFlaws === 0) && <p>No completed first-attempt category evidence yet.</p>}
        <ul className="challenge-list">{p.categories.map(c => <li key={c.category} className="challenge-card ta-evidence"><dl>
          <dt>Category</dt><dd>{categoryLabels[c.category]}</dd><dt>Identified flaws</dt><dd>{c.identifiedFlaws}</dd><dt>Total flaws</dt><dd>{c.totalFlaws}</dd><dt>Identification rate</dt><dd>{c.identificationRate === null ? "Not observed" : `${(c.identificationRate * 100).toFixed(2)}%`}</dd><dt>Completed first attempts</dt><dd>{c.completedFirstAttempts}</dd>
        </dl></li>)}</ul>
      </>}
    </section>
    <section aria-labelledby="recommended-challenges"><h2 id="recommended-challenges">Recommended challenges</h2>
      <p>Rule-based recommendations from observed category progress.</p>
      {recommendations.pending && <p role="status">Loading recommendations…</p>}
      {recommendations.result && recommendations.result.status !== "ok" && <><p role="alert">We couldn&apos;t load recommendations. Try again.</p><button className="button secondary" onClick={recommendations.refresh}>Try again</button>{r && <p>Previously loaded recommendations</p>}</>}
      {r && (!r.items.length ? <p>No eligible recommendations right now.</p> : <ul className="challenge-list">{r.items.map(({ challenge: c, targetCategories }) => <li key={c.id} className="challenge-card ta-evidence"><dl><dt>Challenge</dt><dd>{c.title}</dd><dt>Language</dt><dd>{languageLabels[c.language]}</dd><dt>Difficulty</dt><dd>{difficultyLabels[c.difficulty]}</dd><dt>Practice categories</dt><dd><ul>{targetCategories.map(category => <li key={category}>{categoryLabels[category]}</li>)}</ul></dd></dl></li>)}</ul>)}
    </section>
    <Link prefetch={false} href="/ta/learners">Back to learners</Link>
  </>;
}
