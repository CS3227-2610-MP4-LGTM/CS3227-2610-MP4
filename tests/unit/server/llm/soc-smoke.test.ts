// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { validateInput, validateRetainedContext } from "@/server/llm/contracts";
import type { RetainedFlaw } from "@/server/llm/safety";
import { envelope, inputs, operations, outputs, retainedFlaws, uid, type Operation } from "./fixtures";

vi.mock("server-only", () => ({}));

type SmokeCase = {
  caseId?: string;
  payload: unknown;
  retainedFlaws?: RetainedFlaw[];
  explanation_label?: number;
  fix_label?: number;
};
type LabelledSmokeCase = SmokeCase & { caseId: string; explanation_label: number; fix_label: number };
type SmokeDependencies = {
  env: Record<string, string | undefined>;
  readFile: (path: string) => Promise<string>;
  fetch: typeof fetch;
  clock: () => number;
  sleep: (ms: number) => Promise<void>;
};
type RunSocSmoke = (args: string[], deps: SmokeDependencies) => Promise<string>;

async function loadSmoke(): Promise<RunSocSmoke> {
  const loaders = import.meta.glob<{ runSocSmoke?: RunSocSmoke }>("../../../../workflow/scripts/soc-smoke.ts");
  const load = loaders["../../../../workflow/scripts/soc-smoke.ts"];
  expect(load, "workflow/scripts/soc-smoke.ts must exist").toBeTypeOf("function");
  const { runSocSmoke } = await load();
  expect(runSocSmoke, "workflow/scripts/soc-smoke.ts must export runSocSmoke").toBeTypeOf("function");
  return runSocSmoke!;
}

const endpoint = "https://soclaas-api.comp.nus.edu.sg/v1/chat/completions";
const key = "dev-key-offline-only";
const reasoning = "raw reasoning sentinel";
const upstream = "raw provider failure sentinel";
const appCaps = { inject_flaws: 1280, generate_hints: 384, assess_review: 576, summarize_learner: 1024 };

const defaultCase = (operation: Operation, caseId?: string): SmokeCase => ({
  ...(caseId ? { caseId } : {}),
  payload: inputs[operation].payload,
  ...(operation === "generate_hints" || operation === "assess_review" ? { retainedFlaws } : {}),
});

const cli = (operation: Operation = "assess_review", ...options: string[]) =>
  ["--live", "--operation", operation, "--input", "first.json", ...options];

function completion(output: unknown, finish = "stop") {
  return Response.json({
    id: "raw-provider-id-sentinel",
    model: "qwen3.5:9b",
    choices: [{ index: 0, finish_reason: finish, message: { role: "assistant", content: JSON.stringify(output), reasoning } }],
    usage: { prompt_tokens: 101, completion_tokens: 51 },
  });
}

function setup(operation: Operation = "assess_review", files: Record<string, SmokeCase[]> = {
  "first.json": [defaultCase(operation, "c1")],
}) {
  let now = 0;
  const starts: number[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
    starts.push(now);
    now += 175;
    return completion(outputs[operation]);
  });
  const readFile = vi.fn(async (path: string) => {
    if (!Object.hasOwn(files, path)) throw new Error("raw file path sentinel");
    return JSON.stringify(files[path]);
  });
  const sleep = vi.fn(async (ms: number) => { now += ms; });
  const deps: SmokeDependencies = {
    env: { SOCLAAS_API_KEY: key }, readFile, fetch, clock: () => now, sleep,
  };
  return { deps, fetch, readFile, sleep, starts };
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected global transport"); })));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function csvRecords(csv: string) {
  const records = csv.trimEnd().split(/\r?\n/).map(row =>
    Array.from(row.matchAll(/(?:^|,)(?:"((?:""|[^"])*)"|([^,]*))/g),
      ([, quoted, plain]) => quoted?.replaceAll('""', '"') ?? plain));
  const [header, ...rows] = records;
  for (const row of rows) expect(row).toHaveLength(header.length);
  return rows.map(row => Object.fromEntries(header.map((column, index) => [column, row[index]])));
}

it("SEC-04 smoke requires explicit live opt-in and an operator-supplied development key", async () => {
  const runSmoke = await loadSmoke();
  const { deps, fetch, readFile } = setup();
  await expect(runSmoke(cli().slice(1), deps)).rejects.toThrow(/--live/);
  await expect(runSmoke(cli(), { ...deps, env: {} })).rejects.toThrow(/SOCLAAS_API_KEY/);
  expect(fetch).not.toHaveBeenCalled();
  expect(readFile).not.toHaveBeenCalled();
});

it.each(operations)("INTEGRATION-SPEC §6 smoke has a valid C1-derived %s payload and calls the same protocol", async operation => {
  const runSmoke = await loadSmoke();
  const path = new URL("../../../../workflow/scripts/fixtures/soc-smoke/" + operation.replaceAll("_", "-") + ".json", import.meta.url);
  const { deps, fetch } = setup(operation);
  const csv = await runSmoke(cli(operation), { ...deps, readFile: async () => {
    expect(() => readFileSync(path, "utf8"), "missing C1 smoke fixture " + operation).not.toThrow();
    const raw = readFileSync(path, "utf8");
    const [fixture] = JSON.parse(raw) as SmokeCase[];
    const snapshot = validateInput(envelope(operation, fixture.payload));
    expect(snapshot).toEqual(inputs[operation]);
    validateRetainedContext(snapshot, fixture.retainedFlaws);
    if (operation === "assess_review" || operation === "generate_hints") {
      expect(fixture.retainedFlaws).toMatchObject(retainedFlaws.map(({ key, originalSnippet, replacementSnippet, explanation, fix }) =>
        ({ key, originalSnippet, replacementSnippet, explanation, fix })));
    }
    return raw;
  } });
  expect(fetch).toHaveBeenCalledOnce();
  const [url, request] = fetch.mock.calls[0];
  expect(String(url)).toBe(endpoint);
  expect(request).toMatchObject({ method: "POST", redirect: "error" });
  expect(new Headers(request?.headers).get("authorization")).toBe("Bearer " + key);
  const wire = JSON.parse(String(request?.body));
  expect(wire).toMatchObject({
    model: "qwen3.6:35b", reasoning_effort: "none", max_tokens: appCaps[operation],
    response_format: { type: "json_schema", json_schema: { strict: true, schema: expect.any(Object) } },
    messages: [{ role: "system" }, { role: "user" }],
  });
  expect(wire).not.toHaveProperty("tools");
  expect(wire).not.toHaveProperty("tool_choice");
  expect(JSON.parse(wire.messages[1].content)).toEqual(inputs[operation]);
  expect(csvRecords(csv)).toEqual([expect.objectContaining({
    operation, max_tokens: String(appCaps[operation]), valid: "true",
  })]);
});

it("SEC-04 smoke validates every payload before dispatch, including a malformed later file", async () => {
  const runSmoke = await loadSmoke();
  const { deps, fetch } = setup("assess_review", {
    "first.json": [defaultCase("assess_review")],
    "invalid.json": [{ payload: { ...inputs.assess_review.payload as object, privateSentinel: "secret fixture text" } }],
  });
  await expect(runSmoke(cli("assess_review", "--input", "invalid.json"), deps)).rejects.toThrow(/VALIDATION_ERROR/);
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  ["invalid JSON", async () => "{private file sentinel"],
  ["unreadable input", async () => { throw new Error("private file sentinel"); }],
])("SEC-04 smoke safely rejects %s before dispatch", async (_case, readFile) => {
  const runSmoke = await loadSmoke();
  const { deps, fetch } = setup();
  let error: string | undefined;
  try { await runSmoke(cli(), { ...deps, readFile }); }
  catch (failure) { error = String(failure); }
  expect(error).toMatch(/VALIDATION_ERROR|--input/);
  expect(error).not.toContain("private file sentinel");
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["generate_hints", "assess_review"] as const)("SEC-03 smoke requires retained context before validating %s", async operation => {
  const runSmoke = await loadSmoke();
  const { deps, fetch } = setup(operation, { "first.json": [{ payload: inputs[operation].payload }] });
  await expect(runSmoke(cli(operation), deps)).rejects.toThrow(/VALIDATION_ERROR|INVALID_AI_OUTPUT/);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["generate_hints", "assess_review"] as const)("SEC-03 smoke rejects %s that leaks a retained flaw outside the assessed target", async operation => {
  const runSmoke = await loadSmoke();
  const { deps, fetch } = setup(operation);
  const leaked = retainedFlaws[1].explanation;
  const result = operation === "generate_hints" ? envelope(operation, { hints: [
    { key: uid(301), text: leaked }, { key: uid(302), text: "Consider the smallest basket." },
  ] }) : envelope(operation, { assessments: [
    { key: uid(301), commentId: uid(601), explanationCredit: 1, fixCredit: 0, feedback: leaked },
  ] });
  fetch.mockResolvedValueOnce(completion(result));
  const csv = await runSmoke(cli(operation), deps);
  expect(fetch).toHaveBeenCalledOnce();
  expect(csvRecords(csv)).toEqual([expect.objectContaining({ valid: "false", rejection_reason: "INVALID_AI_OUTPUT" })]);
  expect(csv).not.toContain(leaked);
  const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
  expect(JSON.parse(body.messages[1].content)).toEqual(inputs[operation]);
  if (operation === "assess_review") expect(body.messages[1].content).not.toContain(leaked);
});

it("SEC-04 smoke accepts repeated inputs, optional case IDs and script-only effort and output overrides", async () => {
  const runSmoke = await loadSmoke();
  const { deps, fetch, starts } = setup("assess_review", {
    "first.json": [defaultCase("assess_review", "first")],
    "other.json": [defaultCase("assess_review")],
  });
  const csv = await runSmoke(cli("assess_review", "--input", "other.json", "--repeat", "2", "--effort", "low", "--max-tokens", "8192"), deps);
  expect(fetch).toHaveBeenCalledTimes(4);
  const rows = csvRecords(csv);
  expect(rows.filter(row => row.case_id === "first")).toHaveLength(2);
  expect(rows.every(row => Boolean(row.case_id))).toBe(true);
  expect(rows.every(row => row.max_tokens === "8192" && row.effort === "low")).toBe(true);
  for (const call of fetch.mock.calls) {
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ max_tokens: 8192, reasoning_effort: "low" });
  }
  expect(starts).toHaveLength(4);
  for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(4000);
});

it.each(["8193", "0", "1.5", "NaN"])("SEC-04 smoke rejects --max-tokens %s before dispatch", async maxTokens => {
  const runSmoke = await loadSmoke();
  const { deps, fetch } = setup();
  await expect(runSmoke(cli("assess_review", "--max-tokens", maxTokens), deps)).rejects.toThrow(/--max-tokens/);
  expect(fetch).not.toHaveBeenCalled();
});

it("SEC-04 smoke spaces 30 call starts at least four seconds apart and rejects a larger run", async () => {
  const runSmoke = await loadSmoke();
  const allowed = setup();
  const rejected = setup("assess_review", { "first.json": [
    defaultCase("assess_review", "case-a"), defaultCase("assess_review", "case-b"),
  ] });
  expect(csvRecords(await runSmoke(cli("assess_review", "--repeat", "30"), allowed.deps))).toHaveLength(30);
  expect(allowed.fetch).toHaveBeenCalledTimes(30);
  expect(allowed.starts).toHaveLength(30);
  for (let i = 1; i < allowed.starts.length; i++) {
    expect(allowed.starts[i] - allowed.starts[i - 1]).toBeGreaterThanOrEqual(4000);
  }
  await expect(runSmoke(cli("assess_review", "--repeat", "16"), rejected.deps)).rejects.toThrow(/30/);
  expect(rejected.fetch).not.toHaveBeenCalled();
});

it("SEC-04 smoke emits safe CSV rows for parsed credits, invalid output and transport failure", async () => {
  const runSmoke = await loadSmoke();
  const { deps, fetch } = setup();
  fetch.mockImplementationOnce(async () => completion(envelope("assess_review", { assessments: [{
    key: uid(301), commentId: uid(601), explanationCredit: 0.5, fixCredit: 1,
    feedback: "raw response text sentinel",
  }] })));
  fetch.mockImplementationOnce(async () => completion(outputs.assess_review, "length"));
  fetch.mockImplementationOnce(async () => new Response(upstream, { status: 429 }));
  const csv = await runSmoke(cli("assess_review", "--repeat", "3", "--max-tokens", "650"), deps);
  expect(fetch).toHaveBeenCalledTimes(3);
  const rows = csvRecords(csv);
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row).toMatchObject({ case_id: "c1", operation: "assess_review", effort: "none", max_tokens: "650" });
    expect(row.latency_ms).toMatch(/^\d+$/);
  }
  expect(rows[0]).toMatchObject({
    valid: "true", prompt_tokens: "101", completion_tokens: "51", finish_reason: "stop",
    reasoning_chars: String(reasoning.length), rejection_reason: "",
    explanation_label: "", fix_label: "", exact_agreement: "",
  });
  expect(JSON.parse(rows[0].assessment_credits)).toMatchObject([{ explanationCredit: 0.5, fixCredit: 1 }]);
  expect(rows[1]).toMatchObject({
    valid: "false", finish_reason: "length", rejection_reason: "INVALID_AI_OUTPUT", assessment_credits: "",
  });
  expect(rows[2]).toMatchObject({ valid: "false", rejection_reason: "AI_UNAVAILABLE", assessment_credits: "" });
  for (const secret of [reasoning, upstream, key, "raw-provider-id-sentinel", "raw response text sentinel",
    "This returns the discount rather than the payable amount"]) expect(csv).not.toContain(secret);
});

const labelledCli = (operation: Operation = "assess_review") =>
  ["--live", "--operation", operation, "--labelled-input", "labelled.json"];

it("SYS-19.4 smoke reports both labels and exact agreement only for valid labelled assessments", async () => {
  const runSmoke = await loadSmoke();
  const cases = [
    { ...defaultCase("assess_review"), caseId: "exact", explanation_label: 0.5, fix_label: 0 },
    { ...defaultCase("assess_review"), caseId: "different-explanation", explanation_label: 1, fix_label: 0 },
    { ...defaultCase("assess_review"), caseId: "different-fix", explanation_label: 0.5, fix_label: 1 },
    { ...defaultCase("assess_review"), caseId: "invalid", explanation_label: 0.5, fix_label: 0 },
  ] satisfies LabelledSmokeCase[];
  const { deps, fetch } = setup("assess_review", { "labelled.json": cases });
  const matchingOutput = envelope("assess_review", { assessments: [{
    key: uid(301), commentId: uid(601), explanationCredit: 0.5, fixCredit: 0,
    feedback: "Explain the consequence and propose an actionable change.",
  }] });
  for (const fixture of cases) {
    fetch.mockResolvedValueOnce(completion(matchingOutput, fixture.caseId === "invalid" ? "length" : "stop"));
  }
  const rows = csvRecords(await runSmoke(labelledCli(), deps));
  expect(rows).toEqual([
    expect.objectContaining({ case_id: "exact", valid: "true", explanation_label: "0.5", fix_label: "0", exact_agreement: "true" }),
    expect.objectContaining({ case_id: "different-explanation", valid: "true", explanation_label: "1", fix_label: "0", exact_agreement: "false" }),
    expect.objectContaining({ case_id: "different-fix", valid: "true", explanation_label: "0.5", fix_label: "1", exact_agreement: "false" }),
    expect.objectContaining({ case_id: "invalid", valid: "false", explanation_label: "0.5", fix_label: "0", exact_agreement: "" }),
  ]);
  expect(fetch).toHaveBeenCalledTimes(4);
  for (const [, request] of fetch.mock.calls) {
    const body = JSON.parse(String(request?.body));
    expect(JSON.parse(body.messages[1].content)).toEqual(inputs.assess_review);
    expect(String(request?.body)).not.toMatch(/explanation_label|fix_label/);
  }
});

it.each([{ explanation_label: 0.25, fix_label: 1 }, { explanation_label: 0 }])(
  "SYS-19.4 smoke rejects missing or invalid labelled credits before dispatch (%j)", async labels => {
    const runSmoke = await loadSmoke();
    const { deps, fetch } = setup("assess_review", { "labelled.json": [
      { ...defaultCase("assess_review", "first"), explanation_label: 1, fix_label: 1 },
      { ...defaultCase("assess_review", "invalid"), ...labels },
    ] });
    await expect(runSmoke(labelledCli(), deps)).rejects.toThrow(/VALIDATION_ERROR/);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("SYS-19.4 smoke rejects labelled input for a different operation", async () => {
  const runSmoke = await loadSmoke();
  const { deps, fetch } = setup("generate_hints", { "labelled.json": [
    { ...defaultCase("generate_hints", "labelled-hint"), explanation_label: 1, fix_label: 1 },
  ] });
  await expect(runSmoke(labelledCli("generate_hints"), deps)).rejects.toThrow(/assess_review|VALIDATION_ERROR/);
  expect(fetch).not.toHaveBeenCalled();
});

it("SYS-19.4 the E6 fixture has all 21 valid assessment inputs and their supplied labels", () => {
  const path = new URL("../../../../workflow/scripts/fixtures/soc-smoke/assess-review-e6.json", import.meta.url);
  expect(existsSync(path), "missing labelled E6 assessment fixture").toBe(true);
  const cases = JSON.parse(readFileSync(path, "utf8")) as LabelledSmokeCase[];
  const credits = [
    [1, 1], [1, 0], [0, 1], [0, 0], [0, 0], [0.5, 0.5], [1, 0], [1, 1], [1, 0], [0, 1],
    [0.5, 0.5], [0, 0], [0.5, 1], [1, 1], [1, 0], [0, 1], [0, 0], [0.5, 0], [0, 0], [1, 0], [0, 0],
  ];
  expect(cases.map(({ caseId, explanation_label, fix_label }) => [caseId, explanation_label, fix_label])).toEqual(
    credits.map(([explanation, fix], index) => [`E${String(index + 1).padStart(2, "0")}`, explanation, fix]),
  );
  for (const fixture of cases) {
    const input = validateInput(envelope("assess_review", fixture.payload));
    expect(input).toMatchObject({ payload: { matches: [expect.objectContaining({ comment: expect.any(Object) })] } });
    validateRetainedContext(input, fixture.retainedFlaws);
  }
});

it("SEC-04 smoke reports a timeout on a separately labeled, five-flaw, multi-category stress case", async () => {
  const runSmoke = await loadSmoke();
  const path = new URL("../../../../workflow/scripts/fixtures/soc-smoke/inject-flaws-stress.json", import.meta.url);
  const { deps, fetch } = setup("inject_flaws");
  vi.useFakeTimers();
  const started = Promise.withResolvers<void>();
  fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    started.resolve();
  }));
  const pending = runSmoke(cli("inject_flaws"), {
    ...deps, clock: Date.now, readFile: async () => {
      expect(() => readFileSync(path, "utf8"), "missing separately labeled stress fixture").not.toThrow();
      const raw = readFileSync(path, "utf8");
      const cases = JSON.parse(raw) as SmokeCase[];
      expect(cases).toHaveLength(1);
      expect(cases[0].caseId).toMatch(/stress/i);
      const snapshot = validateInput(envelope("inject_flaws", cases[0].payload));
      expect(snapshot.operation).toBe("inject_flaws");
      if (snapshot.operation === "inject_flaws") {
        expect(snapshot.payload.flawCount).toBe(5);
        expect(snapshot.payload.categories.length).toBeGreaterThanOrEqual(3);
        expect(snapshot.payload.workingCode.split("\n").filter(line => /\w/.test(line)).length).toBeGreaterThanOrEqual(10);
      }
      return raw;
    },
  });
  await Promise.race([started.promise, pending.then(() => {
    throw new Error("Smoke finished before dispatching the stress case");
  })]);
  expect(fetch).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(15000);
  const csv = await pending;
  expect(csvRecords(csv)).toEqual([expect.objectContaining({
    case_id: expect.stringMatching(/stress/i), operation: "inject_flaws", valid: "false", rejection_reason: "AI_TIMEOUT",
  })]);
  expect(fetch).toHaveBeenCalledOnce();
});

function assessmentContent(commentId: string, feedback: string) {
  return JSON.stringify(envelope("assess_review", { assessments: [{
    key: uid(301), commentId, explanationCredit: 1, fixCredit: 0, feedback,
  }] }));
}

const answerText = "The conséquence is clear. Private answer sentinel.";
const leakedExplanation = retainedFlaws[1].explanation;

it.each([
  { label: "valid", content: assessmentContent(uid(601), answerText), finish: "stop", detail: "" },
  { label: "empty", content: "", finish: "stop", detail: "empty" },
  { label: "length", content: assessmentContent(uid(601), answerText), finish: "length", detail: "length" },
  { label: "malformed JSON", content: "{Private answer sentinel.", finish: "stop", detail: "json" },
  { label: "substituted comment ID", content: assessmentContent(uid(602), answerText), finish: "stop", detail: "contract" },
  { label: "leaked retained explanation", content: assessmentContent(uid(601), leakedExplanation), finish: "stop", detail: "safety" },
])("SEC-04 smoke reports safe detail and character counts for $label output", async ({ content, finish, detail }) => {
  const runSmoke = await loadSmoke();
  const { deps, fetch } = setup();
  fetch.mockResolvedValueOnce(Response.json({
    model: "qwen3.5:9b",
    choices: [{ index: 0, finish_reason: finish, message: { role: "assistant", content, reasoning } }],
    usage: { prompt_tokens: 101, completion_tokens: 51 },
  }));
  const csv = await runSmoke(cli(), deps);
  expect(fetch).toHaveBeenCalledOnce();
  expect(csvRecords(csv)).toEqual([expect.objectContaining({
    valid: String(detail === ""),
    rejection_reason: detail === "" ? "" : "INVALID_AI_OUTPUT",
    rejection_detail: detail,
    answer_chars: String(content.length),
    reasoning_chars: String(reasoning.length),
  })]);
  expect(csv).not.toContain("Private answer sentinel");
  expect(csv).not.toContain(leakedExplanation);
  expect(csv).not.toContain(reasoning);
});

it("SEC-04 smoke leaves rejection detail blank for transport failures", async () => {
  const runSmoke = await loadSmoke();
  const { deps, fetch } = setup();
  fetch.mockResolvedValueOnce(new Response(upstream, { status: 429 }));
  const csv = await runSmoke(cli(), deps);
  expect(fetch).toHaveBeenCalledOnce();
  expect(csvRecords(csv)).toEqual([expect.objectContaining({
    valid: "false", rejection_reason: "AI_UNAVAILABLE", rejection_detail: "",
  })]);
  expect(csv).not.toContain(upstream);
});

it("SEC-04 smoke leaves rejection detail blank for attempt timeouts", async () => {
  const runSmoke = await loadSmoke();
  const { deps, fetch } = setup();
  vi.useFakeTimers();
  const started = Promise.withResolvers<void>();
  fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    started.resolve();
  }));
  const pending = runSmoke(cli(), { ...deps, clock: Date.now });
  await Promise.race([started.promise, pending.then(() => {
    throw new Error("Smoke finished before dispatching the timeout case");
  })]);
  await vi.advanceTimersByTimeAsync(15000);
  expect(csvRecords(await pending)).toEqual([expect.objectContaining({
    valid: "false", rejection_reason: "AI_TIMEOUT", rejection_detail: "",
  })]);
  expect(fetch).toHaveBeenCalledOnce();
});

it.each(["none", "low", "medium", "high"])("SEC-04 smoke accepts the --effort override %s", async effort => {
  const runSmoke = await loadSmoke();
  const { deps, fetch } = setup();
  const csv = await runSmoke(cli("assess_review", "--effort", effort), deps);
  expect(fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({ reasoning_effort: effort });
  expect(csvRecords(csv)).toEqual([expect.objectContaining({ effort, valid: "true" })]);
});

it.each(["", "minimal", "HIGH", "automatic"])("SEC-04 smoke rejects --effort %j before reading files or dispatching", async effort => {
  const runSmoke = await loadSmoke();
  const { deps, fetch, readFile } = setup();
  await expect(runSmoke(cli("assess_review", "--effort", effort), deps)).rejects.toThrow(/--effort/);
  expect(readFile).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
