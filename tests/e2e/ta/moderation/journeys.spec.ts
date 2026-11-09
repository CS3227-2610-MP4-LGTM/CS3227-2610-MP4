import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { createInspectionFixture } from "../../../integration/ta/inspection/fixture";
import { id } from "../../../unit/ta/inspection/evidence";
import { accountAccessHeader } from "@/lib/learner/challenges";
import { expireSession } from "../../account/fixtures";
const detail = `/ta/submissions/${id(501)}?from=flags&flagId=${id(801)}`;
const overrideApi = `**/api/v1/ta/submissions/${id(501)}/overrides`;
const resolutionApi = `**/api/v1/ta/flags/${id(801)}/resolutions`;
const test = base.extend<object, { inspection: Awaited<ReturnType<typeof createInspectionFixture>> }>({
  inspection: [async ({}, provide) => {
    const f = await createInspectionFixture();
    try { await provide(f); } finally {
      await f.h.db.query("begin");
      try {
        await f.h.db.query("set local session_replication_role = replica");
        await f.h.db.query("delete from public.grade_overrides where submission_id in($1,$2,$3) and id <> $4", [id(501), id(502), id(503), id(901)]);
        await f.h.db.query("delete from public.flag_resolutions where flag_id in($1,$2,$3) and id <> $4", [id(801), id(802), id(803), id(902)]);
        await f.h.db.query("delete from private.submission_audit_orders where submission_id in($1,$2,$3) and not(submission_id=$1 and audit_order in(1,2))", [id(501), id(502), id(503)]);
        await f.h.db.query("commit");
      } catch(error) { await f.h.db.query("rollback"); throw error; }
      finally { await f.dispose(); }
    }
  }, { scope: "worker" }],
});
async function login(page: Page, actor: {email: string; password: string}, destination: string) {
  await page.goto("/sign-in"); await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(destination);
}
const action = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).or(page.getByRole("link", { name, exact: true }));
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 60; i++) {
    if (await target.evaluate(el => document.activeElement === el)) { expect(await target.evaluate(el => el.matches(":focus-visible"))).toBe(true); return; }
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}
test.beforeEach(async ({ page, inspection }) => { await login(page, inspection.actors.taA, "/ta/submissions"); });
test("TA-02.1 TA-02.2 TA-02.3 queue URL/reload/back preserves filters, pagination and relevant flag navigation", async ({ page }) => {
  await page.goto("/ta/flags?limit=1");
  await expect(page.getByRole("heading", { name: "Flagged submissions" })).toBeVisible();
  for (const name of ["Submissions", "Flagged submissions", "Learners"]) await expect(page.getByRole("navigation").getByRole("link", { name, exact: true })).toBeVisible();
  await action(page, "Next page").click(); const pageUrl = page.url(); expect(new URL(pageUrl).searchParams.get("cursor")).toBeTruthy();
  await page.reload(); await expect(page).toHaveURL(pageUrl);
  await page.getByLabel("Flag reason", { exact: true }).selectOption("assessment_disagreement"); await action(page, "Apply filters").click();
  expect(new URL(page.url()).searchParams.has("cursor")).toBe(false);
  const view = page.getByRole("link", { name: "View submission" });
  await expect(view).toHaveCount(1); await expect(view).toHaveAttribute("href", new RegExp(`flagId=${id(803)}`));
  await view.click(); await expect(page.getByText("Awaiting TA review.").first()).toBeVisible();
  await expect(action(page, "Back to flagged submissions")).toBeVisible();
  await page.goBack(); await expect(page.getByLabel("Flag reason", { exact: true })).toHaveValue("assessment_disagreement");
  await page.goBack(); await expect(page).toHaveURL(pageUrl);
});
test("TA-02.3 handles queue failure, same-query retry and invalid cursor without false emptiness", async ({ page }) => {
  let reads = 0; const api = "**/api/v1/ta/flags*";
  await page.route(api, route => { reads++; return route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "Unavailable" } } }); });
  await page.goto("/ta/flags?kind=learner_report"); await expect(page.getByText("We couldn't load flagged submissions. Try again.")).toBeVisible();
  await expect(page.getByText("No flags match these filters.")).toHaveCount(0); await action(page, "Try again").click(); await expect.poll(() => reads).toBe(2);
  await page.unroute(api); await page.goto("/ta/flags?cursor=broken"); await expect(page.getByText("This queue page isn't valid.")).toBeVisible();
  await action(page, "First page").click(); await expect(page).toHaveURL("/ta/flags");
});
test("TA-02.4 TA-02.5 TA-02.6 resolves an open flag by keyboard, preserves another flag and original grade, then exposes correction history", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`/ta/submissions/${id(503)}?from=flags&flagId=${id(802)}`);
  const resolve = page.getByRole("button", { name: "Resolve flag", exact: true }).first(); await tabTo(page, resolve); await page.keyboard.press("Enter");
  await tabTo(page, page.getByLabel("Disposition", { exact: true })); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Tab");
  await expect(page.getByLabel("Reason", { exact: true })).toBeFocused(); await page.keyboard.type("Reviewed the near-pass evidence");
  await tabTo(page, action(page, "Save resolution")); await page.keyboard.press("Enter");
  await expect(page.getByText("Resolution saved.")).toBeVisible();
  await expect(page.getByText("Reviewed the near-pass evidence")).toBeVisible(); await expect(page.getByText("Awaiting TA review.")).toBeVisible();
  await expect(page.getByText("60 / 100", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Add correction", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.goto("/ta/flags"); await expect(page.getByRole("link", { name: "View submission" })).toHaveCount(1);
  await page.getByLabel("Status", { exact: true }).selectOption("resolved"); await action(page, "Apply filters").click();
  await expect(page.getByRole("link", { name: "View submission" })).toHaveCount(2);
});
test("TA-03.1 TA-03.2 TA-03.3 TA-03.4 SYS-17 keyboard form validates, cancels and appends a justified grade at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 }); await page.goto(detail);
  await tabTo(page, action(page, "Override grade")); await page.keyboard.press("Enter");
  await tabTo(page, action(page, "Save override")); await page.keyboard.press("Enter");
  await expect(page.getByLabel("Replacement score", { exact: true })).toBeFocused();
  await expect(page.getByText("Enter a replacement score.")).toBeVisible();
  await expect(page.getByLabel("Replacement score")).toHaveAttribute("aria-invalid", "true");
  await page.keyboard.type("59"); await page.keyboard.press("Tab"); await page.keyboard.type("<script>window.pwned=1</script> Reviewed evidence");
  await tabTo(page, action(page, "Cancel")); await page.keyboard.press("Enter"); await expect(action(page, "Override grade")).toBeFocused();
  await page.keyboard.press("Enter"); await expect(page.getByLabel("Replacement score")).toHaveValue(""); await expect(page.getByLabel("Reason", { exact: true })).toHaveValue("");
  await page.getByLabel("Replacement score").fill("59"); await page.getByLabel("Reason", { exact: true }).fill("<script>window.pwned=1</script> Reviewed evidence");
  await tabTo(page, action(page, "Save override")); await page.keyboard.press("Enter");
  await expect(page.getByText("Grade override saved.")).toBeVisible(); const current = page.getByRole("region", { name: "Current grade" });
  await expect(current).toContainText("59 / 100"); await expect(current).toContainText("Not passed"); await expect(current).toBeFocused();
  await expect(page.getByRole("region", { name: "Original assessment" })).toContainText("25 / 100");
  await expect(page.getByRole("region", { name: "Override history" })).toContainText("<script>window.pwned=1</script> Reviewed evidence");
  expect(await page.evaluate(() => "pwned" in window)).toBe(false); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
test("TA-02.7 TA-03.6 uncertain save retries the same idempotency key without duplicate history", async ({ page }) => {
  for (const kind of ["override", "resolution"]) {
    const api = kind === "override" ? overrideApi : resolutionApi; const keys: (string | undefined)[] = []; let calls = 0;
    await page.goto(detail); await page.route(api, async route => {
      keys.push(route.request().headers()["idempotency-key"]); calls++;
      if (calls === 1) { const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort("failed"); }
      else await route.continue();
    });
    await action(page, kind === "override" ? "Override grade" : "Add correction").click();
    if (kind === "override") await page.getByLabel("Replacement score").fill("70"); else await page.getByLabel("Disposition").selectOption("dismissed");
    const reason = `Lost response ${kind}`; await page.getByLabel("Reason", { exact: true }).fill(reason);
    await action(page, kind === "override" ? "Save override" : "Save resolution").click();
    await expect(page.getByText(`We couldn't save this ${kind}. Try again.`)).toBeVisible(); await expect(page.getByLabel("Reason", { exact: true })).toHaveValue(reason);
    await action(page, "Try again").click(); await expect(page.getByText(kind === "override" ? "Grade override saved." : "Resolution saved.")).toBeVisible();
    expect(keys).toHaveLength(2); expect(keys[0]).toMatch(/^[a-f0-9-]{36}$/i); expect(keys[1]).toBe(keys[0]);
    await expect(page.getByText(reason, { exact: true })).toHaveCount(1); await page.unroute(api);
  }
});
test("TA-02.8 TA-03.8 SYS-09.3 SYS-11 auth failures and switching accounts never replay a pending decision or preserve privileges", async ({ page, inspection }) => {
  for (const [kind, api] of [["override", overrideApi], ["resolution", resolutionApi]] as const) {
    for (const [http, code, access, heading] of [[403, "FORBIDDEN", "account_unavailable", "Account unavailable"], [503, "SERVICE_UNAVAILABLE", "account_service_unavailable", "Service unavailable"], [403, "FORBIDDEN", "role_denied", "Access denied"]] as const) {
      let writes = 0; await page.goto(detail);
      await page.route(api, route => { writes++; return route.fulfill({ status: http, headers: { [accountAccessHeader]: access }, json: { error: { code, message: "Access unavailable" } } }); });
      await action(page, kind === "override" ? "Override grade" : "Add correction").click();
      if (kind === "override") await page.getByLabel("Replacement score").fill("100"); else await page.getByLabel("Disposition").selectOption("upheld");
      await page.getByLabel("Reason", { exact: true }).fill("Interrupted decision"); await action(page, kind === "override" ? "Save override" : "Save resolution").click();
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible(); await expect(page.getByRole("region", { name: "Source" })).toHaveCount(0);
      await page.goto(detail); await expect(page.getByRole("region", { name: "Source" })).toBeVisible();
      expect(writes).toBe(1); await expect(page.getByText("Interrupted decision")).toHaveCount(0); await page.unroute(api);
    }
  }
  let writes = 0; await page.route(overrideApi, route => { writes++; return route.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED", message: "Sign in" } } }); });
  await action(page, "Override grade").click(); await page.getByLabel("Replacement score").fill("100"); await page.getByLabel("Reason", { exact: true }).fill("Session expired decision");
  await expireSession(page.context(), true);
  await action(page, "Save override").click(); await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await login(page, inspection.actors.taB, "/ta/submissions"); await page.goto(detail); expect(writes).toBe(1); await expect(page.getByText("Session expired decision")).toHaveCount(0); await page.unroute(overrideApi);
  await page.getByRole("button", { name: "Sign out" }).click(); await login(page, inspection.actors.learnerB, "/learner/challenges");
  await page.goto(detail); await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible(); await page.reload();
  await expect(page.getByRole("region", { name: "Override history" })).toHaveCount(0); await page.goBack(); await expect(action(page, "Save override")).toHaveCount(0);
});
