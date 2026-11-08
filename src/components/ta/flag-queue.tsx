"use client";
import Link from "next/link";
import { useState } from "react";
import { flagLabels, type FlagPageResult } from "@/lib/ta/moderation";
import { useInspectionRead } from "./use-inspection-read";
import { SubmissionTime, stateLabel } from "./submission-list";
function Filters({ search, navigate }: {search: string; navigate: (href: string) => void}) {
 const params = new URLSearchParams(search);
 const [status,setStatus] = useState(params.get("status") ?? "open"), [kind,setKind] = useState(params.get("kind") ?? "");
 return <form className="challenge-filters" onSubmit={event => { event.preventDefault(); const next = new URLSearchParams({ status }); if (kind) next.set("kind",kind); navigate(`/ta/flags?${next}`); }}>
 <label htmlFor="flag-status">Status</label><select id="flag-status" value={status} onChange={e => setStatus(e.target.value)}><option value="open">Open</option><option value="resolved">Resolved</option></select>
 <label htmlFor="flag-kind">Flag reason</label><select id="flag-kind" value={kind} onChange={e => setKind(e.target.value)}><option value="">All</option>{Object.entries(flagLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
 <button className="button primary" type="submit">Apply filters</button></form>;
}
export function FlagQueue({ search, readPage, navigate }: { search: string; readPage: (search: string) => Promise<FlagPageResult>; navigate: (href: string) => void }) {
 const { result,refresh,denied } = useInspectionRead(search,readPage);
 const params = new URLSearchParams(search), filtered = params.has("kind") || (params.has("status") && params.get("status") !== "open");
 const page = (cursor?: string) => { if (cursor) params.set("cursor",cursor); else params.delete("cursor"); navigate(params.size ? `/ta/flags?${params}` : "/ta/flags"); };
 if (denied) return null;
 return <><h1>Flagged submissions</h1><Filters key={search} search={search} navigate={navigate}/>
 {!result ? <p role="status">Loading flagged submissions…</p> : result.status === "invalid" ? <p role="alert">This queue page isn&apos;t valid.</p> : result.status !== "ok" ? <><p role="alert">We couldn&apos;t load flagged submissions. Try again.</p><button className="button secondary" onClick={refresh}>Try again</button></> : !result.page.items.length ? <><p role="status">{filtered ? "No flags match these filters." : "No flagged submissions."}</p>{filtered && <button className="button secondary" onClick={() => navigate("/ta/flags")}>Show open flags</button>}</> : <ul className="challenge-list">{result.page.items.map(flag => <li className="challenge-card ta-evidence" key={flag.id}><dl><dt>Submission</dt><dd>{flag.submissionId}</dd><dt>Flag reason</dt><dd>{flagLabels[flag.kind]}</dd><dt>Status</dt><dd>{stateLabel(flag.status)}</dd><dt>Recorded</dt><dd><SubmissionTime value={flag.createdAt}/></dd></dl>{flag.reason !== null && <p>{flag.reason}</p>}<Link prefetch={false} href={`/ta/submissions/${flag.submissionId}?from=flags&flagId=${flag.id}`}>View submission</Link></li>)}</ul>}
 {(params.has("cursor") || result?.status === "invalid") && <button className="button secondary" disabled={!result} onClick={() => page()}>First page</button>}
 {result?.status === "ok" && result.page.nextCursor && <button className="button secondary" onClick={() => page(result.page.nextCursor!)}>Next page</button>}</>;
}
