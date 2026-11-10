import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccessScreen } from "@/components/account/access-screen";
import { WorkspacePage } from "@/components/account/workspace-page";
import { GradingResultRoute } from "@/components/learner/grading-result";
import { catalogueHref } from "@/lib/learner/challenges";
import { historyHref } from "@/lib/learner/submissions";
import { signOutAction } from "@/server/auth/actions";
import { signInNotice } from "@/server/auth/session-notice";
import { readLearnerResultWithRetry } from "@/server/learner/submissions";

export const instant = false;

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<main className="loading-shell" role="status">Loading review result…</main>}>
    <RequestedReview params={params} />
  </Suspense>;
}

async function RequestedReview({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const result = await readLearnerResultWithRetry(id);
  if (result.status === "unauthenticated") redirect(`/sign-in?notice=${await signInNotice()}`);
  if (result.status === "account_unavailable" || result.status === "account_service_unavailable") {
    return <main className="account-shell">
      <AccessScreen kind={result.status === "account_unavailable" ? "account-unavailable" : "service-unavailable"}
        signOutAction={signOutAction} />
    </main>;
  }
  return <WorkspacePage role="learner">{accountId => {
    if (result.status === "forbidden" || result.status === "role_denied"
      || (result.status === "ok" && result.submission.learner.id !== accountId)) {
      return <AccessScreen kind="record-denied" workspaceHref={catalogueHref} />;
    }
    if (result.status === "not_found" || result.status === "invalid") {
      return <section className="recovery-card">
        <h1>Review not found</h1>
        <p>We couldn&apos;t find this review.</p>
        <Link href={historyHref}>Review history</Link>
      </section>;
    }
    return <GradingResultRoute key={id} submissionId={id} accountId={accountId}
      initialSubmission={result.status === "ok" ? result.submission : undefined}
      published={result.status === "ok" ? result.retry?.published : undefined}
      secondSubmissionId={result.status === "ok" ? result.retry?.secondSubmissionId : undefined}
      initialReadFailed={result.status === "unavailable"} />;
  }}</WorkspacePage>;
}
