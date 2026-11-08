// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { expect, it } from "vitest";

function files(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(path, entry.name)) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [join(path, entry.name)] : []);
}
it("SYS-01.1 every LLM entry poisons client imports using Next's server-only marker", () => {
  for (const entry of ["config", "contracts", "safety", "provider", "execution", "accounting", "boundary"]) {
    const path = `src/server/llm/${entry}.ts`;
    expect(existsSync(path), `new server-only interface ${path}`).toBe(true);
    expect(readFileSync(path, "utf8")).toMatch(/import\s+["']server-only["']/);
  }
  // The default/browser condition actually rejects the marker; unit suites that
  // mock it cannot demonstrate this part of the boundary.
  const require = createRequire(import.meta.url);
  expect(() => require("server-only")).toThrow(/Server Component/);
});
it("SYS-03.1 application SoC credential/transport references stay in the shared server-only boundary", () => {
  const offenders = files("src").filter(path => !path.startsWith("src/server/llm/")).filter(path =>
    /SOCLAAS_API_KEY|soclaas|(?:api\.)?soc\.nus\.edu/i.test(readFileSync(path, "utf8")));
  expect(offenders).toEqual([]);
  const clientModules = files("src").filter(path => /^\s*["']use client["']/m.test(readFileSync(path, "utf8")));
  for (const path of clientModules) expect(readFileSync(path, "utf8"), path).not.toMatch(/server\/llm|SOCLAAS_API_KEY|SUPABASE_SECRET_KEY/);
});
it("SYS-19.3 CI retains local Auth/domain suites and explicitly selects fake AI and local isolation", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const job = workflow.match(/^  integration:\n([\s\S]*?)(?=^  [\w-]+:\n|(?![\s\S]))/m)?.[1];
  expect(job).toBeTruthy();
  expect(job).toMatch(/AI_PROVIDER:\s*["']?fake/);
  expect(job).toMatch(/APP_ENV:\s*["']?(?:test|ci|local)/);
  expect(job).toContain("bun run test:integration");
  expect(job).not.toMatch(/secrets\.(?:SOCLAAS_API_KEY|SUPABASE_DB_URL|SUPABASE_SECRET_KEY)/);
});
