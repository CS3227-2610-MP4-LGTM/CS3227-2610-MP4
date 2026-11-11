"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { authorChallengesHref } from "@/lib/author/drafts";
import {
  formatPublishedAt, publicationMessages, revisionHref, type AuthorPublication,
} from "@/lib/author/publication";

/** AUT-05.3: “Publication result” after a successful publication, with both routes onward. */
export function PublicationResult({ publication }: { publication: AuthorPublication }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Set after mount so the live region exists empty first and the result is announced (SYS-17.1).
  const [announced, setAnnounced] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnnounced(true);
  }, []);

  return <section className="author-screen" aria-labelledby="publication-heading">
    <h1 id="publication-heading" ref={headingRef} tabIndex={-1}>Publication result</h1>
    <div role="status" aria-live="polite" className="pending-status">
      {announced && publicationMessages.published}
    </div>
    <p>Revision {publication.revisionNumber}, published{" "}
      <time dateTime={publication.publishedAt}>{formatPublishedAt(publication.publishedAt)}</time>.</p>
    <div className="form-actions">
      <Link href={revisionHref(publication.id, publication.revisionId)} className="button primary">
        View published challenge
      </Link>
      <Link href={authorChallengesHref} className="button secondary">Back to challenges</Link>
    </div>
  </section>;
}
