"use client";
import { useSearchParams } from "next/navigation";
import type { LearnerPageResult, LearnerResult, ProgressResult, RecommendationResult } from "@/lib/ta/progress";
import { LearnerList } from "./learner-list";
import { LearnerDetail } from "./learner-detail";
import { useCallback, useMemo } from "react";
import { SummaryPanel } from "./summary-panel";
import { readSummary, summaryGenerator } from "./summary-data";
import { readTaData } from "./read-data";
async function readPage(search: string): Promise<LearnerPageResult> {
  const result = await readTaData<Extract<LearnerPageResult, { status: "ok" }>["page"]>(`learners${search ? `?${search}` : ""}`);
  return result.status === "ok" ? { status: "ok", page: result.data } : result;
}
async function readProgress(id: string): Promise<ProgressResult> {
  const result = await readTaData<Extract<ProgressResult, { status: "ok" }>["progress"]>(`learners/${encodeURIComponent(id)}/progress`);
  return result.status === "ok" ? { status: "ok", progress: result.data } : result;
}
async function readRecommendations(id: string): Promise<RecommendationResult> {
  const result = await readTaData<Extract<RecommendationResult, { status: "ok" }>["recommendations"]>(`learners/${encodeURIComponent(id)}/recommendations`);
  return result.status === "ok" ? { status: "ok", recommendations: result.data } : result;
}
export function LearnersRoute({ learnerId, initialLearner, accountId = "" }: { learnerId?: string; initialLearner?: LearnerResult; accountId?: string }) {
  const search = useSearchParams().toString();
  const readLearner = useCallback(async (): Promise<LearnerResult> => initialLearner ?? { status: "unavailable" }, [initialLearner]);
  const generateSummary = useMemo(() => summaryGenerator(accountId), [accountId]);
  if (learnerId) return <LearnerDetail summaryPanel={<SummaryPanel learnerId={learnerId} readSummary={readSummary} generateSummary={generateSummary} />} learnerId={learnerId} readLearner={readLearner} onRetryIdentity={() => window.location.reload()} readProgress={readProgress} readRecommendations={readRecommendations} />;
  return <LearnerList search={search} readPage={readPage} navigate={href => window.history.pushState(null, "", href)} />;
}
