import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as client from "@/components/author/client";
import { authorErrorMessages } from "@/lib/author/drafts";
import { workspaceAccountHeader } from "@/lib/learner/submissions";
import { challengeId, proposalId, withProposals } from "./evidence";

/**
 * T-21 interface: `@/components/author/client` adds
 * `generateProposals(id, { expectedRowVersion, expectedDraftVersion }, idempotencyKey, accountId?)`,
 * `decideProposal(id, proposalId, { expectedRowVersion, expectedDraftVersion, decision }, accountId?)` and
 * `readFinalPreview(id)`, each resolving to `{ status, ... }` and never throwing.
 */
type Outcome = { status: string; draft?: unknown; preview?: unknown };
type Api = {
  generateProposals: (id: string, body: object, key: string, accountId?: string) => Promise<Outcome>;
  decideProposal: (id: string, proposal: string, body: object, accountId?: string) => Promise<Outcome>;
  readFinalPreview: (id: string) => Promise<Outcome>;
};

const fetchMock = vi.fn<typeof fetch>();
const key = "00000000-0000-4000-8000-000000000983";
const accountId = "00000000-0000-4000-8000-000000000001";
const versions = { expectedRowVersion: 3, expectedDraftVersion: 2 };
const base = `/api/v1/author/challenges/${challengeId}`;

beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

function api(): Api {
  const exported = client as unknown as Partial<Api>;
  for (const name of ["generateProposals", "decideProposal", "readFinalPreview"] as const) {
    if (typeof exported[name] !== "function") throw new Error(`Missing T-21 export: @/components/author/client.${name}`);
  }
  return exported as Api;
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const failure = (status: number, code: string, message = "Failure.") => reply(status, { error: { code, message } });

it("AUT-03.1 AUT-03.7 posts only expected versions with the caller's idempotency key and no caching", async () => {
  fetchMock.mockResolvedValue(reply(200, { data: withProposals }));
  expect(await api().generateProposals(challengeId, versions, key, accountId)).toEqual({ status: "ok", draft: withProposals });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`${base}/proposals`);
  expect(init?.method).toBe("POST");
  expect(init?.cache).toBe("no-store");
  const headers = new Headers(init?.headers);
  expect(headers.get("Idempotency-Key")).toBe(key);
  expect(headers.get("Content-Type")).toBe("application/json");
  expect(headers.get(workspaceAccountHeader)).toBe(accountId);
  expect(JSON.parse(String(init?.body))).toEqual(versions);
});

it.each([
  ["AUT-03.3", 422, "INVALID_AI_OUTPUT", undefined, "invalid_output"],
  ["AUT-03.6", 429, "RATE_LIMITED", undefined, "limited"],
  ["AUT-03.6", 413, "PAYLOAD_TOO_LARGE", undefined, "too_large"],
  ["AUT-03.6", 504, "AI_TIMEOUT", undefined, "timeout"],
  ["AUT-03.6", 502, "AI_UNAVAILABLE", undefined, "failed"],
  ["AUT-03.5", 409, "VERSION_CONFLICT", undefined, "conflict"],
  ["AUT-03.5", 409, "INVALID_STATE", authorErrorMessages.archived, "conflict"],
  ["AUT-03.7", 409, "INVALID_STATE", authorErrorMessages.inProgress, "uncertain"],
] as const)("%s maps a generation %i %s to %s", async (_id, status, code, message, expected) => {
  fetchMock.mockResolvedValue(failure(status, code, message));
  expect((await api().generateProposals(challengeId, versions, key)).status).toBe(expected);
});

it("AUT-03.7 treats a lost generation response as uncertain, never as a failure", async () => {
  fetchMock.mockRejectedValue(new TypeError("network lost"));
  expect((await api().generateProposals(challengeId, versions, key)).status).toBe("uncertain");
  fetchMock.mockResolvedValue(new Response("{", { status: 200 }));
  expect((await api().generateProposals(challengeId, versions, key)).status).toBe("uncertain");
});

it("AUT-03.5 reports account failures without replaying generation", async () => {
  fetchMock.mockResolvedValue(failure(401, "UNAUTHENTICATED"));
  expect((await api().generateProposals(challengeId, versions, key)).status).toBe("unauthenticated");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("AUT-04.2 patches one proposal with expected versions and its decision", async () => {
  fetchMock.mockResolvedValue(reply(200, { data: withProposals }));
  const body = { ...versions, decision: "approved" };
  expect(await api().decideProposal(challengeId, proposalId, body, accountId)).toEqual({ status: "ok", draft: withProposals });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`${base}/proposals/${proposalId}`);
  expect(init?.method).toBe("PATCH");
  expect(init?.cache).toBe("no-store");
  expect(new Headers(init?.headers).get(workspaceAccountHeader)).toBe(accountId);
  expect(JSON.parse(String(init?.body))).toEqual(body);
});

it.each([
  [409, "VERSION_CONFLICT", undefined, "conflict"],
  // A confirmed failure (the shared "unavailable" message) differs from an unconfirmed outcome.
  [503, "SERVICE_UNAVAILABLE", authorErrorMessages.unavailable, "failed"],
  [500, "SERVICE_UNAVAILABLE", undefined, "uncertain"],
] as const)("AUT-04.5 maps a decision %i %s to %s", async (status, code, message, expected) => {
  fetchMock.mockResolvedValue(failure(status, code, message));
  expect((await api().decideProposal(challengeId, proposalId, { ...versions, decision: "rejected" })).status).toBe(expected);
});

it("AUT-04.5 treats a lost decision response as uncertain", async () => {
  fetchMock.mockRejectedValue(new TypeError("network lost"));
  expect((await api().decideProposal(challengeId, proposalId, { ...versions, decision: "rejected" })).status).toBe("uncertain");
});

it("AUT-04.4 reads the server-assembled final preview without caching", async () => {
  const preview = { draftVersion: 2, code: { path: "challenge.js", before: "a\n", after: "b\n", hunks: [] }, flaws: [] };
  fetchMock.mockResolvedValue(reply(200, { data: preview }));
  expect(await api().readFinalPreview(challengeId)).toEqual({ status: "ok", preview });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`${base}/preview`);
  expect(init?.method ?? "GET").toBe("GET");
  expect(init?.cache).toBe("no-store");
});

it.each([
  ["a server failure", () => Promise.resolve(failure(503, "SERVICE_UNAVAILABLE")), "unavailable"],
  ["a lost response", () => Promise.reject(new TypeError("network lost")), "unavailable"],
  ["an unreadable body", () => Promise.resolve(new Response("{", { status: 200 })), "unavailable"],
  ["undecided proposals", () => Promise.resolve(failure(409, "INVALID_STATE")), "incomplete"],
] as const)("AUT-04.6 maps a preview read with %s to %s, never an empty successful preview", async (_case, response, expected) => {
  fetchMock.mockImplementation(response as () => Promise<Response>);
  const result = await api().readFinalPreview(challengeId);
  expect(result.status).toBe(expected);
  expect(result.preview).toBeUndefined();
});
