// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { inputs, outputs, retainedFlaws, limits, uid } from "./fixtures";
vi.mock("server-only", () => ({}));
import { createOperationRunner } from "@/server/llm/execution";

function setup(options: { inputTokens?: number; output?: unknown; providerError?: Error; lowerLimits?: object } = {}) {
  const accounting = {
    reserve: vi.fn<(input: Record<string, unknown>) => Promise<{ status: string; operationId: string; reservationId: string; expiresAt: string }>>().mockResolvedValue({ status: "reserved", operationId: uid(9001), reservationId: uid(9002), expiresAt: new Date(Date.now() + 35000).toISOString() }),
    markDispatched: vi.fn<(input: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined), settle: vi.fn<(input: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined),
    close: vi.fn<(input: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined),
  };
  const provider = { execute: vi.fn<(...args: [unknown, { maxOutputTokens: number; signal: AbortSignal }]) => Promise<{ output: unknown; usage?: { inputTokens: number; outputTokens: number; verified: boolean } }>>().mockImplementation(async () => {
    if (options.providerError) throw options.providerError;
    return { output: options.output ?? outputs.assess_review, usage: { inputTokens: 100, outputTokens: 20, verified: true } };
  }) };
  const diagnostics = { log: vi.fn(), trace: vi.fn() };
  const runner = createOperationRunner({ provider, accounting, clock: () => Date.now(),
    limits: { ...limits, ...options.lowerLimits }, measureInput: () => options.inputTokens ?? 100, diagnostics });
  const run = () => runner.run({ accountId: uid(11), resourceId: uid(501), idempotencyKey: uid(9101),
    snapshot: inputs.assess_review, retainedFlaws, fingerprint: "captured-snapshot-v1" });
  return { runner, run, provider, accounting, diagnostics };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("SEC-05.3 only invalid output permits one automatic retry, returning explicit retry metadata", async () => {
  const { run, provider, accounting } = setup();
  provider.execute.mockResolvedValueOnce({ output: { garbage: true } });
  const result = await run();
  expect(result).toMatchObject({ data: outputs.assess_review, meta: { attempts: 2, outputRetried: true } });
  expect(accounting.reserve).toHaveBeenCalledTimes(2);
  expect(accounting.markDispatched).toHaveBeenCalledTimes(2);
  expect(accounting.settle).toHaveBeenCalledTimes(2);
  expect(provider.execute.mock.calls[0][0]).toEqual(provider.execute.mock.calls[1][0]);
});
it("SEC-05.3 repeated invalid output ends after exactly two dispatched attempts", async () => {
  const { run, provider, accounting } = setup({ output: { schemaVersion: 999 } });
  expect(await run()).toMatchObject({ error: { code: "INVALID_AI_OUTPUT" } });
  expect(provider.execute).toHaveBeenCalledTimes(2);
  expect(accounting.reserve).toHaveBeenCalledTimes(2);
});
it("SEC-05.3 denied retry reservation prevents the second dispatch", async () => {
  const { run, provider, accounting } = setup({ output: {} });
  // First reservation succeeds; the rejected reservation belongs to the retry.
  accounting.reserve.mockReset().mockResolvedValueOnce({ status: "reserved", operationId: uid(9001), reservationId: uid(9002), expiresAt: new Date(Date.now() + 35000).toISOString() })
    .mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "RATE_LIMITED" }));
  expect(await run()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  expect(provider.execute).toHaveBeenCalledTimes(1);
});
it.each(["AI_UNAVAILABLE", "AI_TIMEOUT"])("SEC-05.3 %s ends the operation without retry and settles dispatched usage", async code => {
  const { run, provider, accounting } = setup({ providerError: Object.assign(new Error("private provider error"), { code }) });
  expect(await run()).toMatchObject({ error: { code } });
  expect(provider.execute).toHaveBeenCalledTimes(1);
  expect(accounting.settle).toHaveBeenCalledTimes(1);
  expect(accounting.settle.mock.calls[0][0]).toMatchObject({ outcome: "uncertain" });
});
it.each([32768, 32769])("SEC-04.1 input token cap at %s includes full-request measurement", async inputTokens => {
  const { run, provider, accounting } = setup({ inputTokens });
  const result = await run();
  if (inputTokens === 32768) {
    expect(result).toHaveProperty("data");
    expect(accounting.reserve.mock.calls[0][0]).toMatchObject({ inputTokens: 32768, outputTokens: 8192 });
    expect(provider.execute.mock.calls[0][1]).toMatchObject({ maxOutputTokens: 8192 });
  } else {
    expect(result).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
    expect(accounting.reserve).not.toHaveBeenCalled(); expect(provider.execute).not.toHaveBeenCalled();
  }
});
it("SEC-04.1 lower configured input/output ceilings apply to reservation and dispatch", async () => {
  const allowed = setup({ inputTokens: 100, lowerLimits: { inputTokens: 100, outputTokens: 25 } });
  expect(await allowed.run()).toHaveProperty("data");
  expect(allowed.accounting.reserve.mock.calls[0][0]).toMatchObject({ inputTokens: 100, outputTokens: 25 });
  expect(allowed.provider.execute.mock.calls[0][1]).toMatchObject({ maxOutputTokens: 25 });
  const denied = setup({ inputTokens: 101, lowerLimits: { inputTokens: 100 } });
  expect(await denied.run()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
  expect(denied.provider.execute).not.toHaveBeenCalled();
});
it.each([8192, 8193])("SEC-04.1 refuses provider output beyond %s generated-token boundary", async outputTokens => {
  const { run, provider } = setup();
  provider.execute.mockResolvedValue({ output: outputs.assess_review, usage: { inputTokens: 100, outputTokens, verified: true } });
  if (outputTokens === 8192) expect(await run()).toHaveProperty("data");
  else expect(await run()).toMatchObject({ error: { code: "INVALID_AI_OUTPUT" } });
});
it.each([14999, 15000, 15001])("SEC-04.1 per-attempt deadline bounds a provider completing at %sms", async delay => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const { run, provider } = setup();
  provider.execute.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ output: outputs.assess_review }), delay)));
  const pending = run();
  await vi.advanceTimersByTimeAsync(delay);
  const result = await pending;
  if (delay < 15000) expect(result).toHaveProperty("data");
  else {
    expect(result).toMatchObject({ error: { code: "AI_TIMEOUT" } });
    expect(provider.execute.mock.calls[0][1].signal.aborted).toBe(true);
  }
  expect(provider.execute).toHaveBeenCalledOnce();
});
it("SEC-04.1 operation expiry includes reservation latency and aborts a retry at 35s", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const { run, provider, accounting } = setup();
  accounting.reserve.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({ status: "reserved", operationId: uid(9001), reservationId: uid(9002), expiresAt: "2026-01-01T00:00:35Z" }), 10000)));
  provider.execute.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({ output: {} }), 14000)))
    .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({ output: outputs.assess_review }), 14000)));
  const pending = run();
  await vi.advanceTimersByTimeAsync(35000);
  expect(await pending).toMatchObject({ error: { code: "AI_TIMEOUT" } });
  expect(provider.execute).toHaveBeenCalledTimes(2);
  expect(provider.execute.mock.calls[1][1].signal.aborted).toBe(true);
});
it("SEC-05.2 proven pre-dispatch failure is released and never invokes the provider", async () => {
  const { run, provider, accounting } = setup();
  accounting.markDispatched.mockRejectedValue(new Error("durably not dispatched"));
  expect(await run()).toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
  expect(provider.execute).not.toHaveBeenCalled();
  expect(accounting.settle.mock.calls[0][0]).toMatchObject({ outcome: "not_dispatched" });
});
it.each(["reserve", "settle"] as const)("SEC-05.2 accounting %s unavailability fails closed", async stage => {
  const { run, provider, accounting } = setup();
  accounting[stage].mockRejectedValue(new Error("private database failure"));
  expect(await run()).toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
  if (stage === "reserve") expect(provider.execute).not.toHaveBeenCalled();
  else expect(provider.execute).toHaveBeenCalledOnce();
});
it("SEC-05.3 empty deterministic matches invoke neither accounting nor provider", async () => {
  const { runner, provider, accounting } = setup();
  const result = await runner.run({ accountId: uid(11), resourceId: uid(501), idempotencyKey: uid(9101),
    snapshot: { ...inputs.assess_review, payload: { language: "javascript", flawedCode: "const x = 1;", matches: [] } }, retainedFlaws, fingerprint: "no-matches" });
  expect(result).toMatchObject({ data: { operation: "assess_review", payload: { assessments: [] } }, meta: { attempts: 0, outputRetried: false } });
  expect(accounting.reserve).not.toHaveBeenCalled(); expect(provider.execute).not.toHaveBeenCalled();
});
it("SEC-06.1 errors, logs and traces omit injected credentials/private text from thrown providers", async () => {
  const sentinels = ["SENTINEL_KEY_83298", "SENTINEL_SOURCE_83491", "SENTINEL_ANSWER_98194", "person-private@example.test"];
  const { run, diagnostics } = setup({ providerError: new Error(sentinels.join(" ")) });
  const logs = [vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {})];
  const result = await run();
  expect(result).toMatchObject({ error: { code: "AI_UNAVAILABLE" } });
  const visible = JSON.stringify([result, diagnostics.log.mock.calls, diagnostics.trace.mock.calls, ...logs.map(log => log.mock.calls)]);
  for (const sentinel of sentinels) expect(visible).not.toContain(sentinel);
});
it("SEC-04.1 a lower provider-attempt ceiling permits one attempt and no automatic retry", async () => {
  const { run, provider, accounting } = setup({ output: {}, lowerLimits: { attemptsPerOperation: 1 } });
  expect(await run()).toMatchObject({ error: { code: "INVALID_AI_OUTPUT" } });
  expect(provider.execute).toHaveBeenCalledOnce(); expect(accounting.reserve).toHaveBeenCalledOnce();
});
