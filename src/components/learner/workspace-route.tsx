"use client";

import type { AttemptResult, ChallengeResult, ChallengeView } from "@/lib/learner/challenges";
import { ChallengeWorkspace } from "./challenge-workspace";
import { readChallengeData } from "./client-reads";

async function readChallenge(id: string): Promise<ChallengeResult> {
  const result = await readChallengeData<ChallengeView>(`/${encodeURIComponent(id)}`);
  return result.status === "ok" ? { status: "ok", challenge: result.data } : result;
}

export function WorkspaceRoute({ challengeId, readFirstAttemptAction }: {
  challengeId: string;
  readFirstAttemptAction: (id: string) => Promise<AttemptResult>;
}) {
  return <ChallengeWorkspace challengeId={challengeId}
    readChallenge={readChallenge} readFirstAttempt={readFirstAttemptAction} />;
}
