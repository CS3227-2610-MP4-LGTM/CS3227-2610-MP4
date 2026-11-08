import { Suspense } from "react";
import { connection } from "next/server";
import { WorkspacePage } from "@/components/account/workspace-page";
import { WorkspaceRoute } from "@/components/learner/workspace-route";
import { readFirstAttemptAction } from "./actions";

export const instant = false;

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<main className="loading-shell" role="status">Loading challenge…</main>}>
    <RequestedChallenge params={params} />
  </Suspense>;
}

async function RequestedChallenge({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  return <WorkspacePage role="learner">{accountId =>
    <WorkspaceRoute key={accountId} challengeId={id} readFirstAttemptAction={readFirstAttemptAction} />
  }</WorkspacePage>;
}
