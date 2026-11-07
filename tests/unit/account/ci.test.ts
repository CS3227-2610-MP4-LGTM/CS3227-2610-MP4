// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("SYS-19.3 CI requires local Auth production-build Playwright alongside the existing integration suite", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  // Inspect the repository's top-level job blocks without adding a YAML runtime
  // dependency. Commands stay flexible; the test checks the delivery contract.
  const jobs = Array.from(workflow.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|(?![\s\S]))/gm));
  const integration = jobs.find(([, , body]) => /bun run test:integration/.test(body));
  const e2e = jobs.find(([, , body]) => /bun run test:e2e/.test(body));
  expect(integration, "preserve the local Auth integration job").toBeTruthy();
  expect(e2e, "add a dedicated Playwright e2e job").toBeTruthy();
  expect(e2e![1]).not.toBe(integration![1]);
  expect(e2e![2]).toMatch(/(?:bun run db:start|supabase start)/);
  expect(e2e![2]).toMatch(/playwright install(?:[^\n]*)chromium/);
  const verify = jobs.find(([, name]) => name === "verify");
  expect(verify).toBeTruthy();
  const dependencies = verify![2].match(/needs:\s*(\[[^\]]*\]|(?:\n\s+-[^\n]+)+)/)?.[1];
  expect(dependencies).toContain(e2e![1]);
  expect(dependencies).toContain(integration![1]);
  // Playwright must own an isolated production server, never attach to dev.
  const config = readFileSync("playwright.config.ts", "utf8");
  expect(config).toMatch(/reuseExistingServer:\s*false/);
  const launcher = readFileSync("tests/e2e/account/server.ts", "utf8");
  expect(launcher).toMatch(/await run\(\["build"\]\)/);
  expect(launcher).toMatch(/await run\(\["start"/);
  expect(launcher).toContain("localHarness()");
});
