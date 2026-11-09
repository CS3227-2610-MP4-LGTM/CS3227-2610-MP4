"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { WorkspaceAccessStatus } from "@/lib/auth/workspace-access";
import { AccessScreen } from "./access-screen";
import { WorkspaceNavigationProvider } from "./workspace-navigation";

const AccessFailureContext = createContext<(status: WorkspaceAccessStatus) => void>(() => {});

export function useReportWorkspaceAccessFailure() {
  return useContext(AccessFailureContext);
}

export function WorkspaceAccessBoundary({ children, signOutAction }: {
  children: ReactNode;
  signOutAction: () => Promise<void>;
}) {
  const [status, reportFailure] = useState<WorkspaceAccessStatus>();

  useEffect(() => {
    if (status === "unauthenticated") window.location.replace("/sign-in?notice=session-expired");
    if (status === "role_denied") window.location.reload();
  }, [status]);

  if (status === "account_unavailable" || status === "account_service_unavailable") {
    return <main className="account-shell">
      <AccessScreen kind={status === "account_unavailable" ? "account-unavailable" : "service-unavailable"}
        signOutAction={signOutAction} onRetry={() => window.location.reload()} />
    </main>;
  }

  // Re-enter through the server gate so a role denial uses the current role's workspace.
  if (status) return null;
  return <AccessFailureContext.Provider value={reportFailure}>
    <WorkspaceNavigationProvider>{children}</WorkspaceNavigationProvider>
  </AccessFailureContext.Provider>;
}
