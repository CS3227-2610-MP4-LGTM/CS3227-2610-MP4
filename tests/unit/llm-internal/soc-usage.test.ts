// @vitest-environment node
import { expect, it, vi } from "vitest";
import { socOperationSettings } from "@/server/llm/config";
import { validateInput } from "@/server/llm/contracts";
import { createSocClient } from "@/server/llm/soc";
import { inputs, limits, outputs } from "../server/llm/fixtures";

vi.mock("server-only", () => ({}));

it.each(["prompt", "completion"] as const)(
  "rejects over-reservation %s usage when the other count is zero",
  async exceeded => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createSocClient({ fetch, contextTokens: 65536, verifiedLimits: true }, "offline-test-key", limits);
    const attempt = client.prepare(validateInput(inputs.inject_flaws), socOperationSettings.inject_flaws);
    fetch.mockResolvedValueOnce(Response.json({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(outputs.inject_flaws) } }],
      usage: {
        prompt_tokens: exceeded === "prompt" ? attempt.inputTokens + 1 : 0,
        completion_tokens: exceeded === "completion" ? attempt.outputTokens + 1 : 0,
      },
    }));

    const response = await attempt.execute(new AbortController().signal);
    expect(response).toMatchObject({ output: null, detail: "contract" });
    expect(response.usage).toBeUndefined();
  },
);
