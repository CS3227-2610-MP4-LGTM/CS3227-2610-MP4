"use client";
import Link from "next/link";
import { useRef, useState, useEffect } from "react";
import { z } from "zod";
import type { ListResult } from "@/lib/ta/submissions";
import { useInspectionRead } from "./use-inspection-read";
export function SubmissionTime({ value }: { value: string }) { return <time dateTime={value}>{new Date(value).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}</time>; }
export const stateLabel = (state: string) => state.charAt(0).toUpperCase() + state.slice(1);
const base = "/ta/submissions";
function Filters({ search, navigate }: { search: string; navigate: (href: string) => void }) {
 const params = new URLSearchParams(search);
 const [learnerId, setLearner] = useState(params.get("learnerId") ?? "");
 const [challengeId, setChallenge] = useState(params.get("challengeId") ?? "");
 const [state, setState] = useState(params.get("gradingState") ?? "");
 const [errors, setErrors] = useState<Record<string, boolean>>({});
 return <form className="challenge-filters" onSubmit={event => {
   event.preventDefault();
   const nextErrors = { learnerId: !!learnerId && !z.uuid().safeParse(learnerId).success, challengeId: !!challengeId && !z.uuid().safeParse(challengeId).success };
   setErrors(nextErrors); if (Object.values(nextErrors).some(Boolean)) return;
   const next = new URLSearchParams();
   if (learnerId) next.set("learnerId", learnerId); if (challengeId) next.set("challengeId", challengeId); if (state) next.set("gradingState", state);
   navigate(next.size ? `${base}?${next}` : base);
 }}>
 {[{ key: "learnerId", label: "Learner ID", value: learnerId, set: setLearner }, { key: "challengeId", label: "Challenge ID", value: challengeId, set: setChallenge }].map(field => <div key={field.key}><label htmlFor={field.key}>{field.label}</label>
 <input id={field.key} value={field.value} onChange={event => field.set(event.target.value)} aria-invalid={errors[field.key] || undefined} aria-describedby={errors[field.key] ? `${field.key}-error` : undefined} />
 {errors[field.key] && <span id={`${field.key}-error`}>Enter a valid ID.</span>}</div>)}
 <label>Grading status<select value={state} onChange={event => setState(event.target.value)}><option value="">All</option>{["pending", "running", "failed", "completed"].map(value => <option key={value} value={value}>{stateLabel(value)}</option>)}</select></label>
 <div className="filter-actions"><button type="submit" className="button primary">Apply filters</button>
 <button type="button" className="button secondary" onClick={() => navigate(base)}>Clear filters</button></div>
 </form>;
}
export function SubmissionList({ search, readPage, navigate }: { search: string; readPage: (search: string) => Promise<ListResult>; navigate: (href: string) => void }) {
 const { result, refresh, denied } = useInspectionRead(search, readPage);
 const heading = useRef<HTMLHeadingElement>(null);
 const params = new URLSearchParams(search);
 const filtered = ["learnerId", "challengeId", "gradingState"].some(key => params.has(key));
 const page = (cursor?: string) => { if (cursor) params.set("cursor", cursor); else params.delete("cursor"); navigate(params.size ? `${base}?${params}` : base); };
 useEffect(() => { if (result && !denied) heading.current?.focus(); }, [result, denied]);
 if (denied) return null;
 return <>
 <h1 ref={heading} tabIndex={-1}>Submissions</h1>
 <Filters key={search} search={search} navigate={navigate} />
 {!result ? <p role="status">Loading submissions…</p> : result.status === "invalid" ? <p role="alert">This submissions page isn&apos;t valid.</p> : result.status !== "ok" ? <><p role="alert">We couldn&apos;t load submissions. Try again.</p><button className="button secondary" onClick={refresh}>Try again</button></> : result.page.items.length === 0 ? <p role="status">{filtered ? "No submissions match these filters." : "No submissions yet."}</p> :
 <ul className="challenge-list">{result.page.items.map(item => <li className="challenge-card ta-evidence" key={item.id}><dl>
 <dt>Learner</dt><dd><span>{item.learner.displayName}</span><br /><span>{item.learner.id}</span></dd>
 <dt>Challenge</dt><dd>{item.title}</dd><dt>Attempt</dt><dd>{item.attemptNumber}</dd><dt>Submitted</dt><dd><SubmissionTime value={item.submittedAt} /></dd>
 <dt>Grading status</dt><dd>{stateLabel(item.gradingState)}</dd><dt>Effective score</dt><dd>{item.gradingState === "completed" && item.effectiveScore !== null ? `${item.effectiveScore} / 100` : "Not available"}</dd><dt>Open flags</dt><dd>{item.openFlagCount}</dd></dl>
 <Link prefetch={false} href={`${base}/${item.id}${params.getAll("learnerId").length === 1 && params.get("learnerId") === item.learner.id ? `?from=learner&learnerId=${item.learner.id}` : ""}`}>View submission</Link></li>)}</ul>}
 {(params.has("cursor") || result?.status === "invalid") && <button className="button secondary" disabled={!result} onClick={() => page()}>First page</button>}
 {result?.status === "ok" && result.page.nextCursor && <button className="button secondary" onClick={() => page(result.page.nextCursor!)}>Next page</button>}
 </>;
}
