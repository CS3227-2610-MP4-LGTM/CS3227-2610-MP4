import type { WorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { accountAccessHeader, type ReadFailure } from "@/lib/learner/challenges";

export async function readChallengeData<T>(suffix: string): Promise<{ status: "ok"; data: T } | ReadFailure | WorkspaceAccessFailure> {
  try {
    const response = await fetch(`/api/v1/challenges${suffix}`, { cache: "no-store" });
    if (response.ok) return { status: "ok", data: (await response.json()).data };
    const access = response.headers.get(accountAccessHeader);
    switch (response.status) {
      case 400: return { status: "invalid" };
      case 401: return { status: "unauthenticated" };
      case 403: return { status: access === "role_denied" || access === "account_unavailable" ? access : "forbidden" };
      case 404: return { status: "not_found" };
      case 503: return { status: access === "account_service_unavailable" ? access : "unavailable" };
      default: return { status: "unavailable" };
    }
  } catch {
    return { status: "unavailable" };
  }
}
