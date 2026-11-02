import { z } from "zod";

const publicSupabaseEnvSchema = z.object({
  url: z.url(),
  publishableKey: z.string().min(1),
});

export type PublicSupabaseEnv = z.infer<typeof publicSupabaseEnvSchema>;

// Read each variable by its literal name so Next.js can inline NEXT_PUBLIC_*
// values into the browser bundle. Parsing happens on first use, not at import,
// so builds without Supabase configured still succeed.
export function getPublicSupabaseEnv(): PublicSupabaseEnv {
  const result = publicSupabaseEnvSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!result.success) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return result.data;
}
