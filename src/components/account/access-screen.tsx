"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOutControl } from "./sign-out-control";

type SignOutAction = () => Promise<void>;
type AccessProps =
  | { kind: "role-denied" | "record-denied"; workspaceHref: string; signOutAction?: SignOutAction }
  | { kind: "account-unavailable" | "service-unavailable"; signOutAction: SignOutAction; onRetry?: () => void };

export function AccessScreen(props: AccessProps) {
  const { kind } = props;
  const denied = kind === "role-denied" || kind === "record-denied";
  const heading = denied ? "Access denied" : kind === "account-unavailable" ? "Account unavailable" : "Service unavailable";
  const message = kind === "role-denied" ? "This page isn't available for your role."
    : kind === "record-denied" ? "This item isn't available to your account."
      : kind === "account-unavailable" ? "We couldn't load a valid account profile."
        : "We can't check your account right now. Try again.";
  return <section className="recovery-card" aria-labelledby="recovery-title">
    <p className="eyebrow">LGTM · Account access</p><h1 id="recovery-title">{heading}</h1>
    <p role="alert" className="muted">{message}</p>
    <div className="recovery-actions">{"workspaceHref" in props
      ? <Link className="button primary" href={props.workspaceHref}>Go to my workspace</Link>
      : <AccountRecoveryActions signOutAction={props.signOutAction} onRetry={props.onRetry} />}</div>
  </section>;
}

function AccountRecoveryActions({ signOutAction, onRetry }: { signOutAction: SignOutAction; onRetry?: () => void }) {
  const router = useRouter();
  return <><button type="button" className="button primary" onClick={onRetry ?? (() => router.refresh())}>Try again</button>
    <SignOutControl action={signOutAction} /></>;
}
