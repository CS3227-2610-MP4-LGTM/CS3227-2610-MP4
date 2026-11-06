// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
function section(toml: string, name: string) {
  const lines = toml.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `[${name}]`);
  return lines.slice(start + 1).slice(0, lines.slice(start + 1).findIndex((line) => /^\[/.test(line)) < 0
    ? undefined : lines.slice(start + 1).findIndex((line) => /^\[/.test(line)))
    .filter((line) => !line.trim().startsWith("#")).join("\n");
}

describe("local Auth settings and CI delivery", () => {
  it("SYS-15.2 local Auth enables password accounts without confirmation or excluded authentication methods", () => {
    const config = root("supabase/config.toml");
    const auth = section(config, "auth");
    expect(auth).toMatch(/^enable_signup\s*=\s*true$/m);
    expect(auth).toMatch(/^minimum_password_length\s*=\s*6$/m);
    expect(auth).toMatch(/^password_requirements\s*=\s*""$/m);
    expect(auth).toMatch(/^enable_anonymous_sign_ins\s*=\s*false$/m);
    expect(section(config, "auth.email")).toMatch(/^enable_confirmations\s*=\s*false$/m);
    expect(section(config, "auth.email")).toMatch(/^enabled\s*=\s*true$/m);
    expect(section(config, "auth.sms")).toMatch(/^enabled\s*=\s*false$/m);
    expect(section(config, "auth.mfa.totp")).toMatch(/^enroll_enabled\s*=\s*false$/m);
    expect(section(config, "auth.mfa.phone")).toMatch(/^enroll_enabled\s*=\s*false$/m);
    for (const name of config.matchAll(/^\[(auth\.external\.[^\]]+)\]/gm)) {
      expect(section(config, name[1])).toMatch(/^enabled\s*=\s*false$/m);
    }
  });

  it("SYS-15.3 local redirect allowlist contains only exact development and Playwright origins", () => {
    const auth = section(root("supabase/config.toml"), "auth");
    const site = auth.match(/^site_url\s*=\s*"([^"]+)"$/m)?.[1];
    const redirects = [...(auth.match(/^additional_redirect_urls\s*=\s*\[([^\]]*)\]/m)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(site).toBe("http://127.0.0.1:3000");
    expect(redirects.length).toBeGreaterThan(0);
    for (const value of [site!, ...redirects]) {
      const url = new URL(value);
      expect(["127.0.0.1", "localhost"]).toContain(url.hostname);
      expect(["3000", "3100"]).toContain(url.port);
      expect(value).not.toContain("*");
      expect(url.pathname).toBe("/");
    }
  });

  it("SYS-15.4 local settings retain rotation, one-hour JWT lifetime and ten-second reuse", () => {
    const auth = section(root("supabase/config.toml"), "auth");
    expect(auth).toMatch(/^jwt_expiry\s*=\s*3600$/m);
    expect(auth).toMatch(/^enable_refresh_token_rotation\s*=\s*true$/m);
    expect(auth).toMatch(/^refresh_token_reuse_interval\s*=\s*10$/m);
  });

  it("SYS-19.1 default unit suite excludes database-backed tests and integration has a separate Node script", () => {
    const manifest = JSON.parse(root("package.json"));
    expect(manifest.scripts["test:integration"]).toMatch(/vitest\s+run.*--config\s+vitest\.integration\.config\.mts/);
    expect(root("vitest.config.mts")).toContain('"tests/integration/**"');
    expect(root("vitest.integration.config.mts")).toContain('environment: "node"');
    expect(manifest.devDependencies.pg).toBeTruthy();
    expect(manifest.dependencies.pg).toBeUndefined();
  });

  it("SYS-19.3 CI runs local Auth integration and verify requires that job", () => {
    const ci = root(".github/workflows/ci.yml");
    const job = ci.match(/^  ([\w-]*integration[\w-]*):\s*$/m)?.[1];
    expect(job, "CI must provide a local Auth integration job").toBeDefined();
    const start = ci.indexOf(`  ${job}:`);
    const body = ci.slice(start).split(/\n(?=  [\w-]+:\s*\n)/)[0];
    expect(body).toMatch(/supabase\s+start|db:start/);
    expect(body).toContain("test:integration");
    expect(body).not.toMatch(/-x[^\n]*gotrue/);
    const verify = ci.slice(ci.indexOf("  verify:"));
    expect(verify.match(/needs:\s*\[([^\]]+)\]/)?.[1].split(/,\s*/).map((name) => name.trim())).toContain(job);
    expect(body).toContain("node-version-file: .node-version");
  });
});
