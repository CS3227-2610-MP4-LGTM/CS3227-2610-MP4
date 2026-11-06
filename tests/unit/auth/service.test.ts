// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({
  signUp: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(),
}));
const cookies = vi.hoisted(() => ({ clear: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: provider })),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  getAll: () => [{ name: "sb-local-auth-token", value: "current" }, { name: "theme", value: "dark" }],
  set: cookies.clear, delete: cookies.clear,
}) }));
vi.mock("@/server/supabase/admin", () => ({
  createAdminClient: () => { throw new Error("Auth must not use admin access"); },
}));

const valid = { displayName: " Learner A ", email: "learner@example.test", password: " a b c ", role: "learner" };
const session = { access_token: "access", refresh_token: "refresh" };
const user = { id: "00000000-0000-4000-8000-000000000011" };
const service = () => import("@/server/auth/service");

describe("auth server outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    provider.signUp.mockResolvedValue({ data: { user, session }, error: null });
    provider.signInWithPassword.mockResolvedValue({ data: { user, session }, error: null });
    provider.signOut.mockResolvedValue({ error: null });
  });

  it("SYS-05.1 creates a usable account without a confirmation step", async () => {
    const { signUp } = await service();
    expect(await signUp(valid)).toEqual({ status: "authenticated" });
    expect(provider.signUp).toHaveBeenCalledWith({ email: valid.email, password: valid.password,
      options: { data: { display_name: "Learner A", role: "learner" } } });
  });

  it.each(["learner", "author", "ta"])("SYS-06.2 accepts exact role %s and normalized profile fields", async (role) => {
    const { signUp } = await service();
    expect(await signUp({ ...valid, role })).toEqual({ status: "authenticated" });
  });

  it("SYS-05.2 reports all invalid fields before any provider call", async () => {
    const { signUp } = await service();
    expect(await signUp({ displayName: " ", email: "bad", password: "12345", role: "admin" })).toEqual({
      status: "invalid", fieldErrors: { displayName: "required", email: "invalid", password: "too_short", role: "invalid" },
    });
    expect(provider.signUp).not.toHaveBeenCalled();
  });

  it.each([null, {}, { ...valid, unexpected: true }, { ...valid, role: "TA" },
    { ...valid, displayName: "x".repeat(81) }, { ...valid, password: 123456 },
  ])("SYS-06.2 rejects malformed, missing, oversized or unexpected input %#", async (input) => {
    const { signUp } = await service();
    expect(await signUp(input)).toMatchObject({ status: "invalid" });
    expect(provider.signUp).not.toHaveBeenCalled();
  });

  it("SYS-06.2 accepts a display name at the 80-character boundary", async () => {
    const { signUp } = await service();
    expect(await signUp({ ...valid, displayName: "x".repeat(80) })).toEqual({ status: "authenticated" });
  });

  it("SYS-05.2 validates sign-in without changing password whitespace or adding composition rules", async () => {
    const { signIn } = await service();
    expect(await signIn({ email: valid.email, password: valid.password })).toEqual({ status: "authenticated" });
    expect(provider.signInWithPassword).toHaveBeenCalledWith({ email: valid.email, password: valid.password });
    provider.signInWithPassword.mockClear();
    expect(await signIn({ email: "", password: "" })).toEqual({ status: "invalid", fieldErrors: { email: "required", password: "required" } });
    expect(provider.signInWithPassword).not.toHaveBeenCalled();
  });

  it.each(["user_not_found", "invalid_credentials"])("SYS-05.3 makes credential rejection indistinguishable: %s", async (code) => {
    provider.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { code, status: 400, message: "private provider detail" } });
    const { signIn } = await service();
    expect(await signIn({ email: valid.email, password: valid.password })).toEqual({ status: "rejected" });
  });

  it.each(["signUp", "signIn"] as const)("SYS-11.4 %s distinguishes injected throttling and service failure without leaking diagnostics", async (operation) => {
    const { signUp, signIn } = await service();
    const call = operation === "signUp" ? () => signUp(valid) : () => signIn({ email: valid.email, password: valid.password });
    const mock = operation === "signUp" ? provider.signUp : provider.signInWithPassword;
    mock.mockResolvedValue({ data: { user: null, session: null }, error: { code: "over_request_rate_limit", status: 429, message: "private" } });
    expect(await call()).toEqual({ status: "throttled" });
    mock.mockResolvedValue({ data: { user: null, session: null }, error: { code: "unexpected_failure", status: 503, message: "private" } });
    expect(await call()).toEqual({ status: "unavailable" });
    mock.mockRejectedValue(new Error("private transport detail"));
    expect(await call()).toEqual({ status: "unavailable" });
  });

  it("SYS-06.1 reports provisioning failure without a success outcome", async () => {
    provider.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code: "unexpected_failure", status: 500 } });
    const { signUp } = await service();
    expect(await signUp(valid)).toEqual({ status: "unavailable" });
  });

  it("SYS-05.1 distinguishes confirmed account creation without a usable session", async () => {
    provider.signUp.mockResolvedValue({ data: { user, session: null }, error: null });
    const { signUp } = await service();
    expect(await signUp(valid)).toEqual({ status: "created_without_session" });
  });

  it("SYS-06.4 reports duplicate rejection without attempting to alter the existing role", async () => {
    provider.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code: "user_already_exists", status: 422 } });
    const { signUp } = await service();
    expect(await signUp({ ...valid, role: "ta" })).toEqual({ status: "rejected" });
  });

  it.each([false, true])("SYS-05.4 signs out locally and clears current auth cookies even on provider failure %s", async (fails) => {
    if (fails) provider.signOut.mockResolvedValue({ error: { status: 503, message: "private" } });
    const { signOut } = await service();
    expect(await signOut()).toEqual({ status: fails ? "sign_out_unconfirmed" : "signed_out" });
    expect(provider.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(cookies.clear).toHaveBeenCalled();
    expect(cookies.clear.mock.calls.flat().some((value) => value === "theme" || (typeof value === "object" && value?.name === "theme"))).toBe(false);
  });
});
