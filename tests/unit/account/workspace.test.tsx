import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspacePage } from "@/components/account/workspace-page";
import { AccessScreen } from "@/components/account/access-screen";

const mocks = vi.hoisted(() => ({ getAccount: vi.fn(), redirect: vi.fn(), refresh: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.getAccount }));
vi.mock("@/server/auth/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ refresh: mocks.refresh }),
  usePathname: () => "/learner/challenges",
}));

const roles = ["learner", "author", "ta"] as const;
const destinations = { learner: "/learner/challenges", author: "/author/challenges", ta: "/ta/submissions" };
const ownLinks = { learner: ["Challenges", "Review history"], author: ["My challenges", "Create challenge"], ta: ["Submissions", "Flagged submissions", "Learners"] };
const account = (role: typeof roles[number]) => ({ id: "00000000-0000-4000-8000-000000000011", displayName: "Example user", role });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation((location: string) => { throw new Error(`REDIRECT:${location}`); });
});
afterEach(cleanup);

describe("workspace account boundary", () => {
  it("ACC-03.5 a forbidden record uses the account-specific denial message and workspace recovery link", () => {
    render(<AccessScreen kind="record-denied" workspaceHref="/learner/challenges" signOutAction={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Access denied" })).toBeTruthy();
    expect(screen.getByText("This item isn't available to your account.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to my workspace" }).getAttribute("href")).toBe("/learner/challenges");
  });

  it.each(roles)("ACC-03.2 ACC-03.8 renders only %s navigation with protected children", async (role) => {
    mocks.getAccount.mockResolvedValue({ status: "ok", account: account(role) });
    render(await WorkspacePage({ role, children: <p>Permitted workspace content</p> }));
    expect(mocks.getAccount).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Permitted workspace content")).toBeTruthy();
    expect(screen.getByRole("link", { name: "LGTM" }).getAttribute("href")).toBe(destinations[role]);
    expect(screen.getByText("Example user", { exact: true })).toBeTruthy();
    for (const candidate of roles) {
      for (const name of ownLinks[candidate]) {
        const link = screen.queryByRole("link", { name });
        expect(Boolean(link)).toBe(candidate === role);
      }
    }
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  for (const actual of roles) for (const requested of roles.filter((role) => role !== actual)) {
    it(`ACC-03.5 ACC-03.9 denies ${actual} direct access to ${requested} using the stored role`, async () => {
      mocks.getAccount.mockResolvedValue({ status: "ok", account: account(actual) });
      render(await WorkspacePage({ role: requested, children: <p>Forbidden destination content</p> }));
      expect(screen.getByRole("heading", { name: "Access denied" })).toBeTruthy();
      expect(screen.getByText("This page isn't available for your role.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Go to my workspace" }).getAttribute("href")).toBe(destinations[actual]);
      expect(screen.queryByText("Forbidden destination content")).toBeNull();
      for (const name of ownLinks[requested]) expect(screen.queryByRole("link", { name })).toBeNull();
    });
  }

  it("ACC-03.3 redirects unauthenticated access without rendering workspace children", async () => {
    mocks.getAccount.mockResolvedValue({ status: "unauthenticated" });
    await expect(WorkspacePage({ role: "learner", children: <p>Protected</p> })).rejects.toThrow("REDIRECT:/sign-in");
    const target = new URL(mocks.redirect.mock.calls[0]![0], "https://app.example.test");
    expect(target.pathname).toBe("/sign-in");
    // The query may carry an enum or the notice; browser tests assert its visible text.
    expect(target.search).not.toBe("");
  });

  it.each([
    ["ACC-03.6", "forbidden", "Account unavailable", "We couldn't load a valid account profile."],
    ["ACC-03.7", "unavailable", "Service unavailable", "We can't check your account right now. Try again."],
  ])("%s replaces all role content for %s and rechecks the current destination on retry", async (_criterion, status, heading, message) => {
    mocks.getAccount.mockResolvedValue({ status });
    render(await WorkspacePage({ role: "learner", children: <p>Protected child</p> }));
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByText("Protected child")).toBeNull();
    expect(screen.queryByLabelText("Role")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
