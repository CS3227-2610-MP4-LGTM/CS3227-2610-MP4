import { Suspense } from "react";
import { connection } from "next/server";
import { WorkspacePage } from "@/components/account/workspace-page";
import { FlagsRoute } from "@/components/ta/flags-route";
export const instant = false;
export default function Page() {
 return <Suspense fallback={<main className="loading-shell" role="status">Loading flagged submissions…</main>}><RequestedFlags/></Suspense>;
}
async function RequestedFlags() {
 await connection();
 return <WorkspacePage role="ta">{id => <FlagsRoute key={id}/>}</WorkspacePage>;
}
