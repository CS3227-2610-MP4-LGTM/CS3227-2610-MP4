"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { categoryLabels } from "@/lib/learner/challenges";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import type { SummaryGenerationResult, SummaryReadResult, SummaryRecord } from "@/lib/ta/summaries";
type Props = { learnerId: string; readSummary: (id: string) => Promise<SummaryReadResult>; generateSummary: (id: string, key: string) => Promise<SummaryGenerationResult> };
type State = { id: string; summary?: SummaryRecord | null; read?: SummaryReadResult; pending?: boolean; generation?: SummaryGenerationResult | "uncertain"; success?: boolean };
const messages: Record<string, string> = {
  INVALID_STATE: "A completed submission is required to generate a summary.",
  PAYLOAD_TOO_LARGE: "There is too much evidence to generate this summary.",
  RATE_LIMITED: "Summary generation is temporarily limited. Try again later.",
  AI_TIMEOUT: "Summary generation timed out. Try again.",
  INVALID_AI_OUTPUT: "We couldn't generate a valid summary. Try again.",
};
export function SummaryPanel({ learnerId, readSummary, generateSummary }: Props) {
  const [state, setState] = useState<State>({ id: learnerId });
  const [refresh, setRefresh] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null), selected = useRef(learnerId), busy = useRef(false);
  const report = useReportWorkspaceAccessFailure();
  const current = state.id === learnerId ? state : { id: learnerId };
  useEffect(() => {
    selected.current = learnerId; busy.current = false;
    let active = true;
    const settle = (read: SummaryReadResult) => {
      if (!active) return;
      setState(old => ({ id: learnerId, read, summary: read.status === "ok" ? read.summary : old.id === learnerId ? old.summary : undefined }));
    };
    readSummary(learnerId).then(settle, () => settle({ status: "unavailable" }));
    return () => { active = false; selected.current = ""; };
  }, [learnerId, readSummary, refresh]);
  const denied = current.generation && current.generation !== "uncertain" && isWorkspaceAccessFailure(current.generation) ? current.generation : current.read && isWorkspaceAccessFailure(current.read) ? current.read : undefined;
  useEffect(() => { if (denied) report(denied.status); }, [denied, report]);
  async function generate() {
    if (busy.current) return; busy.current = true;
    setState(old => ({ ...old, id: learnerId, pending: true, generation: undefined, success: false }));
    let result: SummaryGenerationResult | "uncertain";
    try { result = await generateSummary(learnerId, crypto.randomUUID()); } catch { result = "uncertain"; }
    if (selected.current !== learnerId) return;
    busy.current = false;
    setState(old => result !== "uncertain" && result.status === "ok"
      ? { id: learnerId, summary: result.summary, read: { status: "ok", summary: result.summary, stale: false }, success: true }
      : { ...old, pending: false, generation: result });
    if (result !== "uncertain" && result.status === "ok") heading.current?.focus();
  }
  if (denied) return null;
  const summary = current.summary;
  const readFailed = current.read && current.read.status !== "ok";
  const failure = current.generation && current.generation !== "uncertain" && current.generation.status === "failed" ? current.generation.code : undefined;
  const refreshRead = () => { if (!busy.current) { setState(old => ({ ...old, read: undefined })); setRefresh(n => n + 1); } };
  return <section aria-labelledby="performance-summary">
    <h2 id="performance-summary" ref={heading} tabIndex={-1}>Performance summary</h2>
    {!current.read && <p role="status">Loading performance summary…</p>}
    {readFailed && <><p role="alert">We couldn&apos;t load the performance summary. Try again.</p><button className="button secondary" onClick={refreshRead}>Try again</button><Link prefetch={false} href="/ta/learners">Back to learners</Link>{summary && <p>Previously loaded summary; freshness unavailable.</p>}</>}
    {current.read?.status === "ok" && summary === null && <p>No performance summary yet.</p>}
    {current.pending && <p role="status">Generating performance summary…</p>}
    {current.pending && summary && <p>Previous summary</p>}
    {current.success && <p role="status">Performance summary generated.</p>}
    {current.read?.status === "ok" && current.read.stale && <p>This summary is out of date. Generate a new summary to include current evidence.</p>}
    {summary && <>
      <p>AI-generated summary — review the supporting submissions.</p>
      <dl><dt>Generated</dt><dd><time dateTime={summary.createdAt}>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "long", timeZone: "UTC" }).format(new Date(summary.createdAt))}</time></dd></dl>
      {([["strengths", "Strengths", "No strengths identified in this summary."], ["blindSpots", "Blind spots", "No blind spots identified in this summary."], ["nextSteps", "Suggested next steps", "No next steps suggested in this summary."]] as const).map(([key, label, empty]) => <div key={key}><h3>{label}</h3>{summary.output[key].length ? <ul className="challenge-list">{summary.output[key].map((item, index) => <li key={index} className="challenge-card ta-evidence"><p>{categoryLabels[item.category]}</p><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.text}</p><ul>{item.submissionIds.map(id => <li key={id}><Link prefetch={false} href={`/ta/submissions/${id}?from=learner&learnerId=${learnerId}`}>View supporting submission</Link></li>)}</ul></li>)}</ul> : <p>{empty}</p>}</div>)}
    </>}
    {failure && <><p role="alert">{messages[failure] ?? "Summary generation is unavailable. Try again."}</p>{failure === "INVALID_STATE" ? <Link prefetch={false} href={`/ta/submissions?learnerId=${learnerId}`}>View submissions</Link> : failure !== "PAYLOAD_TOO_LARGE" && <button className="button secondary" onClick={generate} disabled={current.pending}>Try again</button>}</>}
    {current.generation === "uncertain" && <p role="alert">We couldn&apos;t confirm the generation result. Refresh learner performance.</p>}
    {current.read?.status === "ok" && <button className="button" disabled={current.pending} onClick={generate}>{summary ? "Regenerate summary" : "Generate summary"}</button>}
    {(current.read?.status === "ok" || summary || failure === "PAYLOAD_TOO_LARGE" || current.generation === "uncertain") && <button className="button secondary" onClick={refreshRead} disabled={current.pending}>Refresh learner performance</button>}
  </section>;
}
