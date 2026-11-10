// @vitest-environment node
import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import { runSocSmoke } from "../../../../workflow/scripts/soc-smoke";
import { validateInput, validateRetainedContext } from "@/server/llm/contracts";
import { envelope, flawedCode, retainedFlaws, uid } from "./fixtures";

vi.mock("server-only", () => ({}));

function match(index: number, body: string) {
  const { key, category, startLine, endLine, explanation, fix } = retainedFlaws[index];
  return { key, category, startLine, endLine, explanation, fix,
    comment: { id: uid(601 + index), line: startLine, body } };
}
const first = match(0, "This returns the discount rather than the payable amount.");
const second = match(1, "An empty collection triggers an exception.");
const labels = [
  { key: first.key, commentId: first.comment.id, explanation_label: 1, fix_label: 0.5 },
  { key: second.key, commentId: second.comment.id, explanation_label: 0.5, fix_label: 0 },
];
const fixture = {
  caseId: "multiple-pairs",
  payload: { language: "javascript", flawedCode, matches: [first, second] },
  retainedFlaws,
  assessment_labels: labels,
};
const feedback = "A specific consequence was identified.";
const upstreamReasoning = "private reasoning sentinel";
const assessments = labels.map(({ key, commentId, explanation_label, fix_label }) => ({
  key, commentId, explanationCredit: explanation_label, fixCredit: fix_label, feedback,
}));
function completion(values: typeof assessments) {
  return Response.json({
    choices: [{ finish_reason: "stop", message: {
      content: JSON.stringify(envelope("assess_review", { assessments: values })), reasoning: upstreamReasoning,
    } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  });
}

function setup(cases: unknown = [fixture]) {
  let now = 0;
  const transport = vi.fn<typeof fetch>();
  const run = () => runSocSmoke(["--live", "--operation", "assess_review", "--labelled-input", "multiple.json"], {
    env: { SOCLAAS_API_KEY: "offline-fixture-key" },
    readFile: async () => JSON.stringify(cases),
    fetch: transport,
    clock: () => now,
    sleep: async ms => { now += ms; },
  });
  return { run, transport };
}

function records(csv: string) {
  const cells = csv.trimEnd().split(/\r?\n/).map(line =>
    Array.from(line.matchAll(/(?:^|,)(?:"((?:""|[^"])*)"|([^,]*))/g),
      ([, quoted, plain]) => quoted?.replaceAll('""', '"') ?? plain));
  const [header, ...rows] = cells;
  return rows.map(row => Object.fromEntries(header.map((column, index) => [column, row[index]])));
}

it("SYS-19.4 validates the checked-in labelled multi-match smoke fixture with one label pair for each selected comment", async () => {
  const path = new URL("../../../../workflow/scripts/fixtures/soc-smoke/assess-review-multi-match.json", import.meta.url);
  const cases = JSON.parse(await readFile(path, "utf8")) as (typeof fixture)[];
  expect(cases.length).toBeGreaterThan(0);
  for (const candidate of cases) {
    const input = validateInput(envelope("assess_review", candidate.payload));
    validateRetainedContext(input, candidate.retainedFlaws);
    expect(input.operation).toBe("assess_review");
    if (input.operation !== "assess_review") throw new Error("Expected an assessment fixture");
    expect(input.payload.matches.length).toBeGreaterThanOrEqual(2);
    expect(candidate.assessment_labels).toHaveLength(input.payload.matches.length);
    for (const { key, comment } of input.payload.matches) {
      const labelsForPair = candidate.assessment_labels.filter(label => label.key === key && label.commentId === comment.id);
      expect(labelsForPair).toHaveLength(1);
      expect([0, 0.5, 1]).toContain(labelsForPair[0].explanation_label);
      expect([0, 0.5, 1]).toContain(labelsForPair[0].fix_label);
    }
  }
});

it("SEC-02.1 SEC-05.3 SYS-19.4 records a repeated pair rejection and reports agreement on the valid retry by identity", async () => {
  const { run, transport } = setup();
  transport.mockResolvedValueOnce(completion([assessments[0], assessments[0]]));
  transport.mockResolvedValueOnce(completion(assessments.toReversed()));
  const csv = await run();
  expect(transport).toHaveBeenCalledTimes(2);
  const rows = records(csv);
  expect(rows).toEqual([
    expect.objectContaining({ case_id: fixture.caseId, attempt: "1", valid: "false", rejection_reason: "INVALID_AI_OUTPUT",
      rejection_detail: "duplicate_pair", exact_agreement: "" }),
    expect.objectContaining({ case_id: fixture.caseId, attempt: "2", valid: "true", rejection_reason: "", exact_agreement: "true" }),
  ]);
  expect(JSON.parse(rows[1].assessment_labels)).toEqual(labels);
  for (const [, request] of transport.mock.calls) {
    const body = JSON.parse(String(request?.body));
    expect(JSON.parse(body.messages[1].content)).toEqual(envelope("assess_review", fixture.payload));
    expect(String(request?.body)).not.toContain("assessment_labels");
  }
  for (const sentinel of [feedback, upstreamReasoning, "offline-fixture-key"]) expect(csv).not.toContain(sentinel);
});

it("SEC-05.3 SYS-19.4 stops after one output retry when both responses repeat a pair", async () => {
  const { run, transport } = setup();
  transport.mockImplementation(async () => completion([assessments[1], assessments[1]]));
  const rows = records(await run());
  expect(transport).toHaveBeenCalledTimes(2);
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(row).toMatchObject({
    valid: "false", rejection_reason: "INVALID_AI_OUTPUT", rejection_detail: "duplicate_pair", exact_agreement: "",
  });
});

it("SEC-02.1 SYS-19.4 rejects repeated labels before dispatch", async () => {
  const { run, transport } = setup([{ ...fixture, assessment_labels: [labels[0], labels[0]] }]);
  await expect(run()).rejects.toThrow(/VALIDATION_ERROR/);
  expect(transport).not.toHaveBeenCalled();
});
