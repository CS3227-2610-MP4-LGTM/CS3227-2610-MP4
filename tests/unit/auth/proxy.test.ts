// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import type { CookieMethodsServer } from "@supabase/ssr";

const state = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/env", () => ({ getPublicSupabaseEnv: () => ({ url: "http://127.0.0.1:54321", publishableKey: "local-test" }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: (_url: string, _key: string, options: { cookies: CookieMethodsServer }) => ({
  auth: { getUser: () => state.refresh(options.cookies), getClaims: () => state.refresh(options.cookies) },
}) }));

describe("proxy session transport", () => {
  beforeEach(() => {
    state.refresh.mockReset();
    state.refresh.mockImplementation(async (cookies: CookieMethodsServer) => {
      await cookies.setAll!([{ name: "sb-local-auth-token", value: "refreshed", options: { path: "/" } }], {
        "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0", Expires: "0", Pragma: "no-cache",
      });
      return { data: { user: { id: "local-user" } }, error: null };
    });
  });

  it.each(["/", "/sign-in", "/sign-up", "/learner/challenges", "/author/challenges", "/ta/submissions", "/api/v1/account"])(
    "SYS-07.1 proxy covers server-rendered and action/handler paths %s", async (url) => {
      const { config } = await import("@/proxy");
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url, headers: { "next-action": "test-action" } })).toBe(true);
    });

  it("SYS-07.1 refresh makes new credentials available to downstream server reads without redirect loops", async () => {
    const { proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost/learner/challenges", { headers: { cookie: "sb-local-auth-token=old" } });
    const response = await proxy(request);
    expect(state.refresh).toHaveBeenCalledOnce();
    expect(request.cookies.get("sb-local-auth-token")?.value).toBe("refreshed");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("sb-local-auth-token=refreshed");
    expect(response.headers.get("location")).toBeNull();
  });

  it("SYS-07.2 preserves all SSR adapter cache-prevention headers alongside auth cookie writes", async () => {
    const { proxy } = await import("@/proxy");
    const response = await proxy(new NextRequest("http://localhost/api/v1/account"));
    expect(response.headers.get("cache-control")).toBe("private, no-cache, no-store, must-revalidate, max-age=0");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.cookies.get("sb-local-auth-token")?.value).toBe("refreshed");
  });
});
