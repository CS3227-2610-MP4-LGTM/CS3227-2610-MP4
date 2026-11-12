import { Suspense } from "react";
import { connection } from "next/server";
import { WorkspacePage } from "@/components/account/workspace-page";
import { HistoryPage } from "@/components/learner/history-page";

export const instant = false;
export default function Page() {
  return <Suspense fallback={<main className="loading-shell" role="status">Loading review history…</main>}>
    <RequestedHistory />
  </Suspense>;
}
async function RequestedHistory() {
  await connection();
  return <WorkspacePage role="learner">{accountId => <HistoryPage key={accountId} />}</WorkspacePage>;
}
