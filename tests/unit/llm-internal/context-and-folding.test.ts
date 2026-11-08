// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fullCaseFold } from "@/server/llm/unicode-case-fold";
import { validateLearnerText } from "@/server/llm/safety";
import { validateOutput } from "@/server/llm/contracts";
import { inputs, outputs, retainedFlaws } from "../server/llm/fixtures";

it.each([
  ["Ꭰꭰ", "ᎠᎠ"], // Cherokee full folding uses uppercase, unlike upper/lower heuristics.
  ["ᾈ", "ἀι"], // Greek ypogegrammeni expands to a separate letter.
  ["İı", "i\u0307ı"], // Default folding, without locale-specific Turkic rules.
  ["\u1c89", "\u1c8a"], // Cyrillic casing added after Unicode 14.
  ["\ua7cb", "\u0264"], // Latin casing added after Unicode 14.
])("folds Unicode 17 full mappings %#", (source, expected) => {
  expect(fullCaseFold(source)).toBe(expected);
});
it("protects expanded folds while keeping dotless i distinct", () => {
  const flaw = { ...retainedFlaws[0], explanation: "İ one two three" };
  expect(() => validateLearnerText("i\u0307 one two three", { maxCodePoints: 500, retainedFlaws: [flaw] })).toThrow();
  expect(validateLearnerText("ı one two three", { maxCodePoints: 500, retainedFlaws: [flaw] })).toBe("ı one two three");
});
it.each(["generate_hints", "assess_review"] as const)("rejects absent or incomplete %s protected context", operation => {
  expect(() => validateOutput(inputs[operation], outputs[operation])).toThrow();
  expect(() => validateOutput(inputs[operation], outputs[operation], { retainedFlaws: [] })).toThrow();
  expect(() => validateOutput(inputs[operation], outputs[operation], {
    retainedFlaws: retainedFlaws.map(f => ({ ...f, originalSnippet: undefined })),
  })).toThrow();
  expect(() => validateOutput(inputs[operation], outputs[operation], { retainedFlaws })).not.toThrow();
});
it("rejects a publication context missing a retained flaw", () => {
  expect(() => validateOutput(inputs.generate_hints, outputs.generate_hints, { retainedFlaws: retainedFlaws.slice(0, 1) })).toThrow();
});
