// @vitest-environment node
import { expect, it, vi } from "vitest";
import type { Accounting } from "@/server/llm/accounting";
import { createOperationRunner } from "@/server/llm/execution";
import { runSocSmoke } from "../../../../workflow/scripts/soc-smoke";
import { inputs, limits, outputs, uid } from "./fixtures";

vi.mock("server-only", () => ({}));

const snapshot = inputs.inject_flaws;
const output = outputs.inject_flaws;
const answer = JSON.stringify(output);
const env = { APP_ENV: "development", AI_PROVIDER: "soclaas", SOCLAAS_API_KEY: "offline-test-key" };
const reservationId = uid(9002);
const uncertain = { reservationId, outcome: "uncertain" };

function completion(content = answer, reasoning = "", promptTokens = 100, completionTokens = 50) {
  return Response.json({
    choices: [{ finish_reason: "stop", message: { content, reasoning } }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  });
}

function app(fetch: typeof globalThis.fetch, clock = () => 0) {
  let nextReservation = 9002;
  const accounting = {
    reserve: vi.fn<Accounting["reserve"]>().mockImplementation(async () => ({
      status: "reserved", operationId: uid(9001), reservationId: uid(nextReservation++),
      expiresAt: new Date(limits.operationMs).toISOString(),
    })),
    markDispatched: vi.fn<Accounting["markDispatched"]>().mockResolvedValue(undefined),
    settle: vi.fn<Accounting["settle"]>().mockResolvedValue(undefined),
    close: vi.fn<Accounting["close"]>().mockResolvedValue(undefined),
  };
  const runner = createOperationRunner({
    accounting, clock, limits, env, soc: { fetch, contextTokens: 65536, verifiedLimits: true },
  });
  return {
    accounting,
    run: () => runner.run({
      accountId: uid(1), resourceId: uid(101), idempotencyKey: uid(9101), fingerprint: "deadline-fixture",
      snapshot, retainedFlaws: [],
    }),
  };
}

const deadlineResponses = [
  ["a valid response completes", () => completion()],
  ["an oversized response is rejected", () => new Response(" ".repeat(limits.responseBytes + 1))],
] as const;

function deadlineTransport(response: () => Response) {
  let now = 0;
  // Advance the injected clock without letting the real timer run first.
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
    now += limits.attemptMs;
    return response();
  });
  return { fetch, clock: () => now };
}

it.each(deadlineResponses)("SEC-04.1 app returns one timeout when %s at the deadline", async (_case, response) => {
  const { fetch, clock } = deadlineTransport(response);
  const { accounting, run } = app(fetch, clock);

  expect.soft(await run()).toEqual({ error: { code: "AI_TIMEOUT" } });
  expect.soft(fetch).toHaveBeenCalledOnce();
  expect.soft(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect.soft(accounting.reserve).toHaveBeenCalledOnce();
  expect(accounting.settle).toHaveBeenCalledExactlyOnceWith(uncertain);
});

it.each(deadlineResponses)("SEC-04.1 smoke reports one timeout when %s at the deadline", async (_case, response) => {
  const { fetch, clock } = deadlineTransport(response);
  const csv = await runSocSmoke(["--live", "--operation", "inject_flaws", "--input", "deadline.json"], {
    env, fetch, clock, readFile: async () => JSON.stringify([{ payload: snapshot.payload }]),
    sleep: vi.fn().mockResolvedValue(undefined),
  });
  const [header, ...rows] = csv.trimEnd().split("\n");
  const row = Object.fromEntries(header.split(",").map((column, index) => [column, rows[0]?.split(",")[index]]));

  expect(rows).toHaveLength(1);
  expect(fetch).toHaveBeenCalledOnce();
  expect.soft(row).toMatchObject({
    latency_ms: String(limits.attemptMs), valid: "false", rejection_reason: "AI_TIMEOUT", rejection_detail: "",
    prompt_tokens: "", completion_tokens: "",
  });
  expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});

it.each([
  ["content", answer, "", 0, 50],
  ["content", answer, "", 100, 0],
  ["reasoning only", "", "offline reasoning", 0, 50],
  ["reasoning only", "", "offline reasoning", 100, 0],
] as const)("SEC-04.4 charges uncertain usage for %s (%#)",
  async (_case, content, reasoning, prompt, generated) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(completion(content, reasoning, prompt, generated))
      .mockImplementation(async () => completion());
    const { accounting, run } = app(fetch);
    const attempts = content ? 1 : 2;

    expect(await run()).toMatchObject({ data: output, meta: { attempts } });
    expect(accounting.settle).toHaveBeenCalledTimes(attempts);
    expect(accounting.settle).toHaveBeenNthCalledWith(1, uncertain);
  },
);
