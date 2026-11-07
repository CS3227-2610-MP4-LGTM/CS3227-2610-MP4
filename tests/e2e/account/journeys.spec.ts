import { test, expect, roles, destinations, headings, password, signIn, expireSession } from "./fixtures";

test.describe("account pages against production Next and local Supabase Auth", () => {
  for (const role of roles) {
    test(`ACC-01.3 ACC-02.3 ACC-02.5 ACC-03.1 ${role} creates an account, signs out and signs back in`, async ({ page, context, accounts }, testInfo) => {
      const email = `account-signup-${process.pid}-${testInfo.retry}-${role}@example.test`;
      let id: string | undefined;
      try {
        await page.goto("/sign-up");
        await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
        await page.getByLabel("Display name", { exact: true }).fill(`  Browser ${role}  `);
        await page.getByLabel("Email", { exact: true }).fill(email);
        await page.getByLabel("Password", { exact: true }).fill(password);
        await page.getByLabel("Role", { exact: true }).selectOption(role);
        await page.getByRole("button", { name: "Create account", exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${destinations[role]}(?:\\?|$)`));
        await expect(page.getByRole("heading", { name: headings[role], exact: true })).toBeVisible();
        await expect(page.getByText("Account created.", { exact: true })).toBeVisible();
        const nav = page.getByRole("navigation");
        await expect(nav.getByText(`Browser ${role}`, { exact: true })).toBeVisible();
        await expect(nav.getByText(role === "ta" ? "TA" : role[0].toUpperCase() + role.slice(1), { exact: true })).toBeVisible();

        const authCookies = (await context.cookies()).filter(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
        expect(authCookies.length).toBeGreaterThan(0);
        for (const cookie of authCookies) {
          expect(cookie.path).toBe("/");
          expect(cookie.sameSite).toBe("Lax");
          expect(cookie.domain).toBe("127.0.0.1");
        }
        await page.getByRole("button", { name: "Sign out", exact: true }).click();
        await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
        await expect(page.getByText("You have signed out.", { exact: true })).toBeVisible();
        expect((await context.cookies()).filter(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name))).toHaveLength(0);
        await signIn(page, email);
        await expect(page).toHaveURL(new RegExp(`${destinations[role]}(?:\\?|$)`));
        await expect(page.getByRole("heading", { name: headings[role], exact: true })).toBeVisible();
      } finally {
        // Lookup is restricted to the unique email created by this test, on local Auth.
        const listed = await accounts.harness.admin.auth.admin.listUsers({ perPage: 1000 });
        id = listed.data.users.find((user) => user.email === email)?.id;
        if (id) {
          const deleted = await accounts.harness.admin.auth.admin.deleteUser(id);
          if (deleted.error) throw new Error("Could not clean up browser-created account");
        }
      }
    });
  }

  test("ACC-01.2 ACC-02.2 invalid forms show all errors, focus and no workspace", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    for (const message of ["Enter a display name.", "Enter your email.", "Enter a password.", "Choose Learner, Author or TA."]) {
      await expect(page.getByText(message, { exact: true })).toBeVisible();
    }
    await expect(page.getByLabel("Display name", { exact: true })).toBeFocused();
    await expect(page).toHaveURL(/\/sign-up/);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await page.goto("/sign-in");
    await page.getByLabel("Email", { exact: true }).fill("invalid-email");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Enter a valid email address.", { exact: true })).toBeVisible();
    await expect(page.getByText("Password is too short.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  });

  test("ACC-01.4 ACC-01.7 duplicate sign-up cannot replace an existing role", async ({ page, accounts }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Display name", { exact: true }).fill("Replacement");
    await page.getByLabel("Email", { exact: true }).fill(accounts.users.learner.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Role", { exact: true }).selectOption("ta");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByText("We couldn't create an account with these details. Check them or sign in.", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up/);
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await signIn(page, accounts.users.learner.email);
    await expect(page).toHaveURL(/\/learner\/challenges(?:\?|$)/);
  });

  test("ACC-02.4 unknown email and wrong password display indistinguishable failures", async ({ page, accounts }) => {
    for (const email of ["account-e2e-does-not-exist@example.test", accounts.users.learner.email]) {
      await page.goto("/sign-in");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByText("Email or password is incorrect.", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
      await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
      await expect(page.getByRole("navigation")).toHaveCount(0);
    }
  });

  test("ACC-03.3 direct signed-out access shows the notice and ignores return destinations", async ({ page, accounts }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByText("Sign in to continue.", { exact: true })).toHaveCount(0);
    await page.goto("/author/challenges?returnTo=https://untrusted.example.test");
    await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
    await expect(page.getByText("Sign in to continue.", { exact: true })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill(accounts.users.learner.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/learner\/challenges(?:\?|$)/);
  });

  for (const role of roles) {
    test(`ACC-03.1 ACC-03.2 ACC-03.5 ACC-03.8 ${role} navigation, empty states and all cross-role denials`, async ({ page, signInAs }) => {
      await signInAs(role);
      for (const entry of ["/", "/sign-in", "/sign-up"]) {
        await page.goto(entry);
        await expect(page).toHaveURL(new RegExp(`${destinations[role]}(?:\\?|$)`));
      }
      const items = role === "learner"
        ? [["Challenges", "/learner/challenges", "No challenges available."], ["Review history", "/learner/history", "No reviews yet."]]
        : role === "author"
          ? [["My challenges", "/author/challenges", "No challenges yet."], ["Create challenge", "/author/challenges/new", null]]
          : [["Submissions", "/ta/submissions", "No submissions yet."], ["Flagged submissions", "/ta/flags", "No flagged submissions."], ["Learners", "/ta/learners", "No learners yet."]];
      for (const [label, path, empty] of items) {
        await page.getByRole("navigation").getByRole("link", { name: label!, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${path}(?:\\?|$)`));
        await expect(page.getByRole("heading", { name: label!, exact: true })).toBeVisible();
        await expect(page.getByRole("navigation").getByRole("link", { name: label!, exact: true })).toHaveAttribute("aria-current", "page");
        if (empty) await expect(page.getByText(empty, { exact: true })).toBeVisible();
      }
      for (const other of roles.filter((value) => value !== role)) {
        await page.goto(destinations[other]);
        await expect(page.getByRole("heading", { name: "Access denied", exact: true })).toBeVisible();
        await expect(page.getByText("This page isn't available for your role.", { exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: headings[other], exact: true })).toHaveCount(0);
        await page.getByRole("link", { name: "Go to my workspace", exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${destinations[role]}(?:\\?|$)`));
      }
    });
  }

  test("SYS-07.1 SYS-07.3 ACC-03.4 a refreshable expired browser session reaches its requested permitted page", async ({ page, context, signInAs }) => {
    await signInAs("learner");
    await expireSession(context, false);
    const response = await page.goto("/learner/history");
    await expect(page).toHaveURL(/\/learner\/history$/);
    await expect(page.getByRole("heading", { name: "Review history", exact: true })).toBeVisible();
    expect(response?.headers()["cache-control"]).toMatch(/private/);
    expect(response?.headers()["cache-control"]).toMatch(/no-store/);
    expect((await response?.allHeaders())?.["set-cookie"]).toBeTruthy();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Review history", exact: true })).toBeVisible();
  });

  test("ACC-03.4 an unrefreshable expired session shows the expiry notice and never replays the destination", async ({ page, context, signInAs, accounts }) => {
    await signInAs("learner");
    await expireSession(context, true);
    await page.goto("/learner/history");
    await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
    await expect(page.getByText("Your session has expired. Sign in again.", { exact: true })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill(accounts.users.learner.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/learner\/challenges(?:\?|$)/);
  });

  test("ACC-02.7 ACC-03.9 SYS-09.3 prefetch, back, reload and account switching never restore the prior role", async ({ page, signInAs, accounts }) => {
    await signInAs("author");
    await page.goto("/author/challenges");
    // Exercise the visible Next link's production prefetch before signing out.
    const create = page.getByRole("navigation").getByRole("link", { name: "Create challenge", exact: true });
    await create.hover();
    await create.click();
    await expect(page.getByRole("heading", { name: "Create challenge", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Create challenge", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await signIn(page, accounts.users.learner.email);
    await expect(page).toHaveURL(/\/learner\/challenges(?:\?|$)/);
    await page.goBack();
    await expect(page.getByRole("link", { name: "My challenges", exact: true })).toHaveCount(0);
    await page.goto("/author/challenges/new");
    await expect(page.getByRole("heading", { name: "Access denied", exact: true })).toBeVisible();
    await expect(page.getByText(accounts.users.author.displayName, { exact: true })).toHaveCount(0);
  });

  test("ACC-03.9 editing Auth metadata cannot change navigation or stored-role authorization", async ({ page, signInAs, accounts }) => {
    await signInAs("learner");
    const changed = await accounts.harness.admin.auth.admin.updateUserById(accounts.users.learner.id, { user_metadata: { role: "ta" } });
    expect(changed.error).toBeNull();
    try {
      await page.goto("/");
      await expect(page).toHaveURL(/\/learner\/challenges(?:\?|$)/);
      await page.goto("/ta/submissions?role=ta");
      await expect(page.getByRole("heading", { name: "Access denied", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Submissions", exact: true })).toHaveCount(0);
    } finally {
      await accounts.harness.admin.auth.admin.updateUserById(accounts.users.learner.id, { user_metadata: { role: "learner" } });
    }
  });

  test("SYS-17.1 SYS-17.3 account forms fit phone width and are reachable by keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    for (const path of ["/sign-in", "/sign-up"]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const first = page.getByLabel(path === "/sign-up" ? "Display name" : "Email", { exact: true });
      await first.focus();
      await page.keyboard.type("keyboard@example.test");
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(["INPUT", "SELECT", "BUTTON", "A"]).toContain(focused);
    }
  });
});
