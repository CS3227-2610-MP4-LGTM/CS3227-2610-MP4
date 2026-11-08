"use client";

import { useSearchParams } from "next/navigation";
import type { CatalogueResult, ChallengePage } from "@/lib/learner/challenges";
import { ChallengeCatalogue } from "./challenge-catalogue";
import { readChallengeData } from "./client-reads";

async function readCatalogue(search: string): Promise<CatalogueResult> {
  const result = await readChallengeData<ChallengePage>(search ? `?${search}` : "");
  return result.status === "ok" ? { status: "ok", page: result.data } : result;
}

export function CataloguePage() {
  const params = new URLSearchParams(useSearchParams().toString());
  params.delete("limit");
  const notices = params.getAll("notice");
  const accountCreated = notices.length === 1 && notices[0] === "account-created";
  if (accountCreated) params.delete("notice");

  return <>
    <p className="eyebrow">Your workspace</p>
    <h1>Challenges</h1>
    {accountCreated && <p className="notice" role="status">Account created.</p>}
    <ChallengeCatalogue search={params.toString()} readPage={readCatalogue}
      navigate={href => window.history.pushState(null, "", href)} />
  </>;
}
