// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { validateOutput } from "@/server/llm/contracts";
import { createFakeProvider, createSocProvider, buildRequest, measureRequest, measureFakeOutput } from "@/server/llm/provider";
import { createOperationRunner } from "@/server/llm/execution";
import { createAccountingStore } from "@/server/llm/accounting";
import { createLlmBoundary } from "@/server/llm/boundary";
import { inputs, outputs, retainedFlaws, limits, uid, workingCode } from "../server/llm/fixtures";

afterEach(() => vi.unstubAllEnvs());
const base = Date.parse("2026-01-01T00:00:00Z");
const runInput = { accountId: uid(11), resourceId: uid(501), idempotencyKey: uid(9001), snapshot: inputs.assess_review,
  retainedFlaws, fingerprint: "review-regressions" };
function accountingStub() {
  return { reserve: vi.fn().mockResolvedValue({ status: "reserved", operationId: uid(9002), reservationId: uid(9003), expiresAt: new Date(base + 35000).toISOString() }),
    markDispatched: vi.fn().mockResolvedValue(undefined), settle: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined), expire: vi.fn().mockResolvedValue(undefined) };
}

it.each([
  "[clue][secret]\n\n[secret]: /answer", "[clue][]\n\n[clue]: /answer", "[secret]\n\n[secret]: /answer",
  "![clue][secret]\n\n[secret]: /answer", "ftp://example.test/key", "ftps://example.test/key",
  "mailto:private@example.test", "data:text/plain,answer",
])("rejects link forms in both hints and feedback: %s", text => {
  const hints = validateOutput(inputs.generate_hints, outputs.generate_hints, { retainedFlaws });
  if (hints.operation !== "generate_hints") throw new Error("wrong fixture operation");
  hints.payload.hints[0].text = text;
  expect(() => validateOutput(inputs.generate_hints, hints, { retainedFlaws })).toThrow();
  const assessment = validateOutput(inputs.assess_review, outputs.assess_review, { retainedFlaws });
  if (assessment.operation !== "assess_review") throw new Error("wrong fixture operation");
  assessment.payload.assessments[0].feedback = text;
  expect(() => validateOutput(inputs.assess_review, assessment, { retainedFlaws })).toThrow();
});

it.each([0, -1])("the actual fake enforces its serialized UTF-8 output token bound at offset %s", async offset => {
  const request = buildRequest(inputs.assess_review), provider = createFakeProvider({ scenario: "success" });
  const outputTokens = measureFakeOutput(outputs.assess_review);
  const call = provider.execute(request, { maxOutputTokens: outputTokens + offset, signal: new AbortController().signal });
  if (!offset) expect(await call).toEqual({ output: outputs.assess_review, usage: { inputTokens: measureRequest(request), outputTokens, verified: true } });
  else await expect(call).rejects.toMatchObject({ code: "INVALID_AI_OUTPUT" });
});
it.each([1, 265, 266])("real fake plus runner cannot accept an underreserved %s-token assessment", async outputTokens => {
  const accounting = accountingStub();
  const runner = createOperationRunner({ provider: createFakeProvider({ scenario: "success" }), accounting, clock: () => base,
    limits: { ...limits, outputTokens } });
  const result = await runner.run(runInput);
  const measured = measureFakeOutput(outputs.assess_review);
  if (outputTokens >= measured) {
    expect(result).toHaveProperty("data");
    expect(accounting.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: "verified", usage: expect.objectContaining({ outputTokens: measured }) }));
  } else {
    expect(result).toMatchObject({ error: { code: "INVALID_AI_OUTPUT" } });
    expect(accounting.reserve).toHaveBeenCalledTimes(2);
    expect(accounting.settle.mock.calls.every(([call]) => call.outcome === "uncertain")).toBe(true);
  }
});

it("commits expiry separately before and after a rejected late SQL transition", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ result: {} }] });
  query.mockResolvedValueOnce({ rows: [{ result: {} }] })
    .mockRejectedValueOnce(new Error("INVALID_STATE"));
  const store = createAccountingStore({ db: { query }, clock: () => base + 35000, environmentId: "test-review", limits });
  await expect(store.settle({ reservationId: uid(9003), outcome: "uncertain" })).rejects.toMatchObject({ code: "INVALID_STATE" });
  expect(query.mock.calls.map(([, parameters]) => parameters[0])).toEqual(["expire", "settle", "expire"]);
});
it("expires a timed-out operation without replacing AI_TIMEOUT with a late state error", async () => {
  let now = base;
  const accounting = accountingStub();
  accounting.settle.mockRejectedValue(Object.assign(new Error("INVALID_STATE"), { code: "INVALID_STATE" }));
  accounting.close.mockRejectedValue(Object.assign(new Error("INVALID_STATE"), { code: "INVALID_STATE" }));
  const provider = { execute: vi.fn(async () => { now += 35000; throw Object.assign(new Error("timeout"), { code: "AI_TIMEOUT" }); }) };
  const runner = createOperationRunner({ provider, accounting, clock: () => now, limits, measureInput: () => 100 });
  expect(await runner.run(runInput)).toEqual({ error: { code: "AI_TIMEOUT" } });
  expect(accounting.expire).toHaveBeenCalled();
  expect(accounting.settle).not.toHaveBeenCalled();
});
it.each([34999, 35000, 35001])("checks the deadline after durable completion at %sms", async delay => {
  let now = base;
  const accounting = accountingStub();
  accounting.close.mockImplementation(async () => { now = base + delay; });
  const provider = { execute: vi.fn(async () => ({ output: outputs.assess_review })) };
  const runner = createOperationRunner({ provider, accounting, clock: () => now, limits, measureInput: () => 100 });
  const result = await runner.run(runInput);
  if (delay < 35000) expect(result).toHaveProperty("data");
  else expect(result).toEqual({ error: { code: "AI_TIMEOUT" } });
  expect(accounting.close).toHaveBeenCalledOnce();
});
it("does not return a result when final reauthorization crosses the captured operation deadline", async () => {
  let now = base, identities = 0;
  const owner = uid(1), resourceId = uid(101);
  const rows = {
    profiles: { id: owner, role: "author" },
    challenges: { id: resourceId, author_id: owner, status: "draft", row_version: 1, published_revision_id: null },
    challenge_drafts: { challenge_id: resourceId, language: "javascript", difficulty: "easy", working_code: workingCode,
      flaw_count: 2, categories: ["logic_bug", "edge_case"], generation_id: null, draft_version: 1 },
  };
  const client = {
    auth: { getUser: async () => { if (++identities === 2) now += 35000; return { data: { user: { id: owner } }, error: null }; } },
    rpc: async () => ({ data: "OK", error: null }),
    from(table: keyof typeof rows) { return { select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: rows[table], error: null }; } }; },
  } as unknown as Parameters<typeof createLlmBoundary>[0]["client"];
  const boundary = createLlmBoundary({ client, accounting: accountingStub(), provider: createFakeProvider({ scenario: "success" }), clock: () => now, limits });
  expect(await boundary.execute({ operation: "inject_flaws", resourceId, idempotencyKey: uid(102), expectedVersion: 1 })).toEqual({ error: { code: "AI_TIMEOUT" } });
});

it.each([
  { node: "test", app: "test", destination: "https://example.test/v1" },
  { node: "production", app: "test", destination: "https://approved.invalid/v1" },
  { node: "test", app: "production", destination: "https://approved.invalid/v1" },
])("refuses real or non-test transport dispatch %#", async setting => {
  vi.stubEnv("NODE_ENV", setting.node); vi.stubEnv("APP_ENV", setting.app); vi.stubEnv("AI_PROVIDER", "fake");
  const fetch = vi.fn();
  const provider = createSocProvider({ destination: setting.destination, model: "arbitrary-model", apiKey: "test-key", fetch, limits, verifiedLimits: true });
  await expect(provider.execute(buildRequest(inputs.assess_review), { maxOutputTokens: 8192, signal: new AbortController().signal }))
    .rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  expect(fetch).not.toHaveBeenCalled();
});
it("rechecks environment/provider configuration on every offline transport dispatch", async () => {
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("APP_ENV", "test"); vi.stubEnv("AI_PROVIDER", "fake");
  const fetch = vi.fn();
  const provider = createSocProvider({ destination: "https://approved.invalid/v1", model: "test-model", apiKey: "test-key", fetch, limits, verifiedLimits: true });
  vi.stubEnv("AI_PROVIDER", "soc");
  await expect(provider.execute(buildRequest(inputs.assess_review), { maxOutputTokens: 8192, signal: new AbortController().signal }))
    .rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  expect(fetch).not.toHaveBeenCalled();
});
it("refuses the native network transport even for the reserved offline destination", async () => {
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("APP_ENV", "test"); vi.stubEnv("AI_PROVIDER", "fake");
  const provider = createSocProvider({ destination: "https://approved.invalid/v1", model: "test-model", apiKey: "test-key", fetch: globalThis.fetch, limits, verifiedLimits: true });
  await expect(provider.execute(buildRequest(inputs.assess_review), { maxOutputTokens: 8192, signal: new AbortController().signal }))
    .rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
});
