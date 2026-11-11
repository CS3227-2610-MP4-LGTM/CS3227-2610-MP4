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

type Context = { params: Promise<Record<string, string>> };
type Handler = (request: Request, context: Context) => Promise<Response>;
const generatePath = "/src/app/api/v1/author/challenges/[id]/proposals/route.ts";
const decidePath = "/src/app/api/v1/author/challenges/[id]/proposals/[proposalId]/route.ts";
const previewPath = "/src/app/api/v1/author/challenges/[id]/preview/route.ts";
const generates = import.meta.glob<{ POST: Handler }>("/src/app/api/v1/author/challenges/*/proposals/route.ts");
const decides = import.meta.glob<{ PATCH: Handler }>("/src/app/api/v1/author/challenges/*/proposals/*/route.ts");
const previews = import.meta.glob<{ GET: Handler }>("/src/app/api/v1/author/challenges/*/preview/route.ts");

const origin = "https://app.example.test";
const authorId = "00000000-0000-4000-8000-000000000001";
const challengeId = "00000000-0000-4000-8000-000000000101";
const proposalId = "00000000-0000-4000-8000-000000001101";
const key = "00000000-0000-4000-8000-000000000982";
const accountHeader = "X-LGTM-Workspace-Account-Id";
const versions = { expectedRowVersion: 2, expectedDraftVersion: 2 };

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
  if (!modules[path]) throw new Error(`Missing T-21 Route Handler: ${path}`);
  return modules[path]();
}

async function generate(body: unknown, headers: Record<string, string> = { "Idempotency-Key": key }, id = challengeId) {
  const { POST } = await load(generates, generatePath);
  return POST(new Request(`${origin}/api/v1/author/challenges/${id}/proposals`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

async function decide(body: unknown, headers: Record<string, string> = {}, id = challengeId, proposal = proposalId) {
  const { PATCH } = await load(decides, decidePath);
  return PATCH(new Request(`${origin}/api/v1/author/challenges/${id}/proposals/${proposal}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), { params: Promise.resolve({ id, proposalId: proposal }) });
}

async function preview(id = challengeId, query = "") {
  const { GET } = await load(previews, previewPath);
  return GET(new Request(`${origin}/api/v1/author/challenges/${id}/preview${query}`), { params: Promise.resolve({ id }) });
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const payload = await response.json();
  expect(payload).toEqual({ error: expect.objectContaining({ code, message: expect.stringMatching(/\S/) }) });
  return payload.error as { code: string; message: string };
}

function expectNoWork() {
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
}

it.each([
  ["an empty body", {}],
  ["a missing expected row version", { expectedDraftVersion: 2 }],
  ["a missing expected draft version", { expectedRowVersion: 2 }],
  ["a zero expected version", { expectedRowVersion: 0, expectedDraftVersion: 2 }],
  ["a fractional expected version", { expectedRowVersion: 2, expectedDraftVersion: 2.5 }],
  ["a string expected version", { expectedRowVersion: "2", expectedDraftVersion: 2 }],
  ["an unknown field", { ...versions, note: "x" }],
  ["a client-supplied snapshot", { ...versions, workingCode: "const a = 1;\n" }],
  ["a client-supplied count", { ...versions, flawCount: 5 }],
  ["a client-supplied actor", { ...versions, authorId }],
])("AUT-03.1 SYS-02.1 SEC-01.1 rejects generation with %s before any data access or provider request", async (_case, body) => {
  await expectError(await generate(body), 400, "VALIDATION_ERROR");
  expectNoWork();
});

it.each([
  ["a missing key", {}],
  ["a malformed key", { "Idempotency-Key": "not-a-uuid" }],
])("AUT-03.7 SYS-02.1 rejects generation with %s before any data access or provider request", async (_case, headers) => {
  await expectError(await generate(versions, headers), 400, "VALIDATION_ERROR");
  expectNoWork();
});

it("SYS-02.1 rejects malformed JSON on generation and decisions before any data access", async () => {
  await expectError(await generate("{\"expectedRowVersion\":"), 400, "VALIDATION_ERROR");
  await expectError(await decide("{\"decision\":"), 400, "VALIDATION_ERROR");
  expectNoWork();
});

it("SYS-02.1 returns 413 for generation and decision bodies over 128 KiB before parsing", async () => {
  const padding = "a".repeat(128 * 1024);
  await expectError(await generate({ ...versions, padding }), 413, "PAYLOAD_TOO_LARGE");
  await expectError(await decide({ ...versions, decision: "approved", padding }), 413, "PAYLOAD_TOO_LARGE");
  expectNoWork();
});

it.each([
  ["a pending decision", { ...versions, decision: "pending" }],
  ["an unknown decision", { ...versions, decision: "maybe" }],
  ["a display-label decision", { ...versions, decision: "Approved" }],
  ["a missing decision", { ...versions }],
  ["a missing expected row version", { expectedDraftVersion: 2, decision: "approved" }],
  ["a missing expected draft version", { expectedRowVersion: 2, decision: "approved" }],
  ["an edited explanation", { ...versions, decision: "approved", explanation: "Rewritten." }],
  ["an edited fix", { ...versions, decision: "rejected", fix: "Rewritten." }],
  ["an unknown field", { ...versions, decision: "approved", proposalSetId: proposalId }],
])("AUT-04.2 SYS-02.1 rejects a decision with %s before any write", async (_case, body) => {
  await expectError(await decide(body), 400, "VALIDATION_ERROR");
  expectNoWork();
});

it("SYS-02.1 rejects malformed challenge and proposal IDs before any data access", async () => {
  await expectError(await generate(versions, { "Idempotency-Key": key }, "not-a-uuid"), 400, "VALIDATION_ERROR");
  await expectError(await decide({ ...versions, decision: "approved" }, {}, "not-a-uuid"), 400, "VALIDATION_ERROR");
  await expectError(await decide({ ...versions, decision: "approved" }, {}, challengeId, "not-a-uuid"), 400, "VALIDATION_ERROR");
  await expectError(await preview("not-a-uuid"), 400, "VALIDATION_ERROR");
  expectNoWork();
});

it("SYS-02.1 rejects unknown preview query fields before any data access", async () => {
  await expectError(await preview(challengeId, "?draftVersion=2"), 400, "VALIDATION_ERROR");
  expectNoWork();
});

it.each([
  ["unauthenticated", 401, "UNAUTHENTICATED"],
  ["forbidden", 403, "FORBIDDEN"],
  ["unavailable", 503, "SERVICE_UNAVAILABLE"],
] as const)("SYS-11 SEC-01.1 maps a %s account to %i on every T-21 entry point without data access or provider request",
  async (status, httpStatus, code) => {
    mocks.getAccount.mockResolvedValue({ status });
    await expectError(await generate(versions), httpStatus, code);
    await expectError(await decide({ ...versions, decision: "approved" }), httpStatus, code);
    await expectError(await preview(), httpStatus, code);
    expectNoWork();
  });

it.each(["learner", "ta"])("SYS-08.2 SEC-01.1 denies a %s every T-21 entry point with 403 before data access or provider request", async role => {
  mocks.getAccount.mockResolvedValue({ status: "ok", account: { id: authorId, role, displayName: "Not an Author" } });
  await expectError(await generate(versions), 403, "FORBIDDEN");
  await expectError(await decide({ ...versions, decision: "approved" }), 403, "FORBIDDEN");
  await expectError(await preview(), 403, "FORBIDDEN");
  expectNoWork();
});

it("SYS-16.2 rejects untrusted origins on generation and decisions before any write or provider request", async () => {
  const foreign = { Origin: "https://foreign.example.test" };
  await expectError(await generate(versions, { ...foreign, "Idempotency-Key": key }), 403, "FORBIDDEN");
  await expectError(await decide({ ...versions, decision: "approved" }, foreign), 403, "FORBIDDEN");
  expectNoWork();
});

it.each([
  ["a different account", "00000000-0000-4000-8000-000000000002"],
  ["a malformed account", "not-a-uuid"],
])("SYS-08.3 SYS-09.3 rejects %s in the workspace account header before any write or provider request", async (_case, value) => {
  await expectError(await generate(versions, { [accountHeader]: value, "Idempotency-Key": key }), 403, "FORBIDDEN");
  await expectError(await decide({ ...versions, decision: "approved" }, { [accountHeader]: value }), 403, "FORBIDDEN");
  expectNoWork();
});

it("AUT-04.1 AUT-04.4 SYS-10.2 decisions and preview never use the admin client or the LLM boundary", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST", message: "SENTINEL_DATABASE_DIAGNOSTIC" }, status: 503 });
  mocks.from.mockReturnValue(new Proxy({}, { get: () => () => { throw new Error("SENTINEL_DATABASE_DIAGNOSTIC"); } }));
  const decided = await decide({ ...versions, decision: "approved" });
  const previewed = await preview();
  for (const response of [decided, previewed]) {
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await response.json())).not.toContain("SENTINEL");
  }
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.boundary).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
});
