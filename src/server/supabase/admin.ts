import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getPublicSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseSecretKey } from "./env";

// Supabase client that bypasses row level security. Use only after the caller
// has been authorized server-side, and never pass it or its results unfiltered
// to the client.
export function createAdminClient() {
  const { url } = getPublicSupabaseEnv();
  return createClient<Database>(url, getSupabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
