"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOutControl } from "./sign-out-control";

type Kind = "role-denied" | "record-denied" | "account-unavailable" | "service-unavailable";
export function AccessScreen({ kind, workspaceHref, signOutAction }: {
  kind: Kind; workspaceHref?: string; signOutAction: () => Promise<void>;
}) {
  const router = useRouter();
  const denied = kind === "role-denied" || kind === "record-denied";
  const heading = denied ? "Access denied" : kind === "account-unavailable" ? "Account unavailable" : "Service unavailable";
  const message = kind === "role-denied" ? "This page isn't available for your role."
    : kind === "record-denied" ? "This item isn't available to your account."
      : kind === "account-unavailable" ? "We couldn't load a valid account profile."
        : "We can't check your account right now. Try again.";
  return <section className="recovery-card" aria-labelledby="recovery-title">
    <p className="eyebrow">LGTM · Account access</p><h1 id="recovery-title">{heading}</h1>
    <p role="alert" className="muted">{message}</p>
    <div className="recovery-actions">{denied ? <Link className="button primary" href={workspaceHref!}>Go to my workspace</Link>
      : <><button type="button" className="button primary" onClick={() => router.refresh()}>Try again</button><SignOutControl action={signOutAction} /></>}</div>
  </section>;
}
