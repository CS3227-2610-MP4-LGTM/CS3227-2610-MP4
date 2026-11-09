"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ConfirmationDialog } from "./confirmation-dialog";
import { interceptWorkspaceTraversal } from "./workspace-history";

type Draft = { discard: () => void; removeListeners: () => void };
type WorkspaceNavigation = {
  protectDraft: (discard: () => void) => () => void;
  confirmDeparture: (leave: () => void) => boolean;
  clearProtection: () => void;
};

const NavigationContext = createContext<WorkspaceNavigation>({
  protectDraft: () => () => {},
  confirmDeparture: () => false,
  clearProtection: () => {},
});

export function useWorkspaceNavigation() {
  return useContext(NavigationContext);
}

export function WorkspaceNavigationProvider({ children }: { children: ReactNode }) {
  const draft = useRef<Draft>(null);
  const [departure, setDeparture] = useState<(() => void) | null>(null);
  const descriptionId = useId();

  const confirmDeparture = useCallback((leave: () => void) => {
    if (!draft.current) return false;
    setDeparture(previous => previous ?? leave);
    return true;
  }, []);

  const clearProtection = useCallback(() => {
    draft.current?.removeListeners();
    draft.current = null;
    setDeparture(null);
  }, []);

  const protectDraft = useCallback((discard: () => void) => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const removeTraversal = interceptWorkspaceTraversal(leave => confirmDeparture(leave));
    window.addEventListener("beforeunload", warn);
    const protection = {
      discard,
      removeListeners: () => {
        removeTraversal();
        window.removeEventListener("beforeunload", warn);
      },
    };
    draft.current = protection;
    return () => {
      protection.removeListeners();
      if (draft.current === protection) draft.current = null;
    };
  }, [confirmDeparture]);

  return <NavigationContext.Provider value={{ protectDraft, confirmDeparture, clearProtection }}>
    {children}
    {departure && <ConfirmationDialog title="Leave this review?" descriptionId={descriptionId} onCancel={() => setDeparture(null)}>
      <p id={descriptionId}>Your unsaved comments will be lost.</p>
      <div className="recovery-actions">
        <button className="button secondary" type="button" onClick={() => setDeparture(null)}>Keep reviewing</button>
        <button className="button primary" type="button" onClick={() => {
          const discard = draft.current?.discard;
          clearProtection();
          discard?.();
          departure();
        }}>Leave review</button>
      </div>
    </ConfirmationDialog>}
  </NavigationContext.Provider>;
}

type GuardedLinkProps = Omit<ComponentProps<typeof Link>, "href" | "onNavigate" | "ref"> & { href: string };

export function WorkspaceLink({ href, ...props }: GuardedLinkProps) {
  const link = useRef<HTMLAnchorElement>(null);
  const { confirmDeparture } = useWorkspaceNavigation();
  return <Link {...props} ref={link} href={href} onNavigate={event => {
    if (confirmDeparture(() => link.current?.click())) event.preventDefault();
  }} />;
}
