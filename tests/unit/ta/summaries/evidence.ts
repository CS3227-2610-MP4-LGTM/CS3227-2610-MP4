import { id } from "../inspection/evidence";
import type { Category } from "@/lib/learner/challenges";
export { id };
type SummaryItem = { category: Category; text: string; submissionIds: string[] };
export type SummaryFixture = { id: string; learnerId: string; createdAt: string; inputFingerprint: string;
  output: { strengths: SummaryItem[]; blindSpots: SummaryItem[]; nextSteps: SummaryItem[] } };
export function summary(): SummaryFixture {
  return { id: id(56001), learnerId: id(11), createdAt: "2026-01-01T00:00:10Z", inputFingerprint: "a".repeat(64),
    output: { strengths: [], blindSpots: [{ category: "edge_case" as const, text: "The first review missed an empty-input case.", submissionIds: [id(501)] }],
      nextSteps: [{ category: "edge_case" as const, text: "Check empty collections during the first review.", submissionIds: [id(501)] }] } };
}
export const read = (value: ReturnType<typeof summary> | null = summary(), stale = false) => ({ status: "ok" as const, summary: value, stale });
export const generated = (value = summary()) => ({ status: "ok" as const, summary: value });
export const deferred = <T,>() => Promise.withResolvers<T>();
export const hostile = '<script>globalThis.summaryExecuted=true</script><img src="https://attacker.invalid/a" onerror="alert(1)"> [open](https://attacker.invalid)';
