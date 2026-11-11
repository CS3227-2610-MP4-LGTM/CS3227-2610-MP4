"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import {
  authorChallengesHref, challengeHref, labelFor, lifecycleStatuses, statusLabels,
  type ChallengeCardView, type ChallengePageOutcome, type LifecycleStatus,
} from "@/lib/author/drafts";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { difficultyLabels, languageLabels } from "@/lib/learner/challenges";

type Listing =
  | { status: "loading" }
  | { status: "ok"; items: ChallengeCardView[]; nextCursor: string | null; more: "idle" | "loading" | "failed" }
  | { status: "invalid" | "unavailable" | "denied" };

export function AuthorChallengeList({ search, readPage, navigate }: {
  search: string;
  readPage: (search: string) => Promise<ChallengePageOutcome>;
  navigate: (href: string) => void;
}) {
  const reportAccessFailure = useReportWorkspaceAccessFailure();
  const [listing, setListing] = useState<Listing>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const request = useRef({ cancelled: true });
  const statusParam = new URLSearchParams(search).get("status");
  const filter = (lifecycleStatuses as readonly string[]).includes(statusParam ?? "") ? statusParam as LifecycleStatus : "";
  const filtered = new URLSearchParams(search).has("status");

  async function read(query: string): Promise<ChallengePageOutcome> {
    try {
      return await readPage(query);
    } catch {
      return { status: "unavailable" };
    }
  }

  useEffect(() => {
    // A new search, explicit retry or reveal starts a fresh first page. This
    // effect's generation also gates "Load more" replies started from its page.
    const generation = { cancelled: false };
    request.current = generation;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListing({ status: "loading" });
    void read(search).then(result => {
      if (generation.cancelled) return;
      if (result.status === "ok" && result.page) {
        setListing({ status: "ok", items: result.page.items, nextCursor: result.page.nextCursor, more: "idle" });
      } else if (isWorkspaceAccessFailure(result)) {
        setListing({ status: "denied" });
        reportAccessFailure(result.status);
      } else {
        setListing({ status: result.status === "invalid" ? "invalid" : "unavailable" });
      }
    });
    // Hidden (Activity) routes keep no stale list; showing the route again rereads it.
    return () => {
      generation.cancelled = true;
      setListing({ status: "loading" });
    };
    // `read` only closes over readPage, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, attempt, readPage, reportAccessFailure]);

  async function loadMore() {
    if (listing.status !== "ok" || !listing.nextCursor || listing.more === "loading") return;
    const generation = request.current;
    const params = new URLSearchParams(search);
    params.set("cursor", listing.nextCursor);
    setListing({ ...listing, more: "loading" });
    const result = await read(params.toString());
    if (generation.cancelled) return;
    if (result.status === "ok" && result.page) {
      setListing({ status: "ok", items: [...listing.items, ...result.page.items], nextCursor: result.page.nextCursor, more: "idle" });
    } else {
      if (isWorkspaceAccessFailure(result)) reportAccessFailure(result.status);
      setListing({ ...listing, more: "failed" });
    }
  }

  const clearFilter = <button type="button" className="button secondary" onClick={() => navigate(authorChallengesHref)}>Clear filter</button>;

  return <section className="challenge-results" aria-label="My challenges">
    <div className="list-toolbar">
      <div className="field">
        <label htmlFor="author-status-filter">Status</label>
        <select id="author-status-filter" value={filter}
          onChange={event => navigate(event.target.value ? `${authorChallengesHref}?status=${event.target.value}` : authorChallengesHref)}>
          <option value="">All statuses</option>
          {lifecycleStatuses.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
        </select>
      </div>
      <Link href={`${authorChallengesHref}/new`} className="button primary">Create challenge</Link>
    </div>
    {listing.status === "loading" && <p role="status" className="muted">Loading your challenges…</p>}
    {listing.status === "unavailable" && <div role="alert" className="notice error-notice">
      <p>We couldn&apos;t load your challenges. Try again.</p>
      <button type="button" className="button secondary" onClick={() => setAttempt(value => value + 1)}>Try again</button>
    </div>}
    {listing.status === "invalid" && <div role="alert" className="notice error-notice">
      <p>This filter isn&apos;t valid.</p>{clearFilter}
    </div>}
    {listing.status === "ok" && listing.items.length === 0 && (filtered
      ? <div className="empty-state" role="status"><h2>No matching challenges.</h2>{clearFilter}</div>
      : <div className="empty-state" role="status"><h2>No challenges yet.</h2></div>)}
    {listing.status === "ok" && listing.items.length > 0 && <>
      <ul className="challenge-list">
        {listing.items.map(item => <li key={item.id} className="challenge-card">
          <h2>{item.title}</h2>
          <dl className="challenge-metadata">
            <dt>Status</dt><dd>{labelFor(statusLabels, item.status)}</dd>
            <dt>Language</dt><dd>{labelFor(languageLabels, item.language)}</dd>
            <dt>Difficulty</dt><dd>{labelFor(difficultyLabels, item.difficulty)}</dd>
          </dl>
          <Link href={challengeHref(item.id)}>View challenge</Link>
        </li>)}
      </ul>
      {listing.more === "failed" && <p role="alert" className="notice error-notice">We couldn&apos;t load more challenges. Try again.</p>}
      {listing.nextCursor && <div className="challenge-pagination">
        <button type="button" className="button secondary" disabled={listing.more === "loading"} onClick={() => void loadMore()}>
          {listing.more === "loading" ? "Loading more…" : "Load more"}
        </button>
      </div>}
    </>}
  </section>;
}
