"use client";

import { usePathname } from "next/navigation";
import { roleLabels, roleLinks, workspaceHref, type Role } from "@/lib/auth/navigation";
import { SignOutControl } from "./sign-out-control";
import { WorkspaceLink } from "./workspace-navigation";

export function RoleNavigation({ account, signOutAction }: {
  account: { displayName: string; role: Role }; signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  return <header className="workspace-header"><nav aria-label="Workspace" className="workspace-nav">
    <WorkspaceLink href={workspaceHref(account.role)} className="brand">LGTM<span aria-hidden="true" className="brand-dot">.</span></WorkspaceLink>
    <div className="nav-links">{roleLinks[account.role].map(({ href, label }) => <WorkspaceLink key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</WorkspaceLink>)}</div>
    <div className="account-identity"><span className="display-name">{account.displayName}</span><span className="role-badge">{roleLabels[account.role]}</span></div>
    <SignOutControl action={signOutAction} />
  </nav></header>;
}
