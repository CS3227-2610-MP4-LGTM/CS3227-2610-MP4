"use server";

import { readFirstAttemptWithAccess } from "@/server/learner/challenges";

export async function readFirstAttemptAction(id: string) {
  return readFirstAttemptWithAccess(id);
}
