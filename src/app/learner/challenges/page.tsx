import { Suspense } from "react";
import { connection } from "next/server";
import { WorkspacePage } from "@/components/account/workspace-page";
import { CataloguePage } from "@/components/learner/catalogue-page";

export const instant = false;

export default function Page() {
  return <Suspense fallback={<main className="loading-shell" role="status">Loading challenges…</main>}>
    <RequestedCatalogue />
  </Suspense>;
}

async function RequestedCatalogue() {
  await connection();
  return <WorkspacePage role="learner">{accountId => <CataloguePage key={accountId} />}</WorkspacePage>;
}
