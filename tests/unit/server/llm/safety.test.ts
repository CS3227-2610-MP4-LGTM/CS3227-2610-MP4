// @vitest-environment node
import { expect, it, vi } from "vitest";
import { retainedFlaws } from "./fixtures";
vi.mock("server-only", () => ({}));
import { validateLearnerText } from "@/server/llm/safety";
import { validateOutput } from "@/server/llm/contracts";
import { envelope, inputs, uid } from "./fixtures";

const fields = ["originalSnippet", "replacementSnippet", "explanation", "fix"] as const;
const safe = (text: string, flaws = retainedFlaws, maxCodePoints = 2000) => validateLearnerText(text, { retainedFlaws: flaws, maxCodePoints });
const protectedValue = "one two three four five six seven eight nine";

it.each(fields)("SEC-03.1 protects every retained flaw's %s in both hints and matched feedback", field => {
  // f2 is not sent for assessment; its text must still be protected. f1 is the matched flaw.
  for (const flawIndex of [0, 1]) {
    const flaws = structuredClone(retainedFlaws);
    flaws[flawIndex][field] = protectedValue;
    for (const operation of ["generate_hints", "assess_review"] as const) {
      const result = operation === "generate_hints"
        ? envelope(operation, { hints: [{ key: uid(301), text: "one two three four five six seven eight" }, { key: uid(302), text: "Consider minimal inputs." }] })
        : envelope(operation, { assessments: [{ key: uid(301), commentId: uid(601), explanationCredit: 1, fixCredit: 0.5, feedback: "one two three four five six seven eight" }] });
      expect(() => validateOutput(inputs[operation], result, { retainedFlaws: flaws })).toThrow();
    }
  }
});
it.each([
  ["Straße alpha beta gamma delta epsilon zeta eta", "STRASSE ALPHA BETA GAMMA DELTA EPSILON ZETA ETA"],
  ["ΟΣ alpha beta gamma delta epsilon zeta eta", "ος ALPHA beta gamma delta epsilon zeta eta"],
  ["ﬃ alpha beta gamma delta epsilon zeta eta", "FFI alpha beta gamma delta epsilon zeta eta"],
  ["ＣＡＦÉ one two three", "cafe\u0301, ONE—two / three"],
  ["猫 犬 鳥 魚 木 花 月 日", "猫,犬;鳥/魚—木:花(月)日"],
  ["one two three four five six seven eight", "ONE,two;three—four/five:six(seven)eight"],
])("SEC-03.1 applies full Unicode NFKC/case folding and maximal token matching %#", (protectedText, candidate) => {
  const flaws = [{ ...retainedFlaws[0], explanation: protectedText }];
  expect(() => safe(candidate, flaws)).toThrow();
});
it("SEC-03.1 rejects eight contiguous tokens but permits a seven-token fragment of a longer value", () => {
  const flaws = [{ ...retainedFlaws[0], explanation: protectedValue }];
  expect(() => safe("one two three four five six seven", flaws)).not.toThrow();
  expect(() => safe("one two three four five six seven eight", flaws)).toThrow();
  expect(() => safe("one two three gap four five six seven eight", flaws)).not.toThrow();
});
it.each([4, 5, 6, 7])("SEC-03.1 checks the entire protected value at %s tokens", count => {
  const tokens = protectedValue.split(" ").slice(0, count);
  const flaws = [{ ...retainedFlaws[0], explanation: tokens.join(" ") }];
  expect(() => safe(tokens.join(" "), flaws)).toThrow();
  expect(() => safe(tokens.slice(0, -1).join(" "), flaws)).not.toThrow();
});
it("SEC-03.1 does not concatenate separately protected values into a match", () => {
  const flaws = [{ ...retainedFlaws[0], originalSnippet: "one two three", replacementSnippet: "four five six", explanation: "seven eight nine", fix: "ten eleven twelve" }];
  expect(() => safe("one two three four five six seven eight nine ten eleven twelve", flaws)).not.toThrow();
});
it.each(["return a value", "**Consider** boundary inputs.", "_Think_ about empty collections.", "Nothing identifies a particular location."])("SEC-03.1 accepts short protected overlap and harmless emphasis: %s", text => {
  expect(() => safe(text, [{ ...retainedFlaws[0], originalSnippet: "return a value" }])).not.toThrow();
});
it.each([
  "See line 12", "Consider lines 12–14", "Inspect LINE 12-14", "L12", "L12–L14", "L12-L14",
  "<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "<!-- hidden -->", "<?xml version='1.0'?>", "<tag />",
  "Use `return 1`", "```js\nreturn 1\n```", "[help](https://attacker.invalid)", "![img](https://attacker.invalid/a)",
  "<https://attacker.invalid>", "https://attacker.invalid", "http://attacker.invalid", "www.attacker.invalid",
])("SEC-03.1 rejects markup, links and explicit locations: %s", text => expect(() => safe(text)).toThrow());
it.each([500, 2000])("SEC-03.1 measures text limits in Unicode code points at %s and one beyond", bound => {
  for (const char of ["x", "😀"]) {
    expect(() => safe(char.repeat(bound), [], bound)).not.toThrow();
    expect(() => safe(char.repeat(bound + 1), [], bound)).toThrow();
  }
  expect(() => safe("  ", [], bound)).toThrow();
  expect(safe("  Consider edge conditions.  ", [], bound)).toBe("Consider edge conditions.");
});
