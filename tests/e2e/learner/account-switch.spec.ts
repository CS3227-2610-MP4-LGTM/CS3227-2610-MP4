import { test, expect, type Page } from "@playwright/test";
import { createLearnerBrowseFixture } from "../../integration/domain/learner-browse-fixture";

const catalogue = "/learner/challenges";

async function signIn(page: Page, { email, password }: { email: string; password: string }) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(catalogue);
}

test("SYS-09.3 ACC-03.9 LRN-02.5 keeps first-attempt links scoped to the current Learner after switching accounts", async ({ page }) => {
  const fixture = await createLearnerBrowseFixture({ scope: "e2e" });
  try {
    const { actors, ids } = fixture;
    const challenge = `${catalogue}/${ids.c1}`;
    const attemptA = `/learner/history/${ids.firstA}`;
    const attemptB = `/learner/history/${ids.firstB}`;
    const firstAttempt = page.getByRole("link", { name: "View first attempt", exact: true });
    const priorLink = page.locator(`a[href="${attemptA}"]`);
    const card = page.getByRole("link", { name: "View challenge", exact: true })
      .and(page.locator(`a[href="${challenge}"]`));
    const expectOwnAttempt = async () => {
      await expect(page).toHaveURL(challenge);
      await expect(firstAttempt).toHaveAttribute("href", attemptB);
      await expect(priorLink).toHaveCount(0);
    };

    await page.goto("/sign-in");
    await signIn(page, actors.learnerA);
    await card.click();
    await expect(firstAttempt).toHaveAttribute("href", attemptA);
    await firstAttempt.click();
    await expect(page).toHaveURL(attemptA);
    await page.goBack();
    await expect(page).toHaveURL(challenge);
    await expect(firstAttempt).toHaveAttribute("href", attemptA);

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
    await expect(priorLink).toHaveCount(0);
    await signIn(page, actors.learnerB);

    // Let the sign-in entry's redirect for B commit before going Back again,
    // so its late history write cannot overwrite A's challenge entry.
    await page.goBack();
    await expect(priorLink).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/sign-in(?:\?|$)/);
    await page.goBack();
    await expectOwnAttempt();

    await page.getByRole("link", { name: "Back to challenges", exact: true }).click();
    await card.click();
    await expectOwnAttempt();

    await page.reload();
    await expectOwnAttempt();
  } finally {
    await fixture.dispose();
  }
});
