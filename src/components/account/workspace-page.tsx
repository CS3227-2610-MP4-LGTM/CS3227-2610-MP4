import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAccount } from "@/server/auth/account";
import { signOutAction } from "@/server/auth/actions";
import { signInNotice } from "@/server/auth/session-notice";
import { workspaceHref, type Role } from "@/lib/auth/navigation";
import { RoleNavigation } from "./role-navigation";
import { AccessScreen } from "./access-screen";
import { WorkspaceAccessBoundary } from "./workspace-access-boundary";

export async function WorkspacePage({ role, children }: {
  role: Role;
  children: ReactNode | ((accountId: string) => ReactNode);
}) {
  const result = await getAccount();
  if (result.status === "unauthenticated") redirect(`/sign-in?notice=${await signInNotice()}`);
  if (result.status !== "ok") return <main className="account-shell"><AccessScreen kind={result.status === "forbidden" ? "account-unavailable" : "service-unavailable"} signOutAction={signOutAction} /></main>;
  return <WorkspaceAccessBoundary key={result.account.id} signOutAction={signOutAction}>
    <RoleNavigation account={result.account} signOutAction={signOutAction} />
    <main className="workspace-main">{result.account.role === role
      ? (typeof children === "function" ? children(result.account.id) : children)
      : <AccessScreen kind="role-denied" workspaceHref={workspaceHref(result.account.role)} />}</main>
  </WorkspaceAccessBoundary>;
}
