import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as client from "@/components/author/client";
import { authorErrorMessages } from "@/lib/author/drafts";
import { workspaceAccountHeader } from "@/lib/learner/submissions";
import { challengeId, revisionId } from "./evidence";

/**
 * T-22 interface: `@/components/author/client` adds
 * `publishChallenge(id, { expectedRowVersion, expectedDraftVersion }, idempotencyKey, accountId?)` resolving to
 * `{ status: "ok", publication }` or a failure status, and `readRevision(id, revisionId)` resolving to
 * `{ status: "ok", revision }` or a failure status. Neither throws.
 */
type Outcome = { status: string; publication?: unknown; revision?: unknown };
type Api = {
  publishChallenge: (id: string, body: object, key: string, accountId?: string) => Promise<Outcome>;
  readRevision: (id: string, revisionId: string) => Promise<Outcome>;
};

const fetchMock = vi.fn<typeof fetch>();
const key = "00000000-0000-4000-8000-000000000985";
const accountId = "00000000-0000-4000-8000-000000000001";
const versions = { expectedRowVersion: 4, expectedDraftVersion: 3 };
const base = `/api/v1/author/challenges/${challengeId}`;
const ineligible = "Review the current proposals and approve at least one flaw before publishing.";
const publication = {
  id: challengeId, status: "published", rowVersion: 5, revisionId, revisionNumber: 1, publishedAt: "2026-11-11T08:00:00.000Z",
};

beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

function api(): Api {
  const exported = client as unknown as Partial<Api>;
  for (const name of ["publishChallenge", "readRevision"] as const) {
    if (typeof exported[name] !== "function") throw new Error(`Missing T-22 export: @/components/author/client.${name}`);
  }
  return exported as Api;
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const failure = (status: number, code: string, message = "Failure.") => reply(status, { error: { code, message } });

it("AUT-05.2 AUT-05.5 posts only expected versions with the caller's idempotency key and no caching", async () => {
  fetchMock.mockResolvedValue(reply(201, { data: publication }));
  expect(await api().publishChallenge(challengeId, versions, key, accountId)).toEqual({ status: "ok", publication });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`${base}/publish`);
  expect(init?.method).toBe("POST");
  expect(init?.cache).toBe("no-store");
  const headers = new Headers(init?.headers);
  expect(headers.get("Idempotency-Key")).toBe(key);
  expect(headers.get("Content-Type")).toBe("application/json");
  expect(headers.get(workspaceAccountHeader)).toBe(accountId);
  expect(JSON.parse(String(init?.body))).toEqual(versions);
});

it.each([
  ["AUT-05.1", 409, "INVALID_STATE", ineligible, "ineligible"],
  ["AUT-05.4", 422, "INVALID_AI_OUTPUT", undefined, "invalid_output"],
  ["AUT-05.4", 504, "AI_TIMEOUT", undefined, "timeout"],
  ["AUT-05.4", 502, "AI_UNAVAILABLE", undefined, "failed"],
  ["AUT-05.4", 429, "RATE_LIMITED", undefined, "limited"],
  ["AUT-05.4", 413, "PAYLOAD_TOO_LARGE", undefined, "too_large"],
  ["AUT-05.6", 409, "VERSION_CONFLICT", undefined, "conflict"],
  ["AUT-05.7", 409, "INVALID_STATE", authorErrorMessages.archived, "conflict"],
  ["AUT-05.5", 409, "INVALID_STATE", authorErrorMessages.inProgress, "uncertain"],
] as const)("%s maps a publication %i %s (%s) to %s", async (_id, status, code, message, expected) => {
  fetchMock.mockResolvedValue(failure(status, code, message));
  const result = await api().publishChallenge(challengeId, versions, key);
  expect(result.status).toBe(expected);
  expect(result.publication).toBeUndefined();
});

it("AUT-05.5 treats a lost publication response as uncertain, never as a failure or success", async () => {
  fetchMock.mockRejectedValue(new TypeError("network lost"));
  expect((await api().publishChallenge(challengeId, versions, key)).status).toBe("uncertain");
  fetchMock.mockResolvedValue(new Response("{", { status: 200 }));
  expect((await api().publishChallenge(challengeId, versions, key)).status).toBe("uncertain");
});

it("AUT-05.6 reports account failures without replaying publication", async () => {
  fetchMock.mockResolvedValue(failure(401, "UNAUTHENTICATED"));
  expect((await api().publishChallenge(challengeId, versions, key)).status).toBe("unauthenticated");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("AUT-05.3 reads an own published revision without caching", async () => {
  const revision = { publication, challenge: { id: challengeId }, answerKey: [], hints: [] };
  fetchMock.mockResolvedValue(reply(200, { data: revision }));
  expect(await api().readRevision(challengeId, revisionId)).toEqual({ status: "ok", revision });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`${base}/revisions/${revisionId}`);
  expect(init?.method ?? "GET").toBe("GET");
  expect(init?.cache).toBe("no-store");
});

it.each([
  ["another Author's revision", () => Promise.resolve(failure(403, "FORBIDDEN")), "forbidden"],
  ["an absent revision", () => Promise.resolve(failure(404, "NOT_FOUND")), "not_found"],
  ["a server failure", () => Promise.resolve(failure(503, "SERVICE_UNAVAILABLE")), "unavailable"],
  ["a lost response", () => Promise.reject(new TypeError("network lost")), "unavailable"],
  ["an unreadable body", () => Promise.resolve(new Response("{", { status: 200 })), "unavailable"],
] as const)("AUT-05.3 SYS-12.1 maps a revision read of %s to %s, never an empty revision", async (_case, response, expected) => {
  fetchMock.mockImplementation(response as () => Promise<Response>);
  const result = await api().readRevision(challengeId, revisionId);
  expect(result.status).toBe(expected);
  expect(result.revision).toBeUndefined();
});
