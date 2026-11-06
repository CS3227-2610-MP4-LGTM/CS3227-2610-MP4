import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/server/supabase/server";
import { fieldErrors, signInSchema, signUpSchema, type FieldError } from "./validation";

export type AuthResult =
  | { status: "authenticated" | "created_without_session" | "rejected" | "throttled" | "unavailable" }
  | { status: "invalid"; fieldErrors: Record<string, FieldError> };

function providerFailure(error: { status?: number; code?: string }): AuthResult {
  if (error.status === 429) return { status: "throttled" };
  if (!error.status || error.status >= 500) return { status: "unavailable" };
  return { status: "rejected" };
}

export async function signUp(input: unknown): Promise<AuthResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fieldErrors: fieldErrors(parsed.error) };
  const { displayName, email, password, role } = parsed.data;
  try {
    const client = await createClient();
    const { data, error } = await client.auth.signUp({ email, password,
      options: { data: { display_name: displayName, role } } });
    if (error) return providerFailure(error);
    if (!data.user) return { status: "unavailable" };
    return { status: data.session ? "authenticated" : "created_without_session" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function signIn(input: unknown): Promise<AuthResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fieldErrors: fieldErrors(parsed.error) };
  try {
    const client = await createClient();
    const { data, error } = await client.auth.signInWithPassword(parsed.data);
    if (error) return providerFailure(error);
    return { status: data.user && data.session ? "authenticated" : "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function signOut(): Promise<{ status: "signed_out" | "sign_out_unconfirmed" }> {
  let confirmed = false;
  try {
    const client = await createClient();
    confirmed = !(await client.auth.signOut({ scope: "local" })).error;
  } catch {
    // Provider/network failure cannot leave this browser locally authenticated.
  } finally {
    const store = await cookies();
    for (const { name } of store.getAll()) {
      if (/^sb-.+-auth-token(?:-code-verifier)?(?:\.\d+)?$/.test(name)) {
        store.set(name, "", { path: "/", maxAge: 0 });
      }
    }
  }
  return { status: confirmed ? "signed_out" : "sign_out_unconfirmed" };
}
