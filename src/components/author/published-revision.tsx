import Link from "next/link";
import { CodeDiffView } from "@/components/code-diff";
import { authorChallengesHref, labelFor } from "@/lib/author/drafts";
import { formatPublishedAt, type AuthorRevision } from "@/lib/author/publication";
import { categoryLabels, difficultyLabels } from "@/lib/learner/challenges";

const range = (start: number, end: number) => start === end ? `Line ${start}` : `Lines ${start}–${end}`;

/**
 * AUT-05.3: the owning Author's view of one immutable revision: the real
 * working-to-flawed diff, the retained answer key and its hints. All stored
 * text renders as plain React text (SEC-02.2).
 */
export function PublishedRevision({ revision }: { revision: AuthorRevision }) {
  const { publication, challenge, answerKey, hints } = revision;
  return <section className="author-screen" aria-labelledby="revision-heading">
    <p className="eyebrow">Published challenge</p>
    <h1 id="revision-heading">{challenge.title}</h1>
    <p>Revision {publication.revisionNumber}, published{" "}
      <time dateTime={publication.publishedAt}>{formatPublishedAt(publication.publishedAt)}</time>.</p>
    <dl className="detail-list">
      <dt>Difficulty</dt><dd>{labelFor(difficultyLabels, challenge.difficulty)}</dd>
    </dl>
    <p>{challenge.description}</p>
    <h2>Code changes</h2>
    <CodeDiffView code={challenge.code} label="Published code changes" showPath={false} />
    <h2>Answer key</h2>
    <ol>
      {answerKey.map(flaw => <li key={flaw.id}>
        <h3>{labelFor(categoryLabels, flaw.category)}</h3>
        <p>{range(flaw.startLine, flaw.endLine)}</p>
        <p>Explanation: {flaw.explanation}</p>
        <p>Fix: {flaw.fix}</p>
        <h4>Hint</h4>
        {hints.filter(hint => hint.flawId === flaw.id).map(hint => <p key={hint.id}>{hint.text}</p>)}
      </li>)}
    </ol>
    <div className="form-actions">
      <Link href={authorChallengesHref} className="button secondary">Back to challenges</Link>
    </div>
  </section>;
}
