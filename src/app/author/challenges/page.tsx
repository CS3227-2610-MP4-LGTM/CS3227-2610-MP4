import { Suspense } from "react";
import { connection } from "next/server";
import { WorkspacePage } from "@/components/account/workspace-page";
import { AuthorListRoute } from "@/components/author/author-routes";

export const instant = false;

export default function Page() {
  return <Suspense fallback={<main className="loading-shell" role="status">Loading challenges…</main>}>
    <RequestedList />
  </Suspense>;
}

async function RequestedList() {
  await connection();
  return <WorkspacePage role="author">{accountId => <AuthorListRoute key={accountId} />}</WorkspacePage>;
}
