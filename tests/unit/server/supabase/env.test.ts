import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseSecretKey } from "@/server/supabase/env";

vi.mock("server-only", () => ({}));

describe("getSupabaseSecretKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the secret key when it is set", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");

    expect(getSupabaseSecretKey()).toBe("sb_secret_test");
  });

  it("throws a message naming the variable when it is missing", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);

    expect(() => getSupabaseSecretKey()).toThrow(/SUPABASE_SECRET_KEY/);
  });
});
