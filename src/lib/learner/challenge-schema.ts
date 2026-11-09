import { z } from "zod";
import { categoryLabels, difficultyLabels, languageLabels } from "./challenges";

export const languageSchema = z.enum(Object.keys(languageLabels) as (keyof typeof languageLabels)[]);
export const difficultySchema = z.enum(Object.keys(difficultyLabels) as (keyof typeof difficultyLabels)[]);
export const categorySchema = z.enum(Object.keys(categoryLabels) as (keyof typeof categoryLabels)[]);
export const challengeIdSchema = z.uuid();
export const timestampSchema = z.iso.datetime({ offset: true }).refine(
  value => !value.startsWith("0000") && /(?:Z|\+00:00)$/.test(value),
);
export const categoriesSchema = z.array(categorySchema).refine(values =>
  values.every((value, index) => index === 0 || values[index - 1] < value),
);
export const challengeCardSchema = z.strictObject({
  id: challengeIdSchema,
  revisionId: challengeIdSchema,
  title: z.string(),
  description: z.string(),
  language: languageSchema,
  difficulty: difficultySchema,
  categories: categoriesSchema,
  publishedAt: timestampSchema,
});
