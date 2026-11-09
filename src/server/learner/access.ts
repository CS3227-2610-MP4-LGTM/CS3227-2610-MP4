import "server-only";
import { getAccount } from "@/server/auth/account";
import type { createClient } from "@/server/supabase/server";

export type LearnerClient = Awaited<ReturnType<typeof createClient>>;

export async function checkLearnerAccount(client: LearnerClient) {
  const result = await getAccount(undefined, client);
  if (result.status === "unauthenticated") return { status: "unauthenticated" } as const;
  if (result.status === "forbidden") return { status: "account_unavailable" } as const;
  if (result.status !== "ok") return { status: "account_service_unavailable" } as const;
  if (result.account.role !== "learner") return { status: "role_denied" } as const;
  return result;
}
