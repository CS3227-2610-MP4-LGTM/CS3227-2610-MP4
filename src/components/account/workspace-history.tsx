"use client";

import { useLayoutEffect } from "react";

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

export function WorkspaceHistoryTracker() {
  useLayoutEffect(() => {
    if (tracking) return;
    tracking = true;

    // Install before the router's traversal listener. The callback is set
    // only when a review actually needs protection.
    window.addEventListener("popstate", event => interceptPopState?.(event), true);

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
  return null;
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
