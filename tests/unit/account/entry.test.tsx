import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountEntry } from "@/components/account/account-entry";
import { signOutAction, signUpAction } from "@/server/auth/actions";

const mocks = vi.hoisted(() => ({ getAccount: vi.fn(), signUp: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), redirect: vi.fn(), refresh: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.getAccount }));
vi.mock("@/server/auth/service", () => ({ signUp: mocks.signUp, signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAccount.mockResolvedValue({ status: "unauthenticated" });
  mocks.redirect.mockImplementation((location: string) => { throw new Error(`REDIRECT:${location}`); });
});
afterEach(cleanup);

describe("account entry and completion notices", () => {
  for (const mode of ["root", "sign-in", "sign-up"] as const) {
    it.each([
      ["learner", "/learner/challenges"], ["author", "/author/challenges"], ["ta", "/ta/submissions"],
    ])(`ACC-03.1 ACC-01.7 ACC-02.8 ${mode} sends a usable %s account to %s`, async (role, destination) => {
      mocks.getAccount.mockResolvedValue({ status: "ok", account: { id: "00000000-0000-4000-8000-000000000011", displayName: "Stored user", role } });
      await expect(AccountEntry({ mode })).rejects.toThrow(`REDIRECT:${destination}`);
      expect(mocks.redirect).toHaveBeenCalledWith(destination);
    });
  }

  it("ACC-03.3 signed-out root opens sign-in without a protected-access notice", async () => {
    await expect(AccountEntry({ mode: "root" })).rejects.toThrow("REDIRECT:/sign-in");
    expect(mocks.redirect).toHaveBeenCalledWith("/sign-in");
  });

  it.each([
    ["ACC-01.6", "created_without_session", "Account created. Sign in to continue."],
    ["ACC-02.5", "signed_out", "You have signed out."],
    ["ACC-02.6", "sign_out_unconfirmed", "Local sign-out completed, but the service could not confirm sign-out. Sign in again to continue."],
  ])("%s round-trips %s through the redirect to its exact sign-in notice", async (_criterion, status, message) => {
    if (status === "created_without_session") {
      mocks.signUp.mockResolvedValue({ status });
      await expect(signUpAction(new FormData())).rejects.toThrow("REDIRECT:/sign-in");
    } else {
      mocks.signOut.mockResolvedValue({ status });
      await expect(signOutAction()).rejects.toThrow("REDIRECT:/sign-in");
    }
    const target = new URL(mocks.redirect.mock.calls[0]![0], "https://app.example.test");
    expect(target.pathname).toBe("/sign-in");
    const notice = target.searchParams.get("notice");
    expect(notice).toBeTruthy();
    render(await AccountEntry({ mode: "sign-in", notice: notice! }));
    const displayed = screen.getByText(message);
    expect(displayed.closest('[role="alert"], [role="status"], [aria-live]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create an account" })).toBeTruthy();
    if (status === "sign_out_unconfirmed") expect(screen.queryByText("You have signed out.")).toBeNull();
  });

  it.each(["forbidden", "unavailable"])("ACC-03.6 ACC-03.7 public account pages fail closed for %s instead of showing a role selector", async (status) => {
    mocks.getAccount.mockResolvedValue({ status });
    render(await AccountEntry({ mode: "sign-up" }));
    expect(screen.getByRole("heading", { name: status === "forbidden" ? "Account unavailable" : "Service unavailable" })).toBeTruthy();
    expect(screen.queryByLabelText("Role", { exact: true })).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("SYS-16.1 ignores unknown notice text rather than reflecting provider or query diagnostics", async () => {
    render(await AccountEntry({ mode: "sign-in", notice: "private-provider-detail<script>alert(1)</script>" }));
    expect(screen.queryByText(/private-provider-detail/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });
});
