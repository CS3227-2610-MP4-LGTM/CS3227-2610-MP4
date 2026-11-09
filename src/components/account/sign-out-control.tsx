"use client";

import { useRef, useState, useTransition } from "react";
import { useWorkspaceNavigation } from "./workspace-navigation";

export function SignOutControl({ action }: { action: () => Promise<void> }) {
  const busy = useRef(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const { confirmDeparture } = useWorkspaceNavigation();
  const signOut = () => {
    if (busy.current) return;
    busy.current = true;
    setError(false);
    startTransition(async () => {
      try { await action(); }
      catch (error) {
        if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
        setError(true);
      } finally { busy.current = false; }
    });
  };
  return <div className="sign-out-control">
    <button className="button secondary" type="button" disabled={pending} onClick={() => {
      if (!confirmDeparture(signOut)) signOut();
    }}>{pending ? "Signing out…" : "Sign out"}</button>
    {error && <p role="alert" className="field-error">{"We couldn't confirm sign-out. Try again."}</p>}
  </div>;
}
