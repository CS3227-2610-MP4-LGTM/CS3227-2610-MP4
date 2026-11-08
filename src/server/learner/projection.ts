import "server-only";
import type { CodeDiff } from "@/lib/code-diff";
import type { Language } from "@/lib/learner/challenges";

const displayPaths: Record<Language, string> = {
  python: "challenge.py",
  java: "Challenge.java",
  javascript: "challenge.js",
  typescript: "challenge.ts",
};

export function projectLearnerCode(language: Language, source: string): CodeDiff {
  const sourceLines = source.split("\n");
  if (source.endsWith("\n")) sourceLines.pop();

  return {
    path: displayPaths[language],
    before: "",
    after: source,
    hunks: [{
      oldStart: 0,
      oldCount: 0,
      newStart: 1,
      newCount: sourceLines.length,
      lines: sourceLines.map((text, index) => ({ kind: "added", text, oldLine: null, newLine: index + 1 })),
    }],
  };
}
