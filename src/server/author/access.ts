import "server-only";
import type { WorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { getAccount } from "@/server/auth/account";
import { createClient } from "@/server/supabase/server";

export type AuthorClient = Awaited<ReturnType<typeof createClient>>;
export type AuthorCaller = { status: "ok"; client: AuthorClient; account: { id: string } };

/** SYS-08: verify the session and stored Author role next to every protected entry point. */
export async function authorCaller(): Promise<AuthorCaller | WorkspaceAccessFailure> {
  try {
    const client = await createClient();
    const result = await getAccount(undefined, client);
    if (result.status === "unauthenticated") return { status: "unauthenticated" };
    if (result.status === "forbidden") return { status: "account_unavailable" };
    if (result.status !== "ok") return { status: "account_service_unavailable" };
    if (result.account.role !== "author") return { status: "role_denied" };
    return { status: "ok", client, account: { id: result.account.id } };
  } catch {
    return { status: "account_service_unavailable" };
  }
}
