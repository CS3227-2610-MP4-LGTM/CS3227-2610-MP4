/** The submission's server audit order, rather than wall-clock time, decides. */
export function projectEffectiveGrade(originalScore: number | null, overrides: readonly { score: number; auditOrder: number }[]): { score: number; passed: boolean; source: "ai" | "ta" } | null {
 if (originalScore === null) return null;
 const latest = overrides.reduce<(typeof overrides)[number] | undefined>((last, row) => !last || row.auditOrder > last.auditOrder ? row : last, undefined);
 const score = latest?.score ?? originalScore;
 return { score, passed: score >= 60, source: latest ? "ta" : "ai" };
}
