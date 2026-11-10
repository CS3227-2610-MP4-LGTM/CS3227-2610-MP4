import { z } from "zod";
import { categories } from "./progress";
import type { ReadFailure } from "./submissions";
const item = z.strictObject({ category: z.enum(categories), text: z.string().refine(text => text.isWellFormed() && text.trim().length > 0 && [...text].length <= 2000), submissionIds: z.array(z.uuid()).min(1).max(20).refine(ids => new Set(ids).size === ids.length) });
export const summaryOutputSchema = z.strictObject({ strengths: z.array(item).max(5), blindSpots: z.array(item).max(5), nextSteps: z.array(item).max(5) }).refine(o => o.strengths.length + o.blindSpots.length + o.nextSteps.length > 0);
export const summaryRecordSchema = z.strictObject({ id: z.uuid(), learnerId: z.uuid(), createdAt: z.iso.datetime({ offset: true }), inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/), output: summaryOutputSchema });
export type SummaryRecord = z.infer<typeof summaryRecordSchema>;
export type SummaryReadResult = { status: "ok"; summary: SummaryRecord | null; stale: boolean } | ReadFailure;
export type SummaryGenerationResult = { status: "ok"; summary: SummaryRecord } | { status: "failed"; code: string } | ReadFailure;
