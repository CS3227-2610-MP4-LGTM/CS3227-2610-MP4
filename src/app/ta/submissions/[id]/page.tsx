import { Suspense } from "react";
import { connection } from "next/server";
import { WorkspacePage } from "@/components/account/workspace-page";
import { InspectionRoute } from "@/components/ta/inspection-route";
export const instant = false;
export default function Page({ params }: { params: Promise<{ id: string }> }) {
 return <Suspense fallback={<main className="loading-shell" role="status">Loading submission…</main>}><RequestedSubmission params={params} /></Suspense>;
}
async function RequestedSubmission({ params }: { params: Promise<{ id: string }> }) {
 await connection();
 const { id } = await params;
 return <WorkspacePage role="ta">{accountId => <InspectionRoute key={accountId} submissionId={id} />}</WorkspacePage>;
}
