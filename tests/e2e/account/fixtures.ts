import { createServerClient } from "@supabase/ssr";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { localHarness } from "../../integration/auth/local";

export const roles = ["learner", "author", "ta"] as const;
export type Role = typeof roles[number];
export const destinations = { learner: "/learner/challenges", author: "/author/challenges", ta: "/ta/submissions" };
export const headings = { learner: "Challenges", author: "My challenges", ta: "Submissions" };
export const password = " e2e password ";
type Fixture = { id: string; email: string; displayName: string };
type Accounts = { harness: ReturnType<typeof localHarness>; users: Record<Role, Fixture> };

export const test = base.extend<{ signInAs: (role: Role) => Promise<void> }, { accounts: Accounts }>({
  accounts: [async ({}, provide, workerInfo) => {
    const harness = localHarness(); // Runtime only: --list needs no Docker or Auth.
    const users = {} as Record<Role, Fixture>;
    const created: string[] = [];
    try {
      for (const role of roles) {
        const email = `account-e2e-${process.pid}-${workerInfo.workerIndex}-${role}@example.test`;
        const displayName = `Account e2e ${role}`;
        const result = await harness.admin.auth.admin.createUser({ email, password, email_confirm: true,
          user_metadata: { display_name: displayName, role } });
        if (result.error || !result.data.user) throw new Error("Could not create a local e2e account");
        created.push(result.data.user.id);
        users[role] = { id: result.data.user.id, email, displayName };
      }
      await provide({ harness, users });
    } finally {
      for (const id of created) {
        const { error } = await harness.admin.auth.admin.deleteUser(id);
        if (error) throw new Error("Could not clean up a local e2e account");
      }
    }
  }, { scope: "worker" }],
  signInAs: async ({ context, accounts }, provide) => {
    await provide(async (role) => {
      // Most navigation probes seed a real local Auth session without repeating UI
      // sign-up. All-role browser journeys below independently cover form delivery.
      const client = createServerClient(accounts.harness.url, accounts.harness.key, {
        cookies: {
          getAll: () => [],
          setAll: async (items) => {
            await context.addCookies(items.map(({ name, value, options }) => ({ name, value,
              domain: "127.0.0.1", path: options.path ?? "/", httpOnly: options.httpOnly ?? false,
              secure: false, sameSite: "Lax" as const })));
          },
        },
      });
      const result = await client.auth.signInWithPassword({ email: accounts.users[role].email, password });
      if (result.error) throw new Error("Could not establish a local e2e session");
    });
  },
});

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function expireSession(context: BrowserContext, revokeRefresh: boolean) {
  const cookies = (await context.cookies()).filter(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
  expect(cookies.length).toBeGreaterThan(0);
  cookies.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const encoded = cookies.map(({ value }) => value).join("");
  expect(encoded.startsWith("base64-")).toBe(true);
  const session = JSON.parse(Buffer.from(encoded.slice(7), "base64url").toString("utf8"));
  const jwt = session.access_token.split(".");
  const payload = JSON.parse(Buffer.from(jwt[1], "base64url").toString("utf8"));
  payload.exp = Math.floor(Date.now() / 1000) - 60;
  jwt[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");
  session.access_token = jwt.join(".");
  session.expires_at = payload.exp;
  if (revokeRefresh) session.refresh_token = "invalid-local-e2e-refresh-token";
  const replacement = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  // Preserve the adapter's original chunk boundaries and cookie attributes.
  let offset = 0;
  await context.addCookies(cookies.map((cookie, index) => {
    const length = index === cookies.length - 1 ? replacement.length - offset : cookie.value.length;
    const value = replacement.slice(offset, offset + length);
    offset += length;
    return { ...cookie, value };
  }));
}

export { expect };
