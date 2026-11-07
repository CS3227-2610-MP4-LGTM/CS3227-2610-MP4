"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { roleLabels, roleLinks, workspaceHref, type Role } from "@/lib/auth/navigation";
import { SignOutControl } from "./sign-out-control";

export function RoleNavigation({ account, signOutAction }: {
  account: { displayName: string; role: Role }; signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  return <header className="workspace-header"><nav aria-label="Workspace" className="workspace-nav">
    <Link href={workspaceHref(account.role)} className="brand">LGTM<span aria-hidden="true" className="brand-dot">.</span></Link>
    <div className="nav-links">{roleLinks[account.role].map(({ href, label }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}</div>
    <div className="account-identity"><span className="display-name">{account.displayName}</span><span className="role-badge">{roleLabels[account.role]}</span></div>
    <SignOutControl action={signOutAction} />
  </nav></header>;
}
