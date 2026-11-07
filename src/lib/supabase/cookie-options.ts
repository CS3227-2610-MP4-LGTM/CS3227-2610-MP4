// Local HTTP is supported for the isolated development stack. Hosted Auth uses
// HTTPS and therefore Secure cookies. Never set Domain: sessions are host-only.
export function authCookieOptions(supabaseUrl: string) {
  return { path: "/", sameSite: "lax" as const, secure: new URL(supabaseUrl).protocol === "https:" };
}
import type { CookieOptions } from "@supabase/ssr";


export function cookieWriteOptions(options: CookieOptions): CookieOptions {
  // Preserve an explicit expiry when cookies cross proxy/action adapters, so a
  // cleared credential cannot be rewritten as an empty session cookie.
  return options.maxAge === 0 ? { ...options, expires: new Date(0) } : options;
}
