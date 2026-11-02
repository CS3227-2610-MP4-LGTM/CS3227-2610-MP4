import "server-only";
import { z } from "zod";

const secretKeySchema = z.string().min(1);

// SUPABASE_SECRET_KEY bypasses row level security. Only server code may read it.
export function getSupabaseSecretKey(): string {
  const result = secretKeySchema.safeParse(process.env.SUPABASE_SECRET_KEY);
  if (!result.success) {
    throw new Error("Supabase admin access is not configured: set SUPABASE_SECRET_KEY.");
  }
  return result.data;
}
