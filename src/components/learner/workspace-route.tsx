"use client";

import { useRouter } from "next/navigation";
import type { AttemptResult, ChallengeResult, ChallengeView } from "@/lib/learner/challenges";
import { ChallengeWorkspace } from "./challenge-workspace";
import { readChallengeData } from "./client-reads";

async function readChallenge(id: string): Promise<ChallengeResult> {
  const result = await readChallengeData<ChallengeView>(`/${encodeURIComponent(id)}`);
  return result.status === "ok" ? { status: "ok", challenge: result.data } : result;
}

export function WorkspaceRoute({ accountId, challengeId, readFirstAttemptAction }: {
  accountId?: string;
  challengeId: string;
  readFirstAttemptAction: (id: string) => Promise<AttemptResult>;
}) {
  const router = useRouter();
  return <ChallengeWorkspace accountId={accountId} challengeId={challengeId}
    readChallenge={readChallenge} readFirstAttempt={readFirstAttemptAction}
    openSubmission={href => router.push(href)} />;
}
