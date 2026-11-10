"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { WorkspaceLink } from "@/components/account/workspace-navigation";
import { historyHref, type SubmissionView } from "@/lib/learner/submissions";
import { ChallengeMetadata } from "./challenge-metadata";
import { ReviewDraft } from "./review-draft";

export function RetryReview({ submission }: { submission: SubmissionView }) {
  return <article className="challenge-workspace">
    <WorkspaceLink href={`${historyHref}/${submission.id}`} prefetch={false}>Back to result</WorkspaceLink>
    <header>
      <h1>Retry review</h1>
      <h2>{submission.challenge.title}</h2>
      <ChallengeMetadata challenge={submission.challenge} />
      <p>Attempt 2</p>
    </header>
    <ReviewDraft accountId={submission.learner.id} challenge={submission.challenge}
      previousSubmissionId={submission.id} initialComments={submission.comments} openSubmission={href => window.location.replace(href)} />
  </article>;
}

export function RetryReadAgain() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" className="button secondary" disabled={pending}
    onClick={() => startTransition(() => router.refresh())}>Try again</button>;
}
