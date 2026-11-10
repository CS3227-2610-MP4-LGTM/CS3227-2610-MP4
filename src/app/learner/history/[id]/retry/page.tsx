import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccessScreen } from "@/components/account/access-screen";
import { WorkspacePage } from "@/components/account/workspace-page";
import { RetryReadAgain, RetryReview } from "@/components/learner/retry-review";
import { catalogueHref } from "@/lib/learner/challenges";
import { retryUnavailableReason } from "@/lib/learner/feedback";
import { historyHref } from "@/lib/learner/submissions";
import { signOutAction } from "@/server/auth/actions";
import { signInNotice } from "@/server/auth/session-notice";
import { readLearnerResultWithRetry } from "@/server/learner/submissions";

export const instant = false;

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <div><Suspense fallback={<main className="loading-shell" role="status">Loading retry…</main>}>
    <RequestedRetry params={params} />
  </Suspense></div>;
}

async function RequestedRetry({ params }: { params: Promise<{ id: string }> }) {
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
    if (result.status !== "ok" || !result.retry) {
      return <section className="recovery-card">
        <h1>Retry unavailable</h1>
        <p role="alert">We couldn&apos;t load your retry. Try again.</p>
        <RetryReadAgain />
      </section>;
    }
    const { submission, retry } = result;
    const reason = submission.attemptNumber === 2
      ? "A second attempt cannot be retried."
      : retryUnavailableReason(submission, retry);
    if (reason) {
      return <section className="recovery-card">
        <h1>Retry unavailable</h1>
        <p>{reason}</p>
        <Link href={`${historyHref}/${submission.id}`} prefetch={false}>Back to result</Link>
      </section>;
    }
    return <RetryReview key={submission.id} submission={submission} />;
  }}</WorkspacePage>;
}
