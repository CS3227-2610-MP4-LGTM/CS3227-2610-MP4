import type { SubmissionView } from "@/lib/learner/submissions";
import { passMark } from "@/lib/learner/grading";
import { flagLabels } from "@/lib/moderation/flags";

function Recorded({ at }: { at: string }) {
  return <><dt>Recorded</dt><dd><time dateTime={at}>{new Date(at).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}</time></dd></>;
}
export function ModerationHistory({ submission }: { submission: SubmissionView }) {
  const { grading, flags, comments } = submission;
  const overrides = grading.state === "completed"
    ? [...grading.overrides].sort((a, b) => a.auditOrder - b.auditOrder)
    : [];
  return <>
    <section aria-labelledby="current-grade">
      <h2 id="current-grade">Current grade</h2>
      {grading.state !== "completed" ? <p>Current grade not available.</p> : <>
        <p>{grading.effective.score} / 100</p>
        <p>{grading.effective.score >= passMark ? "Passed" : "Not passed"}</p>
        <p>{grading.effective.source === "ai" ? "Original AI assessment" : "TA override"}</p>
        <p>{overrides.length ? "A TA override determines the current grade." : "No TA overrides. The current grade is the original assessment."}</p>
      </>}
    </section>
    <section aria-labelledby="override-history">
      <h2 id="override-history">Override history</h2>
      {overrides.length === 0 ? <p>No TA overrides.</p> : <ol>{overrides.map((entry, index) => <li key={entry.id} className="review-comment">
        <p>TA action</p>
        {index === overrides.length - 1 && <p>Current override</p>}
        <dl><Recorded at={entry.createdAt} /><dt>Replacement score</dt><dd>{entry.score} / 100</dd>
          <dt>Reason</dt><dd className="review-comment-body">{entry.reason}</dd></dl>
      </li>)}</ol>}
    </section>
    <section aria-labelledby="moderation-flags">
      <h2 id="moderation-flags">Moderation flags</h2>
      {flags.length === 0 ? <p>No moderation flags.</p> : <ul>{flags.map(flag => {
        const resolutions = [...flag.resolutions].sort((a, b) => a.auditOrder - b.auditOrder);
        const comment = flag.kind === "learner_report" ? comments.find(comment => comment.id === flag.commentId) : undefined;
        return <li key={flag.id} className="review-comment">
          <h3>{flagLabels[flag.kind]}</h3>
          <p>{flag.status === "open" ? "Open" : "Resolved"}</p>
          <dl><Recorded at={flag.createdAt} />{flag.reason !== null && <><dt>Reason</dt><dd className="review-comment-body">{flag.reason}</dd></>}</dl>
          {comment && <><p>Line {comment.line}</p><p className="review-comment-body">{comment.body}</p></>}
          <h4>Resolution history</h4>
          {resolutions.length === 0 ? <p>Awaiting TA review.</p> : <ol>{resolutions.map((entry, index) => <li key={entry.id}>
            <p>TA action</p>{index === resolutions.length - 1 && <p>Latest resolution</p>}
            <dl><Recorded at={entry.createdAt} /><dt>Disposition</dt><dd>{entry.disposition === "upheld" ? "Upheld" : entry.disposition === "dismissed" ? "Dismissed" : entry.disposition}</dd>
              <dt>Reason</dt><dd className="review-comment-body">{entry.reason}</dd></dl>
          </li>)}</ol>}
        </li>;
      })}</ul>}
    </section>
  </>;
}
