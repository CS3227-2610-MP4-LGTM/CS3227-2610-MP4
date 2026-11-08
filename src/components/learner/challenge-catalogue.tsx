"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  catalogueHref, categoryLabels, difficultyLabels, languageLabels, type CatalogueResult,
} from "@/lib/learner/challenges";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { ChallengeMetadata } from "./challenge-metadata";

const filters = {
  language: { label: "Language", all: "All languages", options: languageLabels },
  difficulty: { label: "Difficulty", all: "All difficulties", options: difficultyLabels },
  category: { label: "Flaw category", all: "All categories", options: categoryLabels },
};

export function ChallengeCatalogue({ search, navigate, readPage }: {
  search: string;
  navigate: (href: string) => void;
  readPage: (search: string) => Promise<CatalogueResult>;
}) {
  const [retry, setRetry] = useState(0);
  const request = useMemo(() => ({ search, retry }), [search, retry]);
  const [settled, setSettled] = useState<{ request: typeof request; result: CatalogueResult }>();
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterPage = useRef<string | null>(null);
  const reportAccessFailure = useReportWorkspaceAccessFailure();

  useEffect(() => {
    let active = true;
    const settle = (result: CatalogueResult) => {
      if (active) setSettled({ request, result });
    };
    readPage(request.search).then(settle, () => settle({ status: "unavailable" }));
    return () => {
      active = false;
      setSettled(undefined);
    };
  }, [readPage, request]);

  const result = settled?.request === request ? settled.result : undefined;
  useEffect(() => {
    if (result && isWorkspaceAccessFailure(result)) {
      reportAccessFailure(result.status);
    } else if (result?.status === "forbidden") {
      // The catalogue RPC can deny a caller whose profile changed during the read.
      reportAccessFailure("role_denied");
    } else if (result && focusAfterPage.current === search) {
      focusAfterPage.current = null;
      heading.current?.focus();
    }
  }, [reportAccessFailure, result, search]);

  const params = new URLSearchParams(search);
  const hasFilters = Object.keys(filters).some(key => params.has(key));
  const hasCursor = params.has("cursor");
  const pending = result === undefined;
  const nextCursor = result?.status === "ok" ? result.page.nextCursor : null;

  function goToPage(cursor: string | null) {
    if (cursor) params.set("cursor", cursor);
    else params.delete("cursor");
    const nextSearch = params.toString();
    focusAfterPage.current = nextSearch;
    navigate(nextSearch ? `${catalogueHref}?${nextSearch}` : catalogueHref);
  }

  function changeFilter(key: string, value: string) {
    focusAfterPage.current = null;
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("cursor");
    const nextSearch = params.toString();
    navigate(nextSearch ? `${catalogueHref}?${nextSearch}` : catalogueHref);
  }

  function clearFilters() {
    focusAfterPage.current = null;
    navigate(catalogueHref);
  }

  if (result && (isWorkspaceAccessFailure(result) || result.status === "forbidden")) return null;

  return <>
    <div className="challenge-filters">
      {Object.entries(filters).map(([key, { label, all, options }]) => (
        <label key={key}>{label}
          <select value={params.get(key) ?? ""} onChange={event => changeFilter(key, event.target.value)}>
            <option value="">{all}</option>
            {Object.entries(options).map(([value, text]) => <option value={value} key={value}>{text}</option>)}
          </select>
        </label>
      ))}
    </div>
    <section className="challenge-results" aria-labelledby="challenge-results-heading">
      <h2 id="challenge-results-heading" tabIndex={-1} ref={heading}>Results</h2>
      {(hasFilters || result?.status === "invalid") &&
        <button type="button" className="button secondary" onClick={clearFilters}>Clear filters</button>}
      {pending ? <p role="status">Loading challenges…</p>
        : result.status === "invalid" ? <p role="alert">These filters or this page aren&apos;t valid.</p>
          : result.status !== "ok" ? <>
            <p role="alert">We couldn&apos;t load challenges. Try again.</p>
            <button type="button" className="button secondary" onClick={() => setRetry(value => value + 1)}>Try again</button>
          </>
            : result.page.items.length === 0 ? (
              <div className="empty-state" role="status">
                <h3>{hasFilters ? "No challenges match these filters." : "No challenges available."}</h3>
              </div>
            ) : (
              <ul className="challenge-list">{result.page.items.map(challenge =>
                <li className="challenge-card" key={challenge.id}>
                  <h3>{challenge.title}</h3>
                  <ChallengeMetadata challenge={challenge} />
                  <Link prefetch={false} href={`${catalogueHref}/${challenge.id}`}>View challenge</Link>
                </li>,
              )}</ul>
            )}
      {(hasCursor || nextCursor) && <div className="challenge-pagination">
        {hasCursor && <button type="button" className="button secondary" disabled={pending}
          onClick={() => goToPage(null)}>First page</button>}
        {nextCursor && <button type="button" className="button secondary" onClick={() => goToPage(nextCursor)}>Next page</button>}
      </div>}
    </section>
  </>;
}
