import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // One local Auth fixture and bounded sign-ins keep the suite below its rate limit.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // Repeating the whole Auth matrix can exceed the shared local sign-in quota.
  retries: 0,
  reporter: "list",
  // Keep generated browser artifacts out of the reviewable working tree.
  outputDir: ".next/playwright-results",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun --no-env-file tests/e2e/account/server.ts",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
