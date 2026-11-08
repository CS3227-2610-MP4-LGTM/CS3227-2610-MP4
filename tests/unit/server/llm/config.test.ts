// @vitest-environment node
import { expect, it, vi } from "vitest";
import { limits } from "./fixtures";
vi.mock("server-only", () => ({}));
import { getLlmConfig } from "@/server/llm/config";

it.each(["local", "test", "ci"])("SYS-13.1 forbids live dispatch in %s even with configured credentials", appEnv => {
  expect(() => getLlmConfig({ APP_ENV: appEnv, AI_PROVIDER: "soc", SOCLAAS_API_KEY: "sentinel-secret" })).toThrow();
  expect(getLlmConfig({ APP_ENV: appEnv, AI_PROVIDER: "fake" })).toMatchObject({ provider: "fake", limits });
});
it("SYS-13.3 hosted development defaults explicitly to fake", () => {
  expect(getLlmConfig({ APP_ENV: "development" })).toMatchObject({ provider: "fake" });
});
it.each([
  {}, { APP_ENV: "bogus", AI_PROVIDER: "fake" }, { APP_ENV: "test" },
  { APP_ENV: "test", AI_PROVIDER: "unknown-sentinel" },
  { APP_ENV: "production", AI_PROVIDER: "soc" },
])("SYS-15.1 invalid configuration fails closed with variable names and no values %#", env => {
  try { getLlmConfig(env); expect.fail("configuration should be rejected"); }
  catch (error) {
    expect(String(error)).toMatch(/APP_ENV|AI_PROVIDER|SOCLAAS_API_KEY/);
    expect(String(error)).not.toContain("unknown-sentinel");
    expect(String(error)).not.toContain("bogus");
  }
});
it("SYS-18.1 live configuration fails closed without verified enforcement and allocation evidence", () => {
  expect(() => getLlmConfig({ APP_ENV: "production", AI_PROVIDER: "soc", SOCLAAS_API_KEY: "sentinel-secret" })).toThrow();
});
