import { Suspense } from "react";
import { connection } from "next/server";
import { WorkspacePage } from "@/components/account/workspace-page";
import { LearnersRoute } from "@/components/ta/learners-route";
import { readLearner } from "@/server/ta/progress";
export const instant = false;
export default function Page({ params }: { params: Promise<{ learnerId: string }> }) {
  return <Suspense fallback={<main className="loading-shell" role="status">Loading learner performance…</main>}><RequestedLearner params={params} /></Suspense>;
}
async function RequestedLearner({ params }: { params: Promise<{ learnerId: string }> }) {
  await connection();
  const { learnerId } = await params;
  const learner = await readLearner(learnerId);
  return <WorkspacePage role="ta">{accountId => <LearnersRoute key={`${accountId}:${learnerId}`} learnerId={learnerId} initialLearner={learner} />}</WorkspacePage>;
}
