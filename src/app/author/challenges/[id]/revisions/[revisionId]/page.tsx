import { Suspense } from "react";
import { connection } from "next/server";
import { WorkspacePage } from "@/components/account/workspace-page";
import { RevisionRoute } from "@/components/author/author-routes";

export const instant = false;

type Params = Promise<{ id: string; revisionId: string }>;

export default function Page({ params }: { params: Params }) {
  return <Suspense fallback={<main className="loading-shell" role="status">Loading published challenge…</main>}>
    <Requested params={params} />
  </Suspense>;
}

async function Requested({ params }: { params: Params }) {
  await connection();
  const { id, revisionId } = await params;
  return <WorkspacePage role="author">
    {accountId => <RevisionRoute key={`${accountId}:${id}:${revisionId}`} challengeId={id} revisionId={revisionId} />}
  </WorkspacePage>;
}
