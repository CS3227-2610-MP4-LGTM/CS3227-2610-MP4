// @vitest-environment node
/// <reference types="vite/client" />
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccount: vi.fn(), rpc: vi.fn(), from: vi.fn(), admin: vi.fn(), boundary: vi.fn(), execute: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.getAccount }));
vi.mock("@/server/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc, from: mocks.from, auth: { getUser: vi.fn() } }),
}));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/llm/boundary", () => ({ createLlmBoundary: mocks.boundary }));

/**
 * T-22 interface: Route Handlers `POST /api/v1/author/challenges/[id]/publish` and
 * `GET /api/v1/author/challenges/[id]/revisions/[revisionId]`.
 */
type Context = { params: Promise<Record<string, string>> };
type Handler = (request: Request, context: Context) => Promise<Response>;
const publishPath = "/src/app/api/v1/author/challenges/[id]/publish/route.ts";
const revisionPath = "/src/app/api/v1/author/challenges/[id]/revisions/[revisionId]/route.ts";
const publishes = import.meta.glob<{ POST: Handler }>("/src/app/api/v1/author/challenges/*/publish/route.ts");
const revisions = import.meta.glob<{ GET: Handler }>("/src/app/api/v1/author/challenges/*/revisions/*/route.ts");

const origin = "https://app.example.test";
const authorId = "00000000-0000-4000-8000-000000000001";
const challengeId = "00000000-0000-4000-8000-000000000101";
const revisionId = "00000000-0000-4000-8000-000000000201";
const key = "00000000-0000-4000-8000-000000000984";
const accountHeader = "X-LGTM-Workspace-Account-Id";
const versions = { expectedRowVersion: 4, expectedDraftVersion: 3 };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAccount.mockResolvedValue({ status: "ok", account: { id: authorId, role: "author", displayName: "Author A" } });
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "test stub" }, status: 400 });
  mocks.from.mockImplementation(() => { throw new Error("Unexpected table access in a request-boundary test"); });
  mocks.admin.mockImplementation(() => { throw new Error("Unexpected admin client in a request-boundary test"); });
  mocks.boundary.mockReturnValue({ execute: mocks.execute });
  mocks.execute.mockRejectedValue(new Error("Unexpected LLM request in a request-boundary test"));
});

async function load<T>(modules: Record<string, () => Promise<T>>, path: string) {
  if (!modules[path]) throw new Error(`Missing T-22 Route Handler: ${path}`);
  return modules[path]();
}

async function publish(body: unknown, headers: Record<string, string> = { "Idempotency-Key": key }, id = challengeId) {
  const { POST } = await load(publishes, publishPath);
  return POST(new Request(`${origin}/api/v1/author/challenges/${id}/publish`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

async function revision(id = challengeId, revision = revisionId, query = "") {
  const { GET } = await load(revisions, revisionPath);
  return GET(new Request(`${origin}/api/v1/author/challenges/${id}/revisions/${revision}${query}`),
    { params: Promise.resolve({ id, revisionId: revision }) });
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const payload = await response.json();
  expect(payload).toEqual({ error: expect.objectContaining({ code, message: expect.stringMatching(/\S/) }) });
}

function expectNoWork() {
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
}

it.each([
  ["an empty body", {}],
  ["a missing expected row version", { expectedDraftVersion: 3 }],
  ["a missing expected draft version", { expectedRowVersion: 4 }],
  ["a zero expected version", { expectedRowVersion: 0, expectedDraftVersion: 3 }],
  ["a fractional expected version", { expectedRowVersion: 4, expectedDraftVersion: 3.5 }],
  ["a string expected version", { expectedRowVersion: "4", expectedDraftVersion: 3 }],
  ["an unknown field", { ...versions, note: "x" }],
  ["client-supplied flawed code", { ...versions, flawedCode: "const a = 1;\n" }],
  ["client-supplied hints", { ...versions, hints: [{ key: "p0", text: "Look closely." }] }],
  ["a client-supplied answer key", { ...versions, flaws: [] }],
  ["a client-supplied actor", { ...versions, authorId }],
  ["a client-supplied revision number", { ...versions, revisionNumber: 7 }],
])("AUT-05.2 SYS-02.1 SEC-01.1 rejects publication with %s before any data access or provider request", async (_case, body) => {
  await expectError(await publish(body), 400, "VALIDATION_ERROR");
  expectNoWork();
});

it.each([
  ["a missing key", {}],
  ["a malformed key", { "Idempotency-Key": "not-a-uuid" }],
])("AUT-05.5 SYS-02.1 rejects publication with %s before any data access or provider request", async (_case, headers) => {
  await expectError(await publish(versions, headers), 400, "VALIDATION_ERROR");
  expectNoWork();
});

it("SYS-02.1 rejects malformed JSON on publication before any data access", async () => {
  await expectError(await publish("{\"expectedRowVersion\":"), 400, "VALIDATION_ERROR");
  expectNoWork();
});

it("SYS-02.1 returns 413 for a publication body over 128 KiB before parsing", async () => {
  await expectError(await publish({ ...versions, padding: "a".repeat(128 * 1024) }), 413, "PAYLOAD_TOO_LARGE");
  expectNoWork();
});

it("SYS-02.1 rejects malformed challenge and revision IDs before any data access", async () => {
  await expectError(await publish(versions, { "Idempotency-Key": key }, "not-a-uuid"), 400, "VALIDATION_ERROR");
  await expectError(await revision("not-a-uuid"), 400, "VALIDATION_ERROR");
  await expectError(await revision(challengeId, "not-a-uuid"), 400, "VALIDATION_ERROR");
  expectNoWork();
});

it("SYS-02.1 rejects unknown revision query fields before any data access", async () => {
  await expectError(await revision(challengeId, revisionId, "?include=hints"), 400, "VALIDATION_ERROR");
  expectNoWork();
});

it.each([
  ["unauthenticated", 401, "UNAUTHENTICATED"],
  ["forbidden", 403, "FORBIDDEN"],
  ["unavailable", 503, "SERVICE_UNAVAILABLE"],
] as const)("SYS-11 SEC-01.1 maps a %s account to %i on both T-22 entry points without data access or provider request",
  async (status, httpStatus, code) => {
    mocks.getAccount.mockResolvedValue({ status });
    await expectError(await publish(versions), httpStatus, code);
    await expectError(await revision(), httpStatus, code);
    expectNoWork();
  });

it.each(["learner", "ta"])("SYS-08.2 SEC-01.1 denies a %s both T-22 entry points with 403 before data access or provider request", async role => {
  mocks.getAccount.mockResolvedValue({ status: "ok", account: { id: authorId, role, displayName: "Not an Author" } });
  await expectError(await publish(versions), 403, "FORBIDDEN");
  await expectError(await revision(), 403, "FORBIDDEN");
  expectNoWork();
});

it("SYS-16.2 rejects an untrusted origin on publication before any write or provider request", async () => {
  await expectError(await publish(versions, { Origin: "https://foreign.example.test", "Idempotency-Key": key }), 403, "FORBIDDEN");
  expectNoWork();
});

it.each([
  ["a different account", "00000000-0000-4000-8000-000000000002"],
  ["a malformed account", "not-a-uuid"],
])("SYS-08.3 SYS-09.3 rejects %s in the workspace account header before any write or provider request", async (_case, value) => {
  await expectError(await publish(versions, { [accountHeader]: value, "Idempotency-Key": key }), 403, "FORBIDDEN");
  expectNoWork();
});

it("AUT-05.3 SYS-10.2 the revision read never uses the admin client or the LLM boundary and hides diagnostics", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST", message: "SENTINEL_DATABASE_DIAGNOSTIC" }, status: 503 });
  mocks.from.mockReturnValue(new Proxy({}, { get: () => () => { throw new Error("SENTINEL_DATABASE_DIAGNOSTIC"); } }));
  const response = await revision();
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(await response.json())).not.toContain("SENTINEL");
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.boundary).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
});
