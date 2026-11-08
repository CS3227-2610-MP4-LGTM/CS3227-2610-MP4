export type WorkspaceAccessStatus =
  | "unauthenticated"
  | "role_denied"
  | "account_unavailable"
  | "account_service_unavailable";

export type WorkspaceAccessFailure = { status: WorkspaceAccessStatus };

export function isWorkspaceAccessFailure(result: { status: string }): result is WorkspaceAccessFailure {
  return result.status === "unauthenticated" || result.status === "role_denied"
    || result.status === "account_unavailable" || result.status === "account_service_unavailable";
}
