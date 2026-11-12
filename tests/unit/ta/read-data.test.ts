import { afterEach, expect, it, vi } from "vitest";
import { readTaData } from "@/components/ta/read-data";
import { accountAccessHeader } from "@/lib/learner/challenges";

afterEach(() => vi.unstubAllGlobals());

it.each([
  [400, undefined, "invalid"],
  [401, undefined, "unauthenticated"],
  [403, undefined, "role_denied"],
  [403, "role_denied", "role_denied"],
  [403, "account_unavailable", "account_unavailable"],
  [404, undefined, "not_found"],
  [503, undefined, "unavailable"],
  [503, "account_service_unavailable", "account_service_unavailable"],
  [500, undefined, "unavailable"],
] as const)("consumes a %s error body with account header %s and preserves %s", async (code, access, status) => {
  const response = new Response("denied", {
    status: code,
    headers: access ? { [accountAccessHeader]: access } : undefined,
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

  expect(await readTaData("submissions")).toEqual({ status });
  expect(response.bodyUsed).toBe(true);
});

it("preserves the account classification when reading the error body fails", async () => {
  const response = new Response(new ReadableStream({
    start(controller) { controller.error(new Error("read failed")); },
  }), { status: 403, headers: { [accountAccessHeader]: "account_unavailable" } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

  expect(await readTaData("submissions")).toEqual({ status: "account_unavailable" });
  expect(response.bodyUsed).toBe(true);
});
