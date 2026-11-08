import "server-only";
import { z } from "zod";
import { createClient } from "@/server/supabase/server";
import { roleSchema, type Role } from "./validation";

type Failure = { status: "unauthenticated" | "forbidden" | "unavailable" };
type Account = { id: string; displayName: string; role: Role };
type AccountResult = { status: "ok"; account: Account } | Failure;
type ProfileResult = { status: "ok"; profile: Account | Omit<Account, "role"> } | Failure;
const profileSchema = z.object({ id: z.uuid(), display_name: z.string().min(1), role: roleSchema });

export async function getAccount(
  requiredRole?: Role,
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<AccountResult> {
  try {
    client ??= await createClient();
    const identity = await client.auth.getUser();
    if (identity.error) {
      return { status: !identity.error.status || identity.error.status >= 500
        ? "unavailable" : "unauthenticated" };
    }
    if (!identity.data.user) return { status: "unauthenticated" };
    const { data, error } = await client.from("profiles").select("id,display_name,role")
      .eq("id", identity.data.user.id).maybeSingle();
    if (error) return { status: "unavailable" };
    const profile = profileSchema.safeParse(data);
    if (!profile.success || profile.data.id !== identity.data.user.id) return { status: "forbidden" };
    if (requiredRole && profile.data.role !== requiredRole) return { status: "forbidden" };
    return { status: "ok", account: { id: profile.data.id,
      displayName: profile.data.display_name, role: profile.data.role } };
  } catch {
    return { status: "unavailable" };
  }
}

export async function readProfile(id: string): Promise<ProfileResult> {
  const caller = await getAccount();
  if (caller.status !== "ok") return caller;
  if (!z.uuid().safeParse(id).success) return { status: "forbidden" };
  if (caller.account.id === id) return { status: "ok", profile: caller.account };
  if (caller.account.role !== "ta") return { status: "forbidden" };
  try {
    const client = await createClient();
    const { data, error } = await client.from("profiles").select("id,display_name,role")
      .eq("id", id).maybeSingle();
    if (error) return { status: "unavailable" };
    const target = profileSchema.safeParse(data);
    if (!target.success || target.data.role !== "learner") return { status: "forbidden" };
    return { status: "ok", profile: { id: target.data.id, displayName: target.data.display_name } };
  } catch {
    return { status: "unavailable" };
  }
}

export function authErrorResponse(result: Failure): Response {
  const categories = {
    unauthenticated: [401, "UNAUTHENTICATED"],
    forbidden: [403, "FORBIDDEN"],
    unavailable: [503, "SERVICE_UNAVAILABLE"],
  } as const;
  const [status, code] = categories[result.status];
  return Response.json({ error: { code } }, { status,
    headers: { "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0" } });
}
