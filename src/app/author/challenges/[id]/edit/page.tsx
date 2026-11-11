import { Suspense } from "react";
import { connection } from "next/server";
import { WorkspacePage } from "@/components/account/workspace-page";
import { EditDraftRoute } from "@/components/author/author-routes";

export const instant = false;

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<main className="loading-shell" role="status">Loading draft…</main>}>
    <Requested params={params} />
  </Suspense>;
}

async function Requested({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  return <WorkspacePage role="author">{accountId => <EditDraftRoute key={`${accountId}:${id}`} challengeId={id} accountId={accountId} />}</WorkspacePage>;
}
