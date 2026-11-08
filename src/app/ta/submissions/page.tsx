import { Suspense } from "react";
import { connection } from "next/server";
import { WorkspacePage } from "@/components/account/workspace-page";
import { InspectionRoute } from "@/components/ta/inspection-route";
export const instant = false;
export default function Page() {
 return <Suspense fallback={<main className="loading-shell" role="status">Loading submissions…</main>}><RequestedSubmissions /></Suspense>;
}
async function RequestedSubmissions() {
 await connection();
 return <WorkspacePage role="ta">{id => <InspectionRoute key={id} />}</WorkspacePage>;
}
