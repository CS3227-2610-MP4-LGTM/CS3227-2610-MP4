import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";
import { getPublicSupabaseEnv } from "@/lib/supabase/env";
import { authCookieOptions, cookieWriteOptions } from "@/lib/supabase/cookie-options";

// Supabase client for Server Components, Server Functions and Route Handlers.
// Runs as the user whose session is in the request cookies, so row level
// security applies. Create one per request; never share it between requests.
export async function createClient() {
  const { url, publishableKey } = getPublicSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookieOptions: authCookieOptions(url),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, cookieWriteOptions(options));
          }
        } catch {
          // Server Components cannot set cookies. Safe to ignore once a proxy
          // refreshes sessions on each request.
        }
      },
    },
  });
}
