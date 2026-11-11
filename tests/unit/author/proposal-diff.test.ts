import { describe, expect, it } from "vitest";
import { proposalDiff } from "@/lib/author/preview";

describe("proposalDiff", () => {
  it("shows one proposal as removed source lines followed by added lines at the same start", () => {
    const diff = proposalDiff("javascript", {
      sourceStartLine: 4, originalSnippet: "  a();\n  b();", replacementSnippet: "  c();",
    });
    expect(diff.before).toBe("  a();\n  b();");
    expect(diff.after).toBe("  c();");
    expect(diff.hunks).toEqual([{
      oldStart: 4, oldCount: 2, newStart: 4, newCount: 1,
      lines: [
        { kind: "removed", text: "  a();", oldLine: 4, newLine: null },
        { kind: "removed", text: "  b();", oldLine: 5, newLine: null },
        { kind: "added", text: "  c();", oldLine: null, newLine: 4 },
      ],
    }]);
  });
});
