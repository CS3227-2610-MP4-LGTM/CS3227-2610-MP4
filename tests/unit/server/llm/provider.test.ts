// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { inputs, operations, outputs, malicious, limits } from "./fixtures";
vi.mock("server-only", () => ({}));
import { buildRequest, createFakeProvider, createSocProvider, measureRequest } from "@/server/llm/provider";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it.each(operations)("SEC-01.2 keeps exact %s allowlist separate from immutable instructions and capabilities", operation => {
  const input = structuredClone(inputs[operation]);
  const request = buildRequest(input);
  expect(request.data).toEqual(input);
  expect(request.instructions).toEqual(expect.any(String));
  expect(request.instructions.length).toBeGreaterThan(0);
  expect(request.capabilities).toEqual({ tools: false, browsing: false, codeExecution: false, callbacks: false });
  expect(JSON.stringify(request)).not.toMatch(/SOCLAAS_API_KEY|Authorization|Bearer /);
});
it.each(operations)("SEC-01.2 injection in %s remains data and cannot change instructions, model or destination", operation => {
  const original = buildRequest(inputs[operation]);
  const input = structuredClone(inputs[operation]);
  const payload = input.payload as Record<string, unknown>;
  if (operation === "inject_flaws") payload.workingCode = malicious;
  if (operation === "generate_hints" || operation === "assess_review") payload.flawedCode = malicious;
  if (operation === "summarize_learner") {
    const submissions = payload.submissions as { comments: { feedback: string }[] }[];
    submissions[0].comments[0].feedback = malicious;
  }
  const request = buildRequest(input);
  expect(request.data).toEqual(input);
  expect(JSON.stringify(request.data)).toContain("attacker.invalid");
  expect(request.instructions).toBe(original.instructions);
  expect(request.destination).toBe(original.destination);
  expect(request.model).toBe(original.model);
  expect(request.capabilities).toEqual(original.capabilities);
  expect(request.instructions).not.toContain(malicious);
});
it.each(operations)("SYS-03.2 fake %s success is deterministic and network/key independent", async operation => {
  const fetch = vi.fn(() => { throw new Error("network forbidden"); });
  vi.stubGlobal("fetch", fetch);
  const request = buildRequest(inputs[operation]);
  const provider = createFakeProvider({ scenario: "success" });
  const result = await provider.execute(request, { maxOutputTokens: limits.outputTokens, signal: new AbortController().signal });
  expect(result.output).toEqual(outputs[operation]);
  expect(await provider.execute(request, { maxOutputTokens: limits.outputTokens, signal: new AbortController().signal })).toEqual(result);
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["malformed", "failure"] as const)("SYS-03.2 fake scenario %s deterministically exercises rejection without fetch", async scenario => {
  const fetch = vi.fn(() => { throw new Error("network forbidden"); }); vi.stubGlobal("fetch", fetch);
  const provider = createFakeProvider({ scenario });
  const call = () => provider.execute(buildRequest(inputs.inject_flaws), { maxOutputTokens: 8192, signal: new AbortController().signal });
  if (scenario === "failure") await expect(call()).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  else expect((await call()).output).not.toEqual(outputs.inject_flaws);
  expect(fetch).not.toHaveBeenCalled();
});
it("SEC-04.1 conservative measurement covers instructions, framing and multibyte data", () => {
  const request = buildRequest(inputs.inject_flaws);
  expect(measureRequest(request)).toBeGreaterThanOrEqual(new TextEncoder().encode(JSON.stringify(request)).length);
  const expanded = { ...request, instructions: request.instructions + "😀".repeat(100) };
  expect(measureRequest(expanded) - measureRequest(request)).toBeGreaterThanOrEqual(400);
});
it("SEC-01.2 rejects redirects without following the attacker destination", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 307, headers: { location: "https://attacker.invalid" } }));
  const provider = createSocProvider({ destination: "https://approved.invalid/v1", model: "approved-model", apiKey: "sentinel-secret", fetch,
    limits, verifiedLimits: true });
  await expect(provider.execute(buildRequest(inputs.inject_flaws), { maxOutputTokens: 8192, signal: new AbortController().signal })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "error" });
  expect(String(fetch.mock.calls[0][0])).not.toContain("attacker.invalid");
});
it.each([131072, 131073])("SEC-04.1 bounds streaming response consumption at %s bytes", async byteCount => {
  let pulls = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { pulls++; if (pulls === 1) controller.enqueue(new Uint8Array(byteCount).fill(32)); else if (byteCount <= 131072) controller.close(); },
    cancel() { cancelled = true; },
  });
  const fetch = vi.fn().mockResolvedValue(new Response(stream));
  const provider = createSocProvider({ destination: "https://approved.invalid/v1", model: "approved-model", apiKey: "test-only", fetch, limits, verifiedLimits: true });
  await expect(provider.execute(buildRequest(inputs.inject_flaws), { maxOutputTokens: 8192, signal: new AbortController().signal })).rejects.toMatchObject({ code: "INVALID_AI_OUTPUT" });
  expect(pulls).toBeLessThanOrEqual(2);
  if (byteCount > 131072) expect(cancelled).toBe(true);
});
it("SEC-04.1 stops streaming immediately after crossing a lower response byte ceiling", async () => {
  let consumed = 0; let cancelled = false;
  const stream = new ReadableStream({ pull(c) { consumed += 4; c.enqueue(new TextEncoder().encode("😀")); }, cancel() { cancelled = true; } });
  const provider = createSocProvider({ destination: "https://approved.invalid/v1", model: "approved-model", apiKey: "test-only",
    fetch: vi.fn().mockResolvedValue(new Response(stream)), limits: { ...limits, responseBytes: 8 }, verifiedLimits: true });
  await expect(provider.execute(buildRequest(inputs.inject_flaws), { maxOutputTokens: 8192, signal: new AbortController().signal })).rejects.toMatchObject({ code: "INVALID_AI_OUTPUT" });
  expect(cancelled).toBe(true);
  // One stream-queued chunk beyond the observed crossing is allowed; no unbounded drain.
  expect(consumed).toBeLessThanOrEqual(16);
});
it.each(["x", "é", "😀"])("SEC-04.1 bounded reader accepts exactly 128KiB and rejects the next UTF-8 byte (%s)", async char => {
  const { readBoundedResponse } = await import("@/server/llm/provider");
  const width = new TextEncoder().encode(char).length;
  const text = char.repeat(131072 / width);
  expect(await readBoundedResponse(new Response(text), { maxBytes: 131072, signal: new AbortController().signal })).toBe(text);
  await expect(readBoundedResponse(new Response(text + "x"), { maxBytes: 131072, signal: new AbortController().signal }))
    .rejects.toMatchObject({ code: "INVALID_AI_OUTPUT" });
});
