import { describe, expect, it } from "vitest";
import { authCookieOptions, cookieWriteOptions } from "@/lib/supabase/cookie-options";

describe("auth cookie options", () => {
  it("requires Secure for hosted HTTPS and supports local HTTP", () => {
    expect(authCookieOptions("https://test.supabase.co")).toEqual({ secure: true, path: "/", sameSite: "lax" });
    expect(authCookieOptions("http://127.0.0.1:54321").secure).toBe(false);
  });
  it("keeps deletion explicit across cookie adapters without changing ordinary writes", () => {
    expect(cookieWriteOptions({ path: "/", maxAge: 0 })).toEqual({ path: "/", maxAge: 0, expires: new Date(0) });
    const ordinary = { path: "/", maxAge: 3600, secure: true };
    expect(cookieWriteOptions(ordinary)).toBe(ordinary);
  });
});
