"use client";

import { useSearchParams } from "next/navigation";
import { accountAccessHeader } from "@/lib/learner/challenges";
import { submissionPageSchema, type HistoryResult } from "@/lib/learner/history";
import { HistoryList } from "./history-list";

async function readPage(search: string): Promise<HistoryResult> {
  try {
    const response = await fetch(`/api/v1/submissions${search ? `?${search}` : ""}`, { cache: "no-store" });
    if (response.ok) return { status: "ok", page: submissionPageSchema.parse((await response.json()).data) };
    const access = response.headers.get(accountAccessHeader);
    if (response.status === 400) return { status: "invalid" };
    if (response.status === 401) return { status: "unauthenticated" };
    if (response.status === 403) return { status: access === "account_unavailable" || access === "role_denied" ? access : "forbidden" };
    return { status: access === "account_service_unavailable" ? access : "unavailable" };
  } catch { return { status: "unavailable" }; }
}
export function HistoryPage() {
  const search = useSearchParams().toString();
  return <HistoryList search={search} readPage={readPage} navigate={href => window.history.pushState(null, "", href)} />;
}
