import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as client from "@/components/author/client";
import { authorErrorMessages } from "@/lib/author/drafts";
import { workspaceAccountHeader } from "@/lib/learner/submissions";
import { challengeId } from "./evidence";

/**
 * T-23 interface: `@/components/author/client` adds
 * `unpublishChallenge(id, { expectedRowVersion }, idempotencyKey, accountId?)` and
 * `archiveChallenge(id, { expectedRowVersion }, idempotencyKey, accountId?)`, each resolving to
 * `{ status: "ok", challenge: { id, status, rowVersion } }` or a failure status
 * (`conflict`, `failed`, `uncertain` or an account failure). Neither throws.
 */
type Outcome = { status: string; challenge?: unknown };
type Change = (id: string, body: object, key: string, accountId?: string) => Promise<Outcome>;
const names = { unpublish: "unpublishChallenge", archive: "archiveChallenge" } as const;
type Action = keyof typeof names;

const fetchMock = vi.fn<typeof fetch>();
const key = "00000000-0000-4000-8000-000000000987";
const accountId = "00000000-0000-4000-8000-000000000001";
const body = { expectedRowVersion: 4 };
const base = `/api/v1/author/challenges/${challengeId}`;

beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

function api(action: Action): Change {
  const exported = (client as unknown as Record<string, unknown>)[names[action]];
  if (typeof exported !== "function") throw new Error(`Missing T-23 export: @/components/author/client.${names[action]}`);
  return exported as Change;
}

function reply(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
const failure = (status: number, code: string, message = "Failure.") => reply(status, { error: { code, message } });

for (const action of ["unpublish", "archive"] as const) {
  const result = { id: challengeId, status: action === "unpublish" ? "unpublished" : "archived", rowVersion: 5 };

  it(`AUT-06.4 AUT-06.5 AUT-06.6 posts only the expected row version to ${action} with the caller's key and no caching`, async () => {
    fetchMock.mockResolvedValue(reply(200, { data: result }));
    expect(await api(action)(challengeId, body, key, accountId)).toEqual({ status: "ok", challenge: result });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${base}/${action}`);
    expect(init?.method).toBe("POST");
    expect(init?.cache).toBe("no-store");
    const headers = new Headers(init?.headers);
    expect(headers.get("Idempotency-Key")).toBe(key);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get(workspaceAccountHeader)).toBe(accountId);
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it.each([
    [409, "VERSION_CONFLICT", authorErrorMessages.versionConflict, "conflict"],
    // The challenge reached a state this action cannot leave (for example archived in another tab).
    [409, "INVALID_STATE", authorErrorMessages.archived, "conflict"],
    [409, "INVALID_STATE", authorErrorMessages.inProgress, "uncertain"],
    [503, "SERVICE_UNAVAILABLE", authorErrorMessages.unavailable, "failed"],
    [503, "SERVICE_UNAVAILABLE", authorErrorMessages.uncertain, "uncertain"],
    [404, "NOT_FOUND", authorErrorMessages.notFound, "failed"],
    [400, "VALIDATION_ERROR", authorErrorMessages.invalid, "failed"],
  ] as const)(`AUT-06.6 maps a ${action} %i %s (%s) to %s`, async (status, code, message, expected) => {
    fetchMock.mockResolvedValue(failure(status, code, message));
    const outcome = await api(action)(challengeId, body, key);
    expect(outcome.status).toBe(expected);
    expect(outcome.challenge).toBeUndefined();
  });

  it(`AUT-06.6 treats a lost or unreadable ${action} response as uncertain, never as failure or success`, async () => {
    fetchMock.mockRejectedValue(new TypeError("network lost"));
    expect((await api(action)(challengeId, body, key)).status).toBe("uncertain");
    fetchMock.mockResolvedValue(new Response("{", { status: 200 }));
    expect((await api(action)(challengeId, body, key)).status).toBe("uncertain");
  });

  it(`AUT-06.6 reports account failures on ${action} without replaying it`, async () => {
    fetchMock.mockResolvedValue(failure(401, "UNAUTHENTICATED"));
    expect((await api(action)(challengeId, body, key)).status).toBe("unauthenticated");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
}
