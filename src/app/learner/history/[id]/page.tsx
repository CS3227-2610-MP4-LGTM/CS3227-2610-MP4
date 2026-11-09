import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccessScreen } from "@/components/account/access-screen";
import { WorkspacePage } from "@/components/account/workspace-page";
import { CodeDiffView } from "@/components/code-diff";
import { ChallengeMetadata } from "@/components/learner/challenge-metadata";
import { catalogueHref } from "@/lib/learner/challenges";
import { historyHref } from "@/lib/learner/submissions";
import { signOutAction } from "@/server/auth/actions";
import { signInNotice } from "@/server/auth/session-notice";
import { readLearnerSubmissionWithAccess } from "@/server/learner/submissions";

export const instant = false;

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<main className="loading-shell" role="status">Loading review…</main>}>
    <RequestedReview params={params} />
  </Suspense>;
}

async function RequestedReview({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const result = await readLearnerSubmissionWithAccess(id);
  if (result.status === "unauthenticated") redirect(`/sign-in?notice=${await signInNotice()}`);
  if (result.status === "account_unavailable" || result.status === "account_service_unavailable") {
    return <main className="account-shell">
      <AccessScreen kind={result.status === "account_unavailable" ? "account-unavailable" : "service-unavailable"}
        signOutAction={signOutAction} />
    </main>;
  }
  return <WorkspacePage role="learner"><ReviewResult result={result} /></WorkspacePage>;
}

function ReviewResult({ result }: { result: Awaited<ReturnType<typeof readLearnerSubmissionWithAccess>> }) {
  if (result.status === "forbidden" || result.status === "role_denied") {
    return <AccessScreen kind="record-denied" workspaceHref={catalogueHref} />;
  }
  if (result.status !== "ok") {
    const missing = result.status === "not_found" || result.status === "invalid";
    return <section className="recovery-card">
      <h1>{missing ? "Review not found" : "Review unavailable"}</h1>
      <p role="alert">{missing ? "We couldn't find this review." : "We couldn't load this review. Try again."}</p>
      <Link href={historyHref}>Review history</Link>
    </section>;
  }
  const { challenge, comments } = result.submission;
  return <article className="challenge-workspace">
    <Link href={historyHref}>Review history</Link>
    <header>
      <h1>{challenge.title}</h1>
      <ChallengeMetadata challenge={challenge} />
    </header>
    <p role="status">Grading pending</p>
    <CodeDiffView code={challenge.code} />
    <section aria-labelledby="submitted-comments">
      <h2 id="submitted-comments">Submitted comments</h2>
      {comments.length ? <ol>
        {comments.map(comment => <li className="review-comment" key={comment.id}>
          <p className="field-help">Line {comment.line}</p>
          <p className="review-comment-body">{comment.body}</p>
        </li>)}
      </ol> : <p>No comments submitted.</p>}
    </section>
  </article>;
}
