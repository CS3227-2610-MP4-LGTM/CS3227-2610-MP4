// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn(), createBrowserClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/ssr", () => mocks);
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }));
vi.mock("@/lib/supabase/env", () => ({ getPublicSupabaseEnv: () => ({
  url: "https://local-test-project.supabase.co", publishableKey: "public-test-key",
}) }));

beforeEach(() => vi.clearAllMocks());

describe("hosted SSR cookie policy", () => {
  it.each(["server", "browser", "proxy"] as const)("SYS-07.3 %s auth delivery uses secure path-wide Lax cookies without Domain", async (side) => {
    mocks.createServerClient.mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) } });
    if (side === "server") await (await import("@/server/supabase/server")).createClient();
    else if (side === "browser") (await import("@/lib/supabase/client")).createClient();
    else {
      const { NextRequest } = await import("next/server");
      await (await import("@/proxy")).proxy(new NextRequest("https://app.example.test/learner/challenges"));
    }
    const call = (side === "browser" ? mocks.createBrowserClient : mocks.createServerClient).mock.calls[0];
    const options = call?.[2]?.cookieOptions;
    expect(options).toMatchObject({ secure: true, path: "/", sameSite: "lax" });
    expect(options.domain).toBeUndefined();
  });
});
