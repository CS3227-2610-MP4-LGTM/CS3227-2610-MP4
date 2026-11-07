import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountForm } from "@/components/account/account-form";
import { SignOutControl } from "@/components/account/sign-out-control";
import type { AuthResult } from "@/server/auth/service";

afterEach(cleanup);

const values = { displayName: "  Example learner  ", email: "learner@example.test", password: " a b c ", role: "learner" };
function fill(mode: "sign-up" | "sign-in") {
  if (mode === "sign-up") {
    fireEvent.change(screen.getByLabelText("Display name", { exact: true }), { target: { value: values.displayName } });
    fireEvent.change(screen.getByLabelText("Role", { exact: true }), { target: { value: values.role } });
  }
  fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: values.email } });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), { target: { value: values.password } });
}
function submit(mode: "sign-up" | "sign-in") {
  fireEvent.submit(screen.getByRole("button", { name: mode === "sign-up" ? "Create account" : "Sign in" }).closest("form")!);
}
function checkRetention(mode: "sign-up" | "sign-in") {
  expect((screen.getByLabelText("Email", { exact: true }) as HTMLInputElement).value).toBe(values.email);
  expect((screen.getByLabelText("Password", { exact: true }) as HTMLInputElement).value).toBe("");
  if (mode === "sign-up") {
    expect((screen.getByLabelText("Display name", { exact: true }) as HTMLInputElement).value).toBe(values.displayName);
    expect((screen.getByLabelText("Role", { exact: true }) as HTMLSelectElement).value).toBe(values.role);
  }
  expect((screen.getByRole("button", { name: mode === "sign-up" ? "Create account" : "Sign in" }) as HTMLButtonElement).disabled).toBe(false);
}

describe("account form presentation", () => {
  it("ACC-01.1 presents required masked inputs, unselected immutable role choices and sign-in link", () => {
    render(<AccountForm mode="sign-up" action={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Create an account" })).toBeTruthy();
    for (const label of ["Display name", "Email", "Password", "Role"]) {
      expect((screen.getByLabelText(label, { exact: true }) as HTMLInputElement).required).toBe(true);
    }
    expect(screen.getByLabelText("Password", { exact: true }).getAttribute("type")).toBe("password");
    expect((screen.getByLabelText("Role", { exact: true }) as HTMLSelectElement).value).toBe("");
    for (const label of ["Learner — Practise reviewing code", "Author — Create review challenges", "TA — Moderate grades and support learners"]) {
      expect(screen.getByRole("option", { name: label })).toBeTruthy();
    }
    expect(screen.getByText("Your role cannot be changed after account creation.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
  });

  it("ACC-02.1 presents only required email/password and the account-creation link", () => {
    render(<AccountForm mode="sign-in" action={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByLabelText("Role", { exact: true })).toBeNull();
    expect(screen.getByLabelText("Password", { exact: true }).getAttribute("type")).toBe("password");
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe("/sign-up");
    expect(screen.queryByText(/forgot|reset|oauth|google|github|email link/i)).toBeNull();
  });

  it.each([
    ["sign-up", { displayName: "required", email: "required", password: "required", role: "invalid" }, ["Enter a display name.", "Enter your email.", "Enter a password.", "Choose Learner, Author or TA."]],
    ["sign-up", { displayName: "too_long", email: "invalid", password: "too_short" }, ["Display name is too long.", "Enter a valid email address.", "Password is too short."]],
    ["sign-in", { email: "required", password: "required" }, ["Enter your email.", "Enter a password."]],
    ["sign-in", { email: "invalid", password: "too_short" }, ["Enter a valid email address.", "Password is too short."]],
  ] as const)("ACC-01.2 ACC-02.2 displays all server field errors and focuses the first invalid field for %s %#", async (mode, fieldErrors, messages) => {
    const action = vi.fn().mockResolvedValue({ status: "invalid", fieldErrors });
    render(<AccountForm mode={mode} action={action} />);
    fill(mode);
    submit(mode);
    for (const message of messages) expect(await screen.findByText(message)).toBeTruthy();
    const first = screen.getByLabelText(mode === "sign-up" ? "Display name" : "Email", { exact: true });
    await waitFor(() => expect(document.activeElement).toBe(first));
    for (const [index, label] of Object.keys(fieldErrors).entries()) {
      const labels = { displayName: "Display name", email: "Email", password: "Password", role: "Role" };
      const field = screen.getByLabelText(labels[label as keyof typeof labels], { exact: true });
      expect(field.getAttribute("aria-invalid")).toBe("true");
      const ids = field.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
      expect(ids.some((id) => document.getElementById(id)?.textContent?.includes(messages[index]!))).toBe(true);
    }
  });

  it.each(["sign-up", "sign-in"] as const)("ACC-01.3 ACC-02.3 submits %s password unchanged and prevents repeat activation while pending", async (mode) => {
    let resolve!: (result: AuthResult) => void;
    const action = vi.fn<(data: FormData) => Promise<AuthResult>>(() => new Promise<AuthResult>((done) => { resolve = done; }));
    render(<AccountForm mode={mode} action={action} />);
    fill(mode);
    submit(mode);
    const pending = await screen.findByRole("button", { name: mode === "sign-up" ? "Creating account…" : "Signing in…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(pending);
    expect(action).toHaveBeenCalledTimes(1);
    const data = action.mock.calls[0]![0] as unknown as FormData;
    expect(data.get("password")).toBe(values.password);
    expect(data.get("email")).toBe(values.email);
    await act(async () => resolve({ status: "rejected" }));
    checkRetention(mode);
  });

  it.each([
    ["ACC-01.4", "sign-up", "rejected", "We couldn't create an account with these details. Check them or sign in."],
    ["ACC-01.5", "sign-up", "throttled", "Too many attempts. Try again later."],
    ["ACC-01.5", "sign-up", "unavailable", "Account creation is unavailable. Try again."],
    ["ACC-02.4", "sign-in", "rejected", "Email or password is incorrect."],
    ["ACC-02.4", "sign-in", "throttled", "Too many attempts. Try again later."],
    ["ACC-02.4", "sign-in", "unavailable", "Sign-in is unavailable. Try again."],
  ] as const)("%s presents %s %s safely and preserves retry fields", async (_criterion, mode, status, message) => {
    render(<AccountForm mode={mode} action={vi.fn().mockResolvedValue({ status })} />);
    fill(mode);
    submit(mode);
    const notice = await screen.findByText(message);
    expect(notice.closest('[role="alert"], [aria-live]')).toBeTruthy();
    checkRetention(mode);
    if (mode === "sign-up") expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });

  it.each([
    ["ACC-01.6", "sign-up", "We couldn't confirm account creation. Try signing in, or try again."],
    ["ACC-02.4", "sign-in", "We couldn't confirm sign-in. Try again."],
  ] as const)("%s distinguishes a lost %s response from a confirmed provider failure", async (_criterion, mode, message) => {
    render(<AccountForm mode={mode} action={vi.fn().mockRejectedValue(new TypeError("private transport detail"))} />);
    fill(mode);
    submit(mode);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText(/private transport detail/)).toBeNull();
    checkRetention(mode);
  });

  it("ACC-02.5 sign-out prevents a second action while pending", async () => {
    let resolve!: () => void;
    const action = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    render(<SignOutControl action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const pending = await screen.findByRole("button", { name: "Signing out…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(pending);
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
  });
});
