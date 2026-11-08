"use client";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import type { DetailResult, TaSubmissionView } from "@/lib/ta/submissions";
import { flagLabels, type OverrideResult, type ResolutionResult, type MutationFailure } from "@/lib/ta/moderation";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import { SubmissionTime, stateLabel } from "./submission-list";
type Props = { submission: TaSubmissionView; selectedFlagId?: string; saveOverride: (id: string, payload: {score: number; reason: string}, key: string) => Promise<OverrideResult>; saveResolution: (id: string, payload: {disposition: "upheld" | "dismissed"; reason: string}, key: string) => Promise<ResolutionResult>; refresh: () => Promise<DetailResult> };
const maxOrder = (rows: readonly {auditOrder: number}[]) => Math.max(0,...rows.map(r => r.auditOrder));
function merge(current: TaSubmissionView, incoming: TaSubmissionView): TaSubmissionView {
 if (incoming.id !== current.id) return incoming;
 return { ...incoming, grading: maxOrder(current.grading.overrides) > maxOrder(incoming.grading.overrides) ? current.grading : incoming.grading,
 flags: incoming.flags.map(flag => { const old = current.flags.find(f => f.id === flag.id); return old && maxOrder(old.resolutions) > maxOrder(flag.resolutions) ? old : flag; }) };
}
export function ModerationPanel({ submission, selectedFlagId, saveOverride, saveResolution, refresh }: Props) {
 const [view,setView] = useState(submission), [lastProp,setLastProp] = useState(submission);
 if (lastProp !== submission) { setLastProp(submission); setView(current => merge(current,submission)); }
 const [form,setForm] = useState<{kind: "override" | "resolution"; id: string} | null>(null);
 const [score,setScore] = useState(""), [reason,setReason] = useState(""), [disposition,setDisposition] = useState("");
 const [errors,setErrors] = useState<Record<string,string>>({});
 const [pending,setPending] = useState(false), [message,setMessage] = useState(""), [failure,setFailure] = useState<MutationFailure["status"] | null>(null);
 const [denied,setDenied] = useState(false);
 const [focusTarget,setFocusTarget] = useState<{kind: "override" | "resolution" | "current"; id: string} | null>(null);
 const action = useRef<{fingerprint: string; key: string} | null>(null);
 const scoreRef = useRef<HTMLInputElement>(null), reasonRef = useRef<HTMLTextAreaElement>(null), dispositionRef = useRef<HTMLSelectElement>(null);
 const currentRef = useRef<HTMLElement>(null), overrideRef = useRef<HTMLButtonElement>(null);
 const flagButtons = useRef(new Map<string,HTMLButtonElement>());
 const report = useReportWorkspaceAccessFailure();
 const access = (result: {status: string}) => { if (isWorkspaceAccessFailure(result)) { setDenied(true); report(result.status); return true; } return false; };
 function open(kind: "override" | "resolution", id: string) { setForm({kind,id}); setScore(""); setReason(""); setDisposition(""); setErrors({}); setFailure(null); setMessage(""); action.current=null; }
 function focusAction(target: typeof form) { if(target) setFocusTarget(target); }
 useLayoutEffect(() => {
  if (!focusTarget || pending || form) return;
  if (focusTarget.kind === "current") currentRef.current?.focus();
  else if (focusTarget.kind === "resolution") flagButtons.current.get(focusTarget.id)?.focus();
  else overrideRef.current?.focus();
 }, [focusTarget,pending,form]);
 async function reload() {
  if (pending) return;
  try { const result = await refresh(); if (access(result)) return; if (result.status === "ok") { setView(current => merge(current,result.submission)); setFailure(current => current === "unavailable" ? current : null); } else setMessage("We couldn't load this submission. Try again."); }
  catch { setMessage("We couldn't load this submission. Try again."); }
 }
 async function save() {
  if (!form || pending) return;
  const next: Record<string,string> = {};
  if (form.kind === "override") {
   if (!score.trim()) next.score="Enter a replacement score.";
   else if (!Number.isInteger(Number(score)) || Number(score)<0 || Number(score)>100) next.score="Enter a whole number from 0 to 100.";
  } else if (!["upheld","dismissed"].includes(disposition)) next.disposition="Select Upheld or Dismissed.";
  const trimmed = reason.trim();
  if (!trimmed) next.reason="Enter a reason."; else if ([...trimmed].length>2000) next.reason="Reason exceeds the allowed length.";
  setErrors(next);
  if (Object.keys(next).length) { if (next.score) scoreRef.current?.focus(); else if (next.disposition) dispositionRef.current?.focus(); else reasonRef.current?.focus(); return; }
  const payload = form.kind === "override" ? {score: Number(score),reason: trimmed} : {disposition: disposition as "upheld" | "dismissed",reason: trimmed};
  const fingerprint = JSON.stringify({form,payload});
  if (action.current?.fingerprint !== fingerprint) action.current={fingerprint,key: crypto.randomUUID()};
  setPending(true); setMessage(""); setFailure(null);
  try {
   const result = form.kind === "override" ? await saveOverride(form.id,payload as {score: number;reason: string},action.current.key) : await saveResolution(form.id,payload as {disposition: "upheld" | "dismissed";reason: string},action.current.key);
   if (access(result)) return;
   if (result.status === "ok") {
    if ("grading" in result) setView(current => merge(current,{...current,grading: result.grading}));
    else setView(current => merge(current,{...current,flags: current.flags.map(flag => flag.id === result.flag.id ? result.flag : flag)}));
    setMessage(form.kind === "override" ? "Grade override saved." : "Resolution saved."); setForm(null); action.current=null;
    if (form.kind === "override") setFocusTarget({kind: "current",id: view.id}); else focusAction(form);
   } else {
    // Only a confirmed rejection permits a new explicit attempt. A transport
    // failure may have committed; reads cannot settle that mutation's identity.
    if (result.status !== "unavailable") action.current=null;
    setFailure(result.status);
   }
  } catch { setFailure("unavailable"); }
  finally { setPending(false); }
 }
 const g = view.grading, complete = g.state === "completed" && g.original && g.effective;
 const errorProps = (field: string) => ({ "aria-invalid": errors[field] ? true : undefined, "aria-describedby": errors[field] ? `moderation-${field}-error` : undefined });
 const error = (field: string) => errors[field] && <p id={`moderation-${field}-error`}>{errors[field]}</p>;
 const history = [...g.overrides].sort((a,b) => a.auditOrder-b.auditOrder);
 const renderForm = (kind: "override" | "resolution") => <form className="moderation-form" noValidate onSubmit={e => {e.preventDefault(); void save();}}>
 <h3>{kind === "override" ? "Override grade" : "Resolve flag"}</h3>
 {kind === "override" ? <><p>Scores are out of 100. A reason is required and will be visible to the learner.</p><label htmlFor="moderation-score">Replacement score</label><input id="moderation-score" inputMode="numeric" required disabled={pending} ref={scoreRef} value={score} onChange={e => setScore(e.target.value)} {...errorProps("score")} />{error("score")}</> : <><label htmlFor="moderation-disposition">Disposition</label><select id="moderation-disposition" required disabled={pending} ref={dispositionRef} value={disposition} onKeyDown={event => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const options=["", "upheld", "dismissed"];
  const next=Math.max(0,Math.min(options.length-1,options.indexOf(disposition)+(event.key === "ArrowDown" ? 1 : -1)));
  setDisposition(options[next]);
 }} onChange={e => setDisposition(e.target.value)} {...errorProps("disposition")}><option value="">Select a disposition</option><option value="upheld">Upheld</option><option value="dismissed">Dismissed</option></select>{error("disposition")}</>}
 <label htmlFor="moderation-reason">Reason</label><textarea id="moderation-reason" required disabled={pending} ref={reasonRef} value={reason} onChange={e => setReason(e.target.value)} {...errorProps("reason")}/>{error("reason")}
 {pending && <p role="status">{kind === "override" ? "Saving override…" : "Saving resolution…"}</p>}
 <button className="button primary" type="submit" disabled={pending || failure === "invalid_state" || failure === "conflict" || failure === "idempotency_conflict"}>Save {kind}</button>
 <button className="button secondary" type="button" disabled={pending} onClick={() => {const previous=form;setForm(null);setFailure(null);setMessage("");action.current=null;focusAction(previous);}}>Cancel</button>
 {failure && <><p role="alert">{failure === "invalid_state" && kind === "override" ? "A completed assessment is required before overriding a grade." : ["conflict","invalid_state"].includes(failure) ? "This flag changed. Refresh before saving." : `We couldn't save this ${kind}. Try again.`}</p>{!["invalid_state","conflict","idempotency_conflict"].includes(failure) && <button className="button secondary" type="button" disabled={pending} onClick={() => void save()}>Try again</button>}</>}
 </form>;
 if (denied) return null;
 return <div className="ta-moderation ta-evidence">
 <section aria-label="Original assessment"><h2>Original assessment</h2>{complete ? <><p>{g.original!.score} / 100</p><p>{g.original!.passed ? "Pass" : "Fail"}</p><p>Pass mark: {g.original!.passMark}</p><dl><dt>Identification points</dt><dd>{g.original!.identificationPoints}</dd><dt>Explanation points</dt><dd>{g.original!.explanationPoints}</dd><dt>Fix points</dt><dd>{g.original!.fixPoints}</dd><dt>Matched flaws</dt><dd>{g.original!.matchedCount}</dd><dt>Missed flaws</dt><dd>{g.original!.missedCount}</dd></dl></> : <p>Assessment not available.</p>}</section>
 <section aria-label="Current grade" tabIndex={-1} ref={currentRef}><h2>Current grade</h2>{complete ? <><p>{g.effective!.score} / 100</p><p>{g.effective!.passed ? "Passed" : "Not passed"}</p><p>{g.effective!.source === "ta" ? "TA override" : "Original AI assessment"}</p></> : <p>Not available</p>}</section>
 {complete ? <button className="button secondary" ref={overrideRef} disabled={pending} onClick={() => open("override",view.id)}>Override grade</button> : <p>A completed assessment is required before overriding a grade.</p>}
 {form?.kind === "override" && renderForm("override")}
 {message && <p role="status">{message}</p>}
 <button className="button secondary" disabled={pending} onClick={() => void reload()}>Refresh submission</button>
 <section aria-label="Override history"><h2>Override history</h2>{!history.length ? <p>No TA overrides. The current grade is the original assessment.</p> : <ol>{history.map((row,i) => <li key={row.id}>{i === history.length-1 && <p>Current override</p>}<dl><dt>TA</dt><dd>{row.actorId}</dd><dt>Recorded</dt><dd><SubmissionTime value={row.createdAt}/></dd><dt>Replacement score</dt><dd>{row.score}</dd><dt>Reason</dt><dd>{row.reason}</dd></dl></li>)}</ol>}</section>
 {selectedFlagId && !view.flags.some(f => f.id===selectedFlagId) && <><p role="status">Flag not found.</p><Link prefetch={false} href="/ta/flags">Back to flagged submissions</Link></>}
 {!view.flags.length && !selectedFlagId && <p>No moderation flags.</p>}
 {view.flags.map(flag => { const rows=[...flag.resolutions].sort((a,b) => a.auditOrder-b.auditOrder); const comment=view.comments.find(c => c.id===flag.commentId); return <section key={flag.id} aria-label={flagLabels[flag.kind]} id={`flag-${flag.id}`}>
 <h2>{flagLabels[flag.kind]}</h2>{flag.id === selectedFlagId && <p>Selected flag</p>}<p>{stateLabel(flag.status)}</p>{flag.reason !== null && <p>{flag.reason}</p>}{comment && <p>Comment {comment.id}; Line {comment.line}</p>}
 <section aria-label="Resolution history"><h3>Resolution history</h3>{!rows.length ? <p>Awaiting TA review.</p> : <ol>{rows.map((row,i) => <li key={row.id}>{i === rows.length-1 && <p>Latest resolution</p>}<dl><dt>TA</dt><dd>{row.actorId}</dd><dt>Recorded</dt><dd><SubmissionTime value={row.createdAt}/></dd><dt>Disposition</dt><dd>{stateLabel(row.disposition)}</dd><dt>Reason</dt><dd>{row.reason}</dd></dl></li>)}</ol>}</section>
 <button className="button secondary" disabled={pending} ref={el => {if(el) flagButtons.current.set(flag.id,el); else flagButtons.current.delete(flag.id);}} onClick={() => open("resolution",flag.id)}>{flag.status === "open" ? "Resolve flag" : "Add correction"}</button>
 {form?.kind === "resolution" && form.id === flag.id && renderForm("resolution")}</section>;})}
 </div>;
}
