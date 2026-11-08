"use client";
import Link from "next/link";
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
 const contextValid = [...params.keys()].every(key => ["from", "learnerId"].includes(key)) && params.getAll("from").length === 1 && params.getAll("learnerId").length <= 1;
 const from = contextValid ? params.get("from") : null;
 const complete = g.state === "completed" && original && g.effective;
 return <article className="ta-evidence">
 <h1 tabIndex={-1} ref={heading}>Submission</h1>
 <div className="ta-return-links">{back}
 {from === "flags" && !params.has("learnerId") && <Link prefetch={false} href="/ta/flags">Back to flagged submissions</Link>}
 {from === "learner" && params.get("learnerId") === s.learner.id && <Link prefetch={false} href={`/ta/learners/${s.learner.id}`}>Back to learner</Link>}</div>
 <dl><dt>Learner</dt><dd><span>{s.learner.displayName}</span><br /><span>{s.learner.id}</span></dd><dt>Challenge</dt><dd>{s.challenge.title}</dd><dt>Attempt</dt><dd>{s.attemptNumber}</dd><dt>Submitted</dt><dd><SubmissionTime value={s.submittedAt} /></dd><dt>Grading status</dt><dd>{stateLabel(g.state)}</dd></dl>
 <CodeDiffView code={s.challenge.code} />
 <section aria-labelledby="comments-heading"><h2 id="comments-heading">Submitted comments</h2>
 {s.comments.length === 0 ? <p>No comments submitted.</p> : <ol>{s.comments.map(c => {
 const assessment = original?.comments.find(a => a.commentId === c.id);
 const matched = s.matching.matches.find(m => m.commentId === c.id);
 const status = s.matching.duplicateCommentIds.includes(c.id) ? "Duplicate" : s.matching.unmatchedCommentIds.includes(c.id) ? "Unmatched" : matched ? "Matched" : "Not assessed";
 return <li key={c.id}><h3>Line {c.line}</h3><p>{c.body}</p><p>{status}</p>
 <dl><dt>Explanation credit</dt><dd>{assessment?.explanationCredit ?? "Not assessed"}</dd><dt>Fix credit</dt><dd>{assessment?.fixCredit ?? "Not assessed"}</dd><dt>Feedback</dt><dd>{assessment?.feedback ?? "Not assessed"}</dd></dl>
 {matched && <p>Matched flaw {matched.flawId}; distance {matched.distance}</p>}</li>;
 })}</ol>}</section>
 <section aria-labelledby="original-assessment"><h2 id="original-assessment">Original assessment</h2>
 {complete ? <><p>{original.score} / 100</p><p>{original.passed ? "Pass" : "Fail"}</p><p>Pass mark: {original.passMark}</p>
 <dl><dt>Identification points</dt><dd>{original.identificationPoints}</dd><dt>Explanation points</dt><dd>{original.explanationPoints}</dd><dt>Fix points</dt><dd>{original.fixPoints}</dd><dt>Matched flaws</dt><dd>{original.matchedCount}</dd><dt>Missed flaws</dt><dd>{original.missedCount}</dd></dl></> : <p>Assessment not available.</p>}</section>
 <section aria-labelledby="current-grade"><h2 id="current-grade">Current grade</h2>
 {complete ? <><p>{g.effective!.score} / 100</p><p>{g.effective!.passed ? "Pass" : "Fail"}</p><p>{g.effective!.source === "ta" ? "TA override" : "Original AI assessment"}</p></> : <p>Not available</p>}
 </section>
 <button className="button secondary" onClick={refresh}>Refresh submission</button>
 <section aria-labelledby="answer-key"><h2 id="answer-key">Private answer key</h2><ol>{s.answerKey.map(f => {
 const a = s.assessments.find(a => a.flawId === f.id);
 return <li key={f.id}><h3>{categoryLabels[f.category]}</h3><p>Flaw {f.id}</p><p>Source lines {f.sourceStartLine}–{f.sourceEndLine}; final lines {f.startLine}–{f.endLine}</p>
 <p>Original snippet</p><pre>{f.originalSnippet}</pre><p>Replacement snippet</p><pre>{f.replacementSnippet}</pre><p>{f.explanation}</p><p>{f.fix}</p>
 <p>{s.matching.missedFlawIds.includes(f.id) ? "Missed flaw" : s.matching.matches.some(m => m.flawId === f.id) ? "Matched flaw" : "Not assessed"}</p>
 <dl><dt>Comment</dt><dd>{a?.commentId ?? "Not assessed"}</dd><dt>Explanation credit</dt><dd>{a?.explanationCredit ?? "Not assessed"}</dd><dt>Fix credit</dt><dd>{a?.fixCredit ?? "Not assessed"}</dd><dt>Feedback</dt><dd>{a?.feedback ?? "Not assessed"}</dd></dl></li>;
 })}</ol></section>
 <section aria-labelledby="moderation-evidence"><h2 id="moderation-evidence">Moderation evidence</h2>
 <p>Grade overrides: {g.overrides.length}</p><p>Flags: {s.flags.length}</p>
 <Link prefetch={false} href="/ta/flags">Flagged submissions</Link>
 </section>
 </article>;
}
