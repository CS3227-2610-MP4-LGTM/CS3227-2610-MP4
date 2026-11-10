"use client";
import { readTaData } from "./read-data";
import { accountAccessHeader } from "@/lib/learner/challenges";
import { workspaceAccountHeader } from "@/lib/learner/submissions";
import type { SummaryGenerationResult, SummaryReadResult, SummaryRecord } from "@/lib/ta/summaries";
export async function readSummary(id: string): Promise<SummaryReadResult> {
  const value = await readTaData<{ summary: SummaryRecord | null; stale: boolean }>(`learners/${encodeURIComponent(id)}/summary`);
  return value.status === "ok" ? { status: "ok", ...value.data } : value;
}
export function summaryGenerator(accountId: string) {
  return async (id: string, key: string): Promise<SummaryGenerationResult> => {
    const response = await fetch(`/api/v1/ta/learners/${encodeURIComponent(id)}/summaries`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", "Idempotency-Key": key, [workspaceAccountHeader]: accountId }, body: "{}" });
    if (response.ok) return { status: "ok", summary: (await response.json()).data };
    const access = response.headers.get(accountAccessHeader);
    if (response.status === 401) return { status: "unauthenticated" };
    if (response.status === 403) return { status: access === "account_unavailable" ? access : "role_denied" };
    if (response.status === 503 && access === "account_service_unavailable") return { status: access };
    return { status: "failed", code: (await response.json()).error?.code ?? "SERVICE_UNAVAILABLE" };
  };
}
