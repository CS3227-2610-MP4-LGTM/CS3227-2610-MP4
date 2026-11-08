import { expect, it, vi } from "vitest";
import { projectLearnerCode } from "@/server/learner/projection";

vi.mock("server-only", () => ({}));

it.each(["", "\n"])("LRN-02.2 projects every stored line exactly when trailing suffix is %j", (suffix) => {
  const source = `const amount = 1;\n\n\tconst total = amount / 2;  ${suffix}`;
  expect(projectLearnerCode("javascript", source)).toEqual({
    path: "challenge.js",
    before: "",
    after: source,
    hunks: [{
      oldStart: 0,
      oldCount: 0,
      newStart: 1,
      newCount: 3,
      lines: [
        { kind: "added", text: "const amount = 1;", oldLine: null, newLine: 1 },
        { kind: "added", text: "", oldLine: null, newLine: 2 },
        { kind: "added", text: "\tconst total = amount / 2;  ", oldLine: null, newLine: 3 },
      ],
    }],
  });
});

it.each([
  ["python", "challenge.py"],
  ["java", "Challenge.java"],
  ["javascript", "challenge.js"],
  ["typescript", "challenge.ts"],
] as const)("LRN-02.2 derives the display path for %s", (language, path) => {
  expect(projectLearnerCode(language, "fixture")).toMatchObject({ path });
});
