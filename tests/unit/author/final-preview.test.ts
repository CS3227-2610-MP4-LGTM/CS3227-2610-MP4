// @vitest-environment node
/// <reference types="vite/client" />
import { expect, it } from "vitest";
import type { CodeDiff } from "@/lib/code-diff";

/**
 * T-21 interface: `@/lib/author/preview` exports
 * `buildFinalPreview({ language, workingCode, proposals })`, a client-safe,
 * server-used derivation of AUT-04.4's final candidate. It returns `null` when
 * any proposal is pending or none is approved, otherwise
 * `{ code: CodeDiff, flaws: RevisionFlawPreview[] }`.
 */
type Decision = "pending" | "approved" | "rejected";
type Proposal = {
  id: string; category: string; sourceStartLine: number; sourceEndLine: number;
  originalSnippet: string; replacementSnippet: string; explanation: string; fix: string; decision: Decision;
};
type FlawPreview = {
  proposalId: string; category: string; originalSnippet: string; replacementSnippet: string;
  sourceStartLine: number; sourceEndLine: number; startLine: number; endLine: number; explanation: string; fix: string;
};
type Build = (input: { language: string; workingCode: string; proposals: Proposal[] }) =>
  { code: CodeDiff; flaws: FlawPreview[] } | null;

const modulePath = "/src/lib/author/preview.ts";
const modules = import.meta.glob<{ buildFinalPreview: Build }>("/src/lib/author/preview.ts");

async function build(input: Parameters<Build>[0]) {
  if (!modules[modulePath]) throw new Error(`Missing T-21 module: ${modulePath}`);
  return (await modules[modulePath]()).buildFinalPreview(input);
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const workingCode = [
  "function discounted(price, percent) {",
  "  const fraction = percent / 100;",
  "  return price * (1 - fraction);",
  "}",
  "",
  "// Basket totals use whole currency units.",
  "",
  "function basketTotal(items) {",
  "  const prices = items.map(item => item.price);",
  "  return prices.reduce((sum, price) => sum + price, 0);",
  "}",
  "",
].join("\n");

function proposal(n: number, start: number, end: number, replacement: string, decision: Decision, source = workingCode): Proposal {
  return {
    id: id(n), category: n % 2 ? "logic_bug" : "edge_case", sourceStartLine: start, sourceEndLine: end,
    originalSnippet: source.split("\n").slice(start - 1, end).join("\n"), replacementSnippet: replacement,
    explanation: `Explanation ${n}.`, fix: `Fix ${n}.`, decision,
  };
}

const discount = (decision: Decision) => proposal(1101, 3, 3, "  return price * fraction;", decision);
const reduce = (decision: Decision) => proposal(1102, 10, 10, "  return prices.reduce((sum, price) => sum + price);", decision);

/** Lines under INTEGRATION-SPEC §1: split on LF; a trailing LF adds no line. */
function lines(text: string) {
  const parts = text.split("\n");
  if (text.endsWith("\n")) parts.pop();
  return parts;
}

/** Checks the CodeDiff contract in INTEGRATION-SPEC §2 and that its hunks reproduce `after` from `before`. */
function expectValidDiff(diff: CodeDiff) {
  expect(Object.keys(diff).sort()).toEqual(["after", "before", "hunks", "path"]);
  const before = lines(diff.before);
  const after = lines(diff.after);
  const rebuilt: string[] = [];
  let oldCursor = 1;
  for (const hunk of diff.hunks) {
    expect(Object.keys(hunk).sort()).toEqual(["lines", "newCount", "newStart", "oldCount", "oldStart"]);
    expect(hunk.oldStart).toBeGreaterThanOrEqual(oldCursor);
    while (oldCursor < hunk.oldStart) rebuilt.push(before[oldCursor++ - 1]);
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    expect(hunk.newStart).toBe(rebuilt.length + 1);
    for (const line of hunk.lines) {
      if (line.kind === "context") {
        expect(line).toEqual({ kind: "context", text: before[oldLine - 1], oldLine, newLine });
        expect(line.text).toBe(after[newLine - 1]);
        rebuilt.push(line.text); oldLine++; newLine++;
      } else if (line.kind === "removed") {
        expect(line).toEqual({ kind: "removed", text: before[oldLine - 1], oldLine, newLine: null });
        oldLine++;
      } else {
        expect(line).toEqual({ kind: "added", text: after[newLine - 1], oldLine: null, newLine });
        rebuilt.push(line.text); newLine++;
      }
    }
    expect(oldLine - hunk.oldStart).toBe(hunk.oldCount);
    expect(newLine - hunk.newStart).toBe(hunk.newCount);
    oldCursor = oldLine;
  }
  while (oldCursor <= before.length) rebuilt.push(before[oldCursor++ - 1]);
  expect(rebuilt).toEqual(after);
}

it("AUT-04.4 assembles every approved edit in source order with a real working-to-flawed diff", async () => {
  const result = await build({ language: "javascript", workingCode, proposals: [reduce("approved"), discount("approved")] });
  expect(result).not.toBeNull();
  const expected = workingCode
    .replace("  return price * (1 - fraction);", "  return price * fraction;")
    .replace("  return prices.reduce((sum, price) => sum + price, 0);", "  return prices.reduce((sum, price) => sum + price);");
  expect(result!.code.path).toBe("challenge.js");
  expect(result!.code.before).toBe(workingCode);
  expect(result!.code.after).toBe(expected);
  expect(result!.code.hunks.length).toBeGreaterThan(0);
  expectValidDiff(result!.code);
  expect(result!.flaws.map(f => [f.proposalId, f.startLine, f.endLine])).toEqual([[id(1101), 3, 3], [id(1102), 10, 10]]);
  for (const flaw of result!.flaws) {
    expect(Object.keys(flaw).sort()).toEqual([
      "category", "endLine", "explanation", "fix", "originalSnippet", "proposalId", "replacementSnippet",
      "sourceEndLine", "sourceStartLine", "startLine",
    ]);
  }
  expect(result!.flaws[0]).toMatchObject({ sourceStartLine: 3, sourceEndLine: 3, explanation: "Explanation 1101.", fix: "Fix 1101." });
});

it("AUT-04.4 omits rejected replacements from the candidate, diff and answer key", async () => {
  const result = await build({ language: "javascript", workingCode, proposals: [discount("rejected"), reduce("approved")] });
  expect(result!.code.after).toContain("  return price * (1 - fraction);");
  expect(result!.code.after).not.toContain("  return price * fraction;");
  expect(result!.code.after).toContain("  return prices.reduce((sum, price) => sum + price);");
  expect(JSON.stringify(result!.code.hunks)).not.toContain("return price * fraction;");
  expect(result!.flaws.map(f => f.proposalId)).toEqual([id(1102)]);
  expect(JSON.stringify(result!.flaws)).not.toContain("Explanation 1101.");
  expectValidDiff(result!.code);
});

it("AUT-04.4 shifts final ranges only by earlier retained edits", async () => {
  const grow = proposal(1103, 2, 2, "  const fraction = percent / 100;\n  const unused = fraction;", "approved");
  const shrink = proposal(1104, 8, 10, "function basketTotal(items) {", "approved");
  const tail = proposal(1105, 11, 11, "} // end", "approved");
  const retained = await build({ language: "javascript", workingCode, proposals: [grow, shrink, tail] });
  // Line 2 becomes two lines (+1); lines 8–10 become one line (−2).
  expect(retained!.flaws.map(f => [f.startLine, f.endLine])).toEqual([[2, 3], [9, 9], [10, 10]]);
  expectValidDiff(retained!.code);
  const skipped = await build({ language: "javascript", workingCode, proposals: [{ ...grow, decision: "rejected" }, shrink, tail] });
  expect(skipped!.flaws.map(f => [f.startLine, f.endLine])).toEqual([[8, 8], [9, 9]]);
  expectValidDiff(skipped!.code);
});

it.each([
  ["with a trailing LF", "const a = 1;\nconst b = 2;\n"],
  ["without a trailing LF", "const a = 1;\nconst b = 2;"],
])("AUT-04.4 preserves the file ending %s and reproduces it in the diff", async (_case, source) => {
  const edit = proposal(1106, 2, 2, "const b = 3;", "approved", source);
  const result = await build({ language: "typescript", workingCode: source, proposals: [edit] });
  expect(result!.code.path).toBe("challenge.ts");
  expect(result!.code.after).toBe(source.replace("const b = 2;", "const b = 3;"));
  expect(result!.code.after.endsWith("\n")).toBe(source.endsWith("\n"));
  expectValidDiff(result!.code);
  expect(result!.flaws[0]).toMatchObject({ startLine: 2, endLine: 2 });
});

it.each([
  ["a pending decision", [discount("approved"), reduce("pending")]],
  ["every proposal rejected", [discount("rejected"), reduce("rejected")]],
  ["no proposals", []],
])("AUT-04.3 returns no final preview with %s", async (_case, proposals) => {
  expect(await build({ language: "javascript", workingCode, proposals })).toBeNull();
});

it("AUT-04.4 derives locations on the server and never trusts a supplied final line", async () => {
  const forged = { ...discount("approved"), startLine: 40, endLine: 41 } as Proposal;
  const result = await build({ language: "javascript", workingCode, proposals: [forged] });
  expect(result!.flaws[0]).toMatchObject({ startLine: 3, endLine: 3 });
});
