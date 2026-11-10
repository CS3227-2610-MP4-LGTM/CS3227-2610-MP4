"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

const positionKey = "lgtmWorkspaceHistoryPosition";
let tracking = false;
let interceptPopState: ((event: PopStateEvent) => void) | undefined;

type HistoryNavigation = EventTarget & { currentEntry: { index: number } | null };
type HistoryNavigateEvent = Event & {
  navigationType: string;
  destination: { index: number; sameDocument: boolean };
};

function workspaceHistoryPosition(state: unknown = window.history.state): number | undefined {
  if (typeof state !== "object" || state === null || !(positionKey in state)) return;
  const position = state[positionKey];
  return typeof position === "number" ? position : undefined;
}

function isRetryEntry() {
  return /^\/learner\/history\/[^/]+\/retry\/?$/.test(window.location.pathname);
}

export function WorkspaceHistoryTracker({ children }: { children: ReactNode }) {
  const [loadingRetry, setLoadingRetry] = useState(false);

  useLayoutEffect(() => {
    if (tracking) return;
    tracking = true;

    const showRetryLoading = () => flushSync(() => setLoadingRetry(true));
    const reloadRetry = () => {
      showRetryLoading();
      window.location.reload();
    };

    // Let the draft guard finish first. A retry entry must then go through
    // the server check again before the router can restore its cached editor.
    window.addEventListener("popstate", event => {
      interceptPopState?.(event);
      if (event.cancelBubble || !isRetryEntry()) return;
      event.stopImmediatePropagation();
      reloadRetry();
    }, true);

    // Store the loading view if the browser freezes a retry document.
    window.addEventListener("pagehide", event => {
      if (event.persisted && isRetryEntry()) showRetryLoading();
    });
    window.addEventListener("pageshow", event => {
      if (!event.persisted) return;
      if (isRetryEntry()) reloadRetry();
      else setLoadingRetry(false);
    });

    const history = window.history;
    const push = history.pushState.bind(history);
    const replace = history.replaceState.bind(history);

    // Preserve router state and record positions when native indexes are
    // unavailable. No synthetic history entries are added.
    replace({ ...history.state, [positionKey]: workspaceHistoryPosition() ?? 0 }, "");
    history.pushState = (state, unused, url) => {
      push({ ...state, [positionKey]: (workspaceHistoryPosition() ?? 0) + 1 }, unused, url);
    };
    history.replaceState = (state, unused, url) => {
      replace({ ...state, [positionKey]: workspaceHistoryPosition() ?? 0 }, unused, url);
    };
  }, []);
  return loadingRetry
    ? <main className="loading-shell" role="status">Loading retry…</main>
    : children;
}

export function interceptWorkspaceTraversal(onDeparture: (leave: () => void) => void) {
  const { navigation } = window as Window & { navigation?: HistoryNavigation };
  const positionOf = (state?: unknown) => {
    const index = navigation?.currentEntry?.index;
    return index !== undefined && index >= 0 ? index : workspaceHistoryPosition(state);
  };
  const home = positionOf();
  if (home === undefined) return () => {};

  let requestedDelta: number | undefined;
  const onNavigate = (rawEvent: Event) => {
    const event = rawEvent as HistoryNavigateEvent;
    if (requestedDelta !== undefined || event.navigationType !== "traverse" || !event.cancelable
      || !event.destination.sameDocument || event.destination.index < 0) return;
    const delta = event.destination.index - home;
    if (!delta) return;
    event.preventDefault();
    onDeparture(() => window.history.go(delta));
  };
  navigation?.addEventListener("navigate", onNavigate);

  const onPopState = (event: PopStateEvent) => {
    const position = positionOf(event.state);
    if (position === undefined) return;

    // For non-cancelable traversals, restore the real browser cursor before
    // showing the dialog. Prevent the router from applying either traversal.
    if (position !== home) {
      event.stopImmediatePropagation();
      requestedDelta = position - home;
      window.history.go(-requestedDelta);
    } else if (requestedDelta !== undefined) {
      event.stopImmediatePropagation();
      const delta = requestedDelta;
      requestedDelta = undefined;
      onDeparture(() => window.history.go(delta));
    }
  };
  interceptPopState = onPopState;

  return () => {
    navigation?.removeEventListener("navigate", onNavigate);
    if (interceptPopState === onPopState) interceptPopState = undefined;
  };
}
