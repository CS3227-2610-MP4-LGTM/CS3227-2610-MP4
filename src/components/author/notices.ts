// A one-time "Draft saved." handoff from Create challenge to Flaw configuration.
// It is a per-tab convenience: if storage is unavailable the notice is skipped,
// and the saved draft itself is always reread from the server.
const key = (challengeId: string) => `lgtm:author:draft-saved:${challengeId}`;

export function rememberDraftSaved(challengeId: string) {
  try {
    window.sessionStorage.setItem(key(challengeId), "1");
  } catch {
    // Storage can be blocked; the notice is optional.
  }
}

export function takeDraftSaved(challengeId: string) {
  try {
    const saved = window.sessionStorage.getItem(key(challengeId)) === "1";
    window.sessionStorage.removeItem(key(challengeId));
    return saved;
  } catch {
    return false;
  }
}
