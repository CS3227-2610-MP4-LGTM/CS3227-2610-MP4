"use client";
import Link from "next/link";
import { z } from "zod";
import { ModerationPanel } from "./moderation-panel";
import { saveOverride, saveResolution } from "./moderation-client";
import { useEffect, useRef } from "react";
import { CodeDiffView } from "@/components/code-diff";
import { categoryLabels } from "@/lib/learner/challenges";
import type { DetailResult } from "@/lib/ta/submissions";
import { useInspectionRead } from "./use-inspection-read";
import { stateLabel, SubmissionTime } from "./submission-list";
export function SubmissionDetail({ submissionId, search, readSubmission }: { submissionId: string; search: string; readSubmission: (id: string) => Promise<DetailResult> }) {
 const { result, refresh, denied } = useInspectionRead(submissionId, readSubmission);
 const heading = useRef<HTMLHeadingElement>(null);
 useEffect(() => { if (result?.status === "ok") heading.current?.focus(); }, [result]);
 if (denied) return null;
 const back = <Link prefetch={false} href="/ta/submissions">Back to submissions</Link>;
 if (!result) return <><p role="status">Loading submission…</p>{back}</>;
 if (result.status !== "ok") return <><p role={result.status === "not_found" ? "status" : "alert"}>{result.status === "not_found" ? "Submission not found." : "We couldn't load this submission. Try again."}</p>{result.status !== "not_found" && <button className="button secondary" onClick={refresh}>Try again</button>}{back}</>;
 const s = result.submission, g = s.grading, original = g.original;
 const params = new URLSearchParams(search);
 const contextValid = [...params.keys()].every(key => ["from", "learnerId", "flagId"].includes(key)) && params.getAll("from").length === 1 && params.getAll("learnerId").length <= 1 && params.getAll("flagId").length <= 1 && (!params.has("flagId") || (params.get("from") === "flags" && !params.has("learnerId") && z.uuid().safeParse(params.get("flagId")).success));
 const from = contextValid ? params.get("from") : null;
 return <article className="ta-evidence">
 <h1 tabIndex={-1} ref={heading}>Submission</h1>
 <div className="ta-return-links">{back}
 {from === "flags" && !params.has("learnerId") && <Link prefetch={false} href="/ta/flags">Back to flagged submissions</Link>}
 {from === "learner" && params.get("learnerId") === s.learner.id && <Link prefetch={false} href={`/ta/learners/${s.learner.id}`}>Back to learner</Link>}</div>
 <dl><dt>Learner</dt><dd><span>{s.learner.displayName}</span><br /><span>{s.learner.id}</span></dd><dt>Challenge</dt><dd>{s.challenge.title}</dd><dt>Attempt</dt><dd>{s.attemptNumber}</dd><dt>Submitted</dt><dd><SubmissionTime value={s.submittedAt} /></dd><dt>Grading status</dt><dd>{stateLabel(g.state)}</dd></dl>
 <CodeDiffView code={s.challenge.code} />
 <section aria-labelledby="comments-heading"><h2 id="comments-heading">Submitted comments</h2>
 {s.comments.length === 0 ? <p>No comments submitted.</p> : <ol className="ta-evidence-list" role="list">{s.comments.map(c => {
 const assessment = original?.comments.find(a => a.commentId === c.id);
 const matched = s.matching.matches.find(m => m.commentId === c.id);
 const status = s.matching.duplicateCommentIds.includes(c.id) ? "Duplicate" : s.matching.unmatchedCommentIds.includes(c.id) ? "Unmatched" : matched ? "Matched" : "Not assessed";
 return <li className="ta-evidence-card" key={c.id}><div className="ta-evidence-header"><h3>Line {c.line}</h3><span className="ta-match-status">{status}</span></div><p className="ta-comment-body">{c.body}</p>
 <dl><dt>Explanation credit</dt><dd>{assessment?.explanationCredit ?? "Not assessed"}</dd><dt>Fix credit</dt><dd>{assessment?.fixCredit ?? "Not assessed"}</dd><dt>Feedback</dt><dd>{assessment?.feedback ?? "Not assessed"}</dd></dl>
 {matched && <p>Matched flaw {matched.flawId}; distance {matched.distance}</p>}</li>;
 })}</ol>}</section>
 <section aria-labelledby="answer-key"><h2 id="answer-key">Private answer key</h2>
 <ol className="ta-evidence-list" role="list">{s.answerKey.map((f, index) => {
 const a = s.assessments.find(a => a.flawId === f.id);
 return <li className="ta-evidence-card" key={f.id}>
 <div className="ta-evidence-header">
 <h3><span className="ta-flaw-number" aria-hidden="true">{index + 1}</span>{categoryLabels[f.category]}</h3>
 <span className="ta-match-status">{s.matching.missedFlawIds.includes(f.id) ? "Missed flaw" : s.matching.matches.some(m => m.flawId === f.id) ? "Matched flaw" : "Not assessed"}</span>
 </div>
 <p className="ta-evidence-id">Flaw {f.id}</p>
 <p className="ta-line-reference">Source lines {f.sourceStartLine}–{f.sourceEndLine} · Final lines {f.startLine}–{f.endLine}</p>
 <div className="ta-snippet-pair">
 <div className="ta-snippet"><h4>Original snippet</h4><pre><code>{f.originalSnippet}</code></pre></div>
 <div className="ta-snippet"><h4>Replacement snippet</h4><pre><code>{f.replacementSnippet}</code></pre></div>
 </div>
 <dl><dt>Explanation</dt><dd>{f.explanation}</dd><dt>Suggested fix</dt><dd>{f.fix}</dd></dl>
 <div className="ta-flaw-assessment"><h4>Assessment</h4>
 <dl><dt>Comment</dt><dd className="ta-evidence-id">{a?.commentId ?? "Not assessed"}</dd><dt>Explanation credit</dt><dd>{a?.explanationCredit ?? "Not assessed"}</dd><dt>Fix credit</dt><dd>{a?.fixCredit ?? "Not assessed"}</dd><dt>Feedback</dt><dd>{a?.feedback ?? "Not assessed"}</dd></dl></div>
 </li>;
 })}</ol></section>
 <ModerationPanel submission={s} selectedFlagId={contextValid ? params.get("flagId") ?? undefined : undefined} saveOverride={saveOverride} saveResolution={saveResolution} refresh={() => readSubmission(submissionId)} />
 </article>;
}
