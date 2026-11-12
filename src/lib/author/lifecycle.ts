/** The `{ id, status, rowVersion }` result of an Author lifecycle action (INTEGRATION-SPEC §3). */
export type LifecycleResult = { id: string; status: string; rowVersion: number };
export type LifecycleAction = "unpublish" | "archive";

/** Exact AUT-06.4–06.6 on-screen text for lifecycle actions. */
export const lifecycleMessages = {
  unpublishTitle: "Unpublish challenge",
  unpublishPrompt: "Unpublish this challenge? Learners won't be able to start or retry it.",
  archiveTitle: "Archive challenge",
  archivePrompt: "Archive this challenge? This can't be undone. Editing, publishing and new attempts will be unavailable.",
  unpublishing: "Unpublishing…",
  archiving: "Archiving…",
  unpublished: "Challenge unpublished.",
  archived: "Challenge archived.",
  conflict: "This challenge changed. Reload it before continuing.",
  unpublishFailed: "We couldn't unpublish the challenge. Try again.",
  archiveFailed: "We couldn't archive the challenge. Try again.",
  uncertain: "We couldn't confirm the change. Refresh the challenge before continuing.",
} as const;
