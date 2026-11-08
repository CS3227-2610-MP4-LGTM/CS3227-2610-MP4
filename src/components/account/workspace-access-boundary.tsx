"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { WorkspaceAccessStatus } from "@/lib/auth/workspace-access";
import { AccessScreen } from "./access-screen";

const AccessFailureContext = createContext<(status: WorkspaceAccessStatus) => void>(() => {});

export function useReportWorkspaceAccessFailure() {
  return useContext(AccessFailureContext);
}

export function WorkspaceAccessBoundary({ children, signOutAction, workspaceHref = "/" }: {
  children: ReactNode;
  signOutAction: () => Promise<void>;
  workspaceHref?: string;
}) {
  const [status, reportFailure] = useState<WorkspaceAccessStatus>();

  useEffect(() => {
    if (status === "unauthenticated") window.location.replace("/sign-in?notice=session-expired");
  }, [status]);

  if (status === "account_unavailable" || status === "account_service_unavailable") {
    return <main className="account-shell">
      <AccessScreen kind={status === "account_unavailable" ? "account-unavailable" : "service-unavailable"}
        signOutAction={signOutAction} onRetry={() => window.location.reload()} />
    </main>;
  }

  if (status === "role_denied") return <main className="account-shell">
    <AccessScreen kind="role-denied" workspaceHref={workspaceHref} />
  </main>;

  // Recovery requires explicit navigation; no interrupted operation is replayed.
  if (status) return null;
  return <AccessFailureContext.Provider value={reportFailure}>{children}</AccessFailureContext.Provider>;
}
