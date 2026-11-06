import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

// Capture only CLI JSON in memory. Never load .env files or print keys/URLs.
// This helper is called only by the orchestrator's explicit integration run.
export function localHarness() {
  const result = spawnSync("bunx", ["--no-env-file", "supabase", "status", "-o", "json"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("Local Supabase status unavailable; run the doctor with required permissions");
  let config: Record<string, string>;
  try { config = JSON.parse(result.stdout); }
  catch { throw new Error("Local Supabase status did not return JSON"); }
  const url = config.API_URL;
  const key = config.PUBLISHABLE_KEY || config.ANON_KEY;
  const secret = config.SECRET_KEY || config.SERVICE_ROLE_KEY;
  const dbUrl = config.DB_URL;
  for (const value of [url, dbUrl]) {
    const target = new URL(value);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) throw new Error("Integration tests require loopback services");
  }
  if (!key || !secret) throw new Error("Local Supabase test keys unavailable");
  const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return {
    url, key, client,
    admin: createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }),
    db: new Client({ connectionString: dbUrl }),
  };
}
