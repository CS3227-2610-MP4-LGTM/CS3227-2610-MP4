// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createLlmBoundary } from "@/server/llm/boundary";
import { createSocProvider } from "@/server/llm/provider";
import { limits, uid } from "../server/llm/fixtures";

it.each([
  { data: null, error: null, expected: "FORBIDDEN" },
  { data: null, error: { message: "PRIVATE_DATABASE_SENTINEL" }, expected: "SERVICE_UNAVAILABLE" },
])("rejects missing or unavailable stored profiles before privileged access %#", async profile => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(profile) };
  const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: uid(1) } }, error: null }) },
    from: vi.fn().mockReturnValue(query) } as unknown as Parameters<typeof createLlmBoundary>[0]["client"];
  const accounting = { reserve: vi.fn(), markDispatched: vi.fn(), settle: vi.fn(), close: vi.fn(),
    read: vi.fn(), gradingContext: vi.fn() };
  const provider = { execute: vi.fn() };
  const boundary = createLlmBoundary({ client, accounting, provider, limits, clock: () => Date.now() });
  const request = { operation: "inject_flaws", resourceId: uid(101), idempotencyKey: uid(102), expectedVersion: 1 };
  expect(await boundary.execute(request)).toEqual({ error: { code: profile.expected } });
  expect(await boundary.readUsage()).toEqual({ error: { code: profile.expected } });
  expect(accounting.reserve).not.toHaveBeenCalled();
  expect(accounting.read).not.toHaveBeenCalled();
  expect(accounting.gradingContext).not.toHaveBeenCalled();
  expect(provider.execute).not.toHaveBeenCalled();
});

it("sanitizes malformed transport destinations without dispatch", () => {
  const destination = "PRIVATE_DESTINATION_SENTINEL is not a URL";
  const fetch = vi.fn();
  try {
    createSocProvider({ destination, model: "test-model", apiKey: "PRIVATE_KEY_SENTINEL", fetch, limits, verifiedLimits: true });
    expect.fail("invalid destination must fail closed");
  } catch (error) {
    expect(error).toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(String(error)).not.toContain("PRIVATE_DESTINATION_SENTINEL");
    expect(String(error)).not.toContain("PRIVATE_KEY_SENTINEL");
    expect(JSON.stringify(error)).not.toContain(destination);
  }
  expect(fetch).not.toHaveBeenCalled();
});
