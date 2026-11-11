import type { CodeDiff, CodeDiffLine } from "@/lib/code-diff";
import { displayPaths } from "@/lib/code-projection";
import type { Language } from "@/lib/learner/challenges";

/** Unchanged lines shown around each retained edit in the Author diff. */
const contextLines = 3;

export type ProposalDecision = "pending" | "approved" | "rejected";

type PreviewProposal = {
  id: string;
  category: string;
  sourceStartLine: number;
  sourceEndLine: number;
  originalSnippet: string;
  replacementSnippet: string;
  explanation: string;
  fix: string;
  decision: ProposalDecision;
};

/** INTEGRATION-SPEC §3: RevisionFlaw without the not-yet-created `id`/`revisionId`. */
export type RevisionFlawPreview = {
  proposalId: string;
  category: string;
  originalSnippet: string;
  replacementSnippet: string;
  sourceStartLine: number;
  sourceEndLine: number;
  startLine: number;
  endLine: number;
  explanation: string;
  fix: string;
};

export type FinalPreview = { code: CodeDiff; flaws: RevisionFlawPreview[] };

/** Lines under INTEGRATION-SPEC §1: split on LF; a trailing LF adds no line. */
function splitLines(text: string) {
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  return lines;
}

type Edit = { proposal: PreviewProposal; replacement: string[] };

/**
 * AUT-04.4: assembles the candidate from approved proposals only, in source
 * order, and derives the real working-to-flawed diff and final flaw ranges.
 * Model or client line numbers are never read. Returns null until every
 * proposal is decided and at least one is approved.
 */
export function buildFinalPreview(input: {
  language: string;
  workingCode: string;
  proposals: readonly PreviewProposal[];
}): FinalPreview | null {
  const { proposals, workingCode } = input;
  if (!proposals.length || proposals.some(p => p.decision === "pending")) return null;
  const retained = proposals.filter(p => p.decision === "approved")
    .sort((a, b) => a.sourceStartLine - b.sourceStartLine);
  if (!retained.length) return null;

  const before = splitLines(workingCode);
  let consumed = 0;
  const edits: Edit[] = retained.map(proposal => {
    const { sourceStartLine: start, sourceEndLine: end } = proposal;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start <= consumed || end < start || end > before.length
      || before.slice(start - 1, end).join("\n") !== proposal.originalSnippet) {
      throw new Error("Proposal range does not match the working code");
    }
    consumed = end;
    return { proposal, replacement: proposal.replacementSnippet.split("\n") };
  });

  // Apply retained edits in source order, preserving untouched lines and the file ending.
  const after: string[] = [];
  const flaws: RevisionFlawPreview[] = [];
  let cursor = 0;
  for (const { proposal: p, replacement } of edits) {
    after.push(...before.slice(cursor, p.sourceStartLine - 1));
    const startLine = after.length + 1;
    after.push(...replacement);
    flaws.push({
      proposalId: p.id, category: p.category, originalSnippet: p.originalSnippet, replacementSnippet: p.replacementSnippet,
      sourceStartLine: p.sourceStartLine, sourceEndLine: p.sourceEndLine, startLine, endLine: after.length,
      explanation: p.explanation, fix: p.fix,
    });
    cursor = p.sourceEndLine;
  }
  after.push(...before.slice(cursor));
  const trailing = workingCode.endsWith("\n") ? "\n" : "";
  const flawedCode = after.join("\n") + trailing;

  return {
    code: {
      path: displayPaths[input.language as Language] ?? displayPaths.javascript,
      before: workingCode,
      after: flawedCode,
      hunks: hunksFor(before, edits),
    },
    flaws,
  };
}

/**
 * One proposal's own edit as a single-hunk diff, as if applied alone: removed
 * lines keep their source numbers and added lines start at the same line.
 */
export function proposalDiff(language: string, proposal: Pick<PreviewProposal,
  "sourceStartLine" | "originalSnippet" | "replacementSnippet">): CodeDiff {
  const removed = splitLines(proposal.originalSnippet);
  const added = proposal.replacementSnippet.split("\n");
  const start = proposal.sourceStartLine;
  return {
    path: displayPaths[language as Language] ?? displayPaths.javascript,
    before: proposal.originalSnippet,
    after: proposal.replacementSnippet,
    hunks: [{
      oldStart: start, oldCount: removed.length, newStart: start, newCount: added.length,
      lines: [
        ...removed.map((text, i): CodeDiffLine => ({ kind: "removed", text, oldLine: start + i, newLine: null })),
        ...added.map((text, i): CodeDiffLine => ({ kind: "added", text, oldLine: null, newLine: start + i })),
      ],
    }],
  };
}

/** Groups edits whose context windows touch, emitting each group as one hunk. */
function hunksFor(before: string[], edits: Edit[]): CodeDiff["hunks"] {
  const groups: Edit[][] = [];
  for (const edit of edits) {
    const last = groups.at(-1)?.at(-1);
    if (last && edit.proposal.sourceStartLine - contextLines <= last.proposal.sourceEndLine + contextLines + 1) {
      groups.at(-1)!.push(edit);
    } else {
      groups.push([edit]);
    }
  }

  const hunks: CodeDiff["hunks"] = [];
  let offset = 0; // New-file line shift from every earlier retained edit.
  for (const group of groups) {
    const oldStart = Math.max(1, group[0].proposal.sourceStartLine - contextLines);
    const oldEnd = Math.min(before.length, group.at(-1)!.proposal.sourceEndLine + contextLines);
    const newStart = oldStart + offset;
    const lines: CodeDiffLine[] = [];
    let oldLine = oldStart;
    let newLine = newStart;
    for (const { proposal: p, replacement } of group) {
      for (; oldLine < p.sourceStartLine; oldLine++, newLine++) {
        lines.push({ kind: "context", text: before[oldLine - 1], oldLine, newLine });
      }
      for (; oldLine <= p.sourceEndLine; oldLine++) {
        lines.push({ kind: "removed", text: before[oldLine - 1], oldLine, newLine: null });
      }
      for (const text of replacement) lines.push({ kind: "added", text, oldLine: null, newLine: newLine++ });
    }
    for (; oldLine <= oldEnd; oldLine++, newLine++) {
      lines.push({ kind: "context", text: before[oldLine - 1], oldLine, newLine });
    }
    const oldCount = oldEnd - oldStart + 1;
    const newCount = newLine - newStart;
    hunks.push({ oldStart, oldCount, newStart, newCount, lines });
    offset += newCount - oldCount;
  }
  return hunks;
}
