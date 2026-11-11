import { Suspense } from "react";
import { connection } from "next/server";
import { WorkspacePage } from "@/components/account/workspace-page";
import { CreateChallengeRoute } from "@/components/author/author-routes";

export const instant = false;

export default function Page() {
  return <Suspense fallback={<main className="loading-shell" role="status">Loading form…</main>}>
    <RequestedForm />
  </Suspense>;
}

async function RequestedForm() {
  await connection();
  return <WorkspacePage role="author">{accountId => <CreateChallengeRoute key={accountId} accountId={accountId} />}</WorkspacePage>;
}
