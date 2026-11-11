import "server-only";
import type { CodeDiff } from "@/lib/code-diff";
import { projectNewFile } from "@/lib/code-projection";
import type { Language } from "@/lib/learner/challenges";

/** Learners always receive the new-file projection of flawed code (INTEGRATION-SPEC §2). */
export function projectLearnerCode(language: Language, source: string): CodeDiff {
  return projectNewFile(language, source);
}
