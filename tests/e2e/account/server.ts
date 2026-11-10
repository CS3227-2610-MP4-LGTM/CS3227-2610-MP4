// Playwright's webServer launches this file; collecting tests does not touch Auth.
import { spawn } from "node:child_process";
import { localHarness } from "../../integration/auth/local";

const { url, key, secret } = localHarness();
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  SUPABASE_SECRET_KEY: secret,
  APP_ENV: "ci",
  AI_PROVIDER: "fake",
};
delete env.SOCLAAS_API_KEY;
let child: ReturnType<typeof spawn>;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => { child?.kill(signal); process.exit(0); });
}
async function run(args: string[]) {
  child = spawn("bun", ["--no-env-file", "run", ...args], { env, stdio: "inherit" });
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (code) process.exit(code);
}
await run(["build"]);
await run(["start", "--hostname", "127.0.0.1", "--port", "3100"]);
