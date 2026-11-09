import { Suspense } from "react";
import { connection } from "next/server";
import { WorkspacePage } from "@/components/account/workspace-page";
import { LearnersRoute } from "@/components/ta/learners-route";
export const instant = false;
export default function Page() {
  return <Suspense fallback={<main className="loading-shell" role="status">Loading learners…</main>}><RequestedLearners /></Suspense>;
}
async function RequestedLearners() {
  await connection();
  return <WorkspacePage role="ta">{id => <LearnersRoute key={id} />}</WorkspacePage>;
}
