import type { ChallengeView } from "@/lib/learner/challenges";
import { challengeHref } from "./drafts";
import type { RevisionFlawPreview } from "./preview";

/** INTEGRATION-SPEC §3 `AuthorPublication`. */
export type AuthorPublication = {
  id: string;
  status: string;
  rowVersion: number;
  revisionId: string;
  revisionNumber: number;
  publishedAt: string;
};

export type RevisionFlaw = RevisionFlawPreview & { id: string; revisionId: string };

/** The owning Author's view of one immutable revision (AUT-05.3). */
export type AuthorRevision = {
  publication: AuthorPublication;
  challenge: ChallengeView;
  answerKey: RevisionFlaw[];
  hints: { id: string; flawId: string; text: string }[];
};

export const publicationHref = (id: string) => `${challengeHref(id)}/publication`;
export const revisionHref = (id: string, revisionId: string) => `${challengeHref(id)}/revisions/${revisionId}`;

/** A readable local publication time; the `<time>` element keeps the exact ISO value. */
export function formatPublishedAt(publishedAt: string) {
  const date = new Date(publishedAt);
  return Number.isNaN(date.getTime()) ? publishedAt
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Exact AUT-05 on-screen text. */
export const publicationMessages = {
  ineligible: "Review the current proposals and approve at least one flaw before publishing.",
  publishing: "Preparing hints and publishing…",
  published: "Challenge published.",
  invalidOutput: "The AI returned invalid hints. The challenge wasn't published.",
  timeout: "Publication timed out. Check publication before trying again.",
  failed: "We couldn't publish the challenge right now.",
  limited: "Publication is unavailable within the current AI limits. Try again later.",
  tooLarge: "This candidate is too large for AI publication.",
  changed: "This challenge changed. Reload it before publishing.",
  uncertain: "We couldn't confirm publication.",
  revisionUnavailable: "We couldn't load the published challenge. Try again.",
} as const;
