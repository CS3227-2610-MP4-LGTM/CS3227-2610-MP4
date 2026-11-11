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

const generatedKey = (challengeId: string) => `lgtm:author:proposals-generated:${challengeId}`;

/** A one-time AUT-03.2 arrival announcement from generation to Proposal preview. */
export function rememberProposalsGenerated(challengeId: string) {
  try {
    window.sessionStorage.setItem(generatedKey(challengeId), "1");
  } catch {
    // Storage can be blocked; the announcement is optional.
  }
}

export function takeProposalsGenerated(challengeId: string) {
  try {
    const generated = window.sessionStorage.getItem(generatedKey(challengeId)) === "1";
    window.sessionStorage.removeItem(generatedKey(challengeId));
    return generated;
  } catch {
    return false;
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
