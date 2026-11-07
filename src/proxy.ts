import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { getPublicSupabaseEnv } from "@/lib/supabase/env";
import { authCookieOptions, cookieWriteOptions } from "@/lib/supabase/cookie-options";

// Proxy transports refreshed sessions. Each protected server operation still
// verifies identity and stored role at its own data boundary.
export async function proxy(request: NextRequest): Promise<NextResponse> {
  request.headers.delete("x-lgtm-session-expired");
  const hadSession = request.cookies.getAll().some(({ name, value }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name) && value);
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  try {
    const { url, publishableKey } = getPublicSupabaseEnv();
    const client = createServerClient<Database>(url, publishableKey, {
      cookieOptions: authCookieOptions(url),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(items, headers) {
          for (const { name, value } of items) request.cookies.set(name, value);
          const next = NextResponse.next({ request });
          // Preserve earlier cookie updates if the adapter emits more than once.
          for (const cookie of response.cookies.getAll()) next.cookies.set(cookie);
          for (const [name, value] of response.headers) {
            if (name !== "set-cookie" && !name.startsWith("x-middleware-")) next.headers.set(name, value);
          }
          for (const { name, value, options } of items) next.cookies.set(name, value, cookieWriteOptions(options));
          for (const [name, value] of Object.entries(headers)) next.headers.set(name, value);
          response = next;
        },
      },
    });
    const { error } = await client.auth.getUser();
    if (hadSession && error && error.status && error.status < 500) {
      request.headers.set("x-lgtm-session-expired", "1");
      // Presentation hint only; downstream operations still verify identity.
      const next = NextResponse.next({ request });
      for (const [name, value] of response.headers) {
        if (name !== "set-cookie" && !name.startsWith("x-middleware-")) next.headers.set(name, value);
      }
      for (const cookie of response.cookies.getAll()) next.cookies.set(cookie);
      response = next;
    }
  } catch {
    // No authorization is inferred here. Protected entry points fail closed
    // with their own unavailable/unauthenticated result, including no config.
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
