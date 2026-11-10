import "server-only";
import { passMark } from "@/lib/learner/grading";

type CommentLocation = { id: string; ordinal: number; line: number };
type FlawLocation = { id: string; startLine: number; endLine: number };
type Match = { flawId: string; commentId: string; distance: number };
type Matching = {
  matches: Match[];
  missedFlawIds: string[];
  duplicateCommentIds: string[];
  unmatchedCommentIds: string[];
};

export function matchReview(comments: readonly CommentLocation[], flaws: readonly FlawLocation[]): Matching {
  const orderedFlaws = [...flaws].sort((a, b) => a.startLine - b.startLine || a.id.localeCompare(b.id));
  const orderedComments = [...comments].sort((a, b) => a.ordinal - b.ordinal);
  const candidates = orderedComments.flatMap(comment => orderedFlaws.map((flaw, flawOrder) => ({
    flawOrder, flawId: flaw.id, commentId: comment.id, ordinal: comment.ordinal,
    distance: Math.max(0, flaw.startLine - comment.line, comment.line - flaw.endLine),
  })).filter(pair => pair.distance <= 1));
  candidates.sort((a, b) => a.distance - b.distance || a.ordinal - b.ordinal || a.flawOrder - b.flawOrder);

  const selected = new Map<string, Match>();
  const assigned = new Set<string>();
  const eligible = new Set(candidates.map(pair => pair.commentId));
  for (const { flawId, commentId, distance } of candidates) {
    if (selected.has(flawId) || assigned.has(commentId)) continue;
    selected.set(flawId, { flawId, commentId, distance });
    assigned.add(commentId);
  }

  return {
    matches: orderedFlaws.flatMap(flaw => {
      const match = selected.get(flaw.id);
      return match ? [match] : [];
    }),
    missedFlawIds: orderedFlaws.filter(flaw => !selected.has(flaw.id)).map(flaw => flaw.id),
    duplicateCommentIds: orderedComments.filter(comment => eligible.has(comment.id) && !assigned.has(comment.id)).map(comment => comment.id),
    unmatchedCommentIds: orderedComments.filter(comment => !eligible.has(comment.id)).map(comment => comment.id),
  };
}

type AssessmentCredits = { explanationCredit: number; fixCredit: number };

export function scoreReview({ flawCount, matching, assessments, providerOutputRetried }: {
  flawCount: number;
  matching: Matching;
  assessments: readonly AssessmentCredits[];
  providerOutputRetried: boolean;
}) {
  const matchedCount = matching.matches.length;
  const identification = 50 * Math.max(0, matchedCount - matching.unmatchedCommentIds.length);
  const explanation = 30 * assessments.reduce((sum, pair) => sum + pair.explanationCredit, 0);
  const fix = 20 * assessments.reduce((sum, pair) => sum + pair.fixCredit, 0);
  const denominator = Math.max(1, flawCount);
  const score = Math.round((identification + explanation + fix) / denominator);
  const points = (value: number) => Math.round(value * 100 / denominator) / 100;
  const ruleFlags: ("near_pass_mark" | "grading_output_retried" | "assessment_disagreement")[] = [];
  if (score >= 55 && score <= 65) ruleFlags.push("near_pass_mark");
  if (providerOutputRetried) ruleFlags.push("grading_output_retried");
  if (assessments.some(pair => pair.explanationCredit === 0 && pair.fixCredit === 0)) ruleFlags.push("assessment_disagreement");
  return {
    score, passMark, passed: score >= passMark,
    identificationPoints: points(identification), explanationPoints: points(explanation), fixPoints: points(fix),
    matchedCount, missedCount: matching.missedFlawIds.length, ruleFlags,
  };
}
