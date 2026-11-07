// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/service", () => ({ signUp: mocks.signUp, signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = () => import("@/server/auth/actions");
const values = { displayName: "  Display name  ", email: "account@example.test", password: " a b c ", role: "author" };
function form() {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation((location: string) => { throw new Error(`REDIRECT:${location}`); });
});

describe("account action adaptation", () => {
  it.each(["signUpAction", "signInAction"] as const)("ACC-01.2 ACC-02.2 %s delegates validation and returns all field errors", async (operation) => {
    const failure = { status: "invalid", fieldErrors: { email: "invalid", password: "too_short" } };
    const core = operation === "signUpAction" ? mocks.signUp : mocks.signIn;
    core.mockResolvedValue(failure);
    expect(await (await actions())[operation](form())).toEqual(failure);
    expect(core).toHaveBeenCalledWith(operation === "signUpAction" ? values : { email: values.email, password: values.password });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["signed_out", "sign_out_unconfirmed"] as const)("ACC-02.5 ACC-02.6 %s always delegates local sign-out and redirects to the sign-in form", async (status) => {
    mocks.signOut.mockResolvedValue({ status });
    await expect((await actions()).signOutAction()).rejects.toThrow("REDIRECT:/sign-in");
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(new URL(mocks.redirect.mock.calls[0]![0], "https://app.example.test").search).not.toBe("");
  });

});
