// @vitest-environment node
/// <reference types="vite/client" />
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAccount: vi.fn(), rpc: vi.fn(), from: vi.fn(), admin: vi.fn(), boundary: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.getAccount }));
vi.mock("@/server/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc, from: mocks.from, auth: { getUser: vi.fn() } }),
}));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/llm/boundary", () => ({ createLlmBoundary: mocks.boundary }));

/**
 * T-23 interface: Route Handlers `POST /api/v1/author/challenges/[id]/unpublish` and
 * `POST /api/v1/author/challenges/[id]/archive`, each taking exactly `{ expectedRowVersion }` with a
 * required `Idempotency-Key` UUID and returning `{ data: { id, status, rowVersion } }`.
 */
type Context = { params: Promise<Record<string, string>> };
type Handler = (request: Request, context: Context) => Promise<Response>;
const handlers = import.meta.glob<{ POST: Handler }>("/src/app/api/v1/author/challenges/*/{unpublish,archive}/route.ts");
const actions = ["unpublish", "archive"] as const;
type Action = typeof actions[number];

const origin = "https://app.example.test";
const authorId = "00000000-0000-4000-8000-000000000001";
const challengeId = "00000000-0000-4000-8000-000000000101";
const key = "00000000-0000-4000-8000-000000000986";
const accountHeader = "X-LGTM-Workspace-Account-Id";
const body = { expectedRowVersion: 4 };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAccount.mockResolvedValue({ status: "ok", account: { id: authorId, role: "author", displayName: "Author A" } });
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "test stub" }, status: 400 });
  mocks.from.mockImplementation(() => { throw new Error("Unexpected table access in a request-boundary test"); });
  mocks.admin.mockImplementation(() => { throw new Error("Unexpected admin client in a lifecycle request"); });
  mocks.boundary.mockImplementation(() => { throw new Error("Unexpected LLM boundary in a lifecycle request"); });
});

async function call(action: Action, payload: unknown, headers: Record<string, string> = { "Idempotency-Key": key }, id = challengeId) {
  const path = `/src/app/api/v1/author/challenges/[id]/${action}/route.ts`;
  if (!handlers[path]) throw new Error(`Missing T-23 Route Handler: ${path}`);
  const { POST } = await handlers[path]();
  return POST(new Request(`${origin}/api/v1/author/challenges/${id}/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  }), { params: Promise.resolve({ id }) });
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ error: expect.objectContaining({ code, message: expect.stringMatching(/\S/) }) });
}

function expectNoWork() {
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.boundary).not.toHaveBeenCalled();
}

const invalidBodies = [
  ["an empty body", {}],
  ["a zero expected row version", { expectedRowVersion: 0 }],
  ["a fractional expected row version", { expectedRowVersion: 4.5 }],
  ["a string expected row version", { expectedRowVersion: "4" }],
  ["an expected draft version", { ...body, expectedDraftVersion: 3 }],
  ["a client-supplied status", { ...body, status: "archived" }],
  ["a client-supplied published pointer", { ...body, publishedRevisionId: null }],
  ["a client-supplied actor", { ...body, authorId }],
  ["an unknown field", { ...body, note: "x" }],
] as const;

for (const action of actions) {
  it.each(invalidBodies)(`AUT-06.6 SYS-02.1 rejects ${action} with %s before any data access`, async (_case, payload) => {
    await expectError(await call(action, payload), 400, "VALIDATION_ERROR");
    expectNoWork();
  });

  it.each([
    ["a missing key", {}],
    ["a malformed key", { "Idempotency-Key": "not-a-uuid" }],
  ])(`AUT-06.6 SYS-02.1 rejects ${action} with %s before any data access`, async (_case, headers) => {
    await expectError(await call(action, body, headers), 400, "VALIDATION_ERROR");
    expectNoWork();
  });

  it(`SYS-02.1 rejects ${action} with malformed JSON, an oversized body or a malformed ID before any data access`, async () => {
    await expectError(await call(action, "{\"expectedRowVersion\":"), 400, "VALIDATION_ERROR");
    await expectError(await call(action, { ...body, padding: "a".repeat(128 * 1024) }), 413, "PAYLOAD_TOO_LARGE");
    await expectError(await call(action, body, { "Idempotency-Key": key }, "not-a-uuid"), 400, "VALIDATION_ERROR");
    expectNoWork();
  });

  it.each([
    ["unauthenticated", 401, "UNAUTHENTICATED"],
    ["forbidden", 403, "FORBIDDEN"],
    ["unavailable", 503, "SERVICE_UNAVAILABLE"],
  ] as const)(`SYS-11 maps a %s account to %i on ${action} without data access`, async (status, httpStatus, code) => {
    mocks.getAccount.mockResolvedValue({ status });
    await expectError(await call(action, body), httpStatus, code);
    expectNoWork();
  });

  it.each(["learner", "ta"])(`SYS-08.2 denies a %s ${action} with 403 before data access`, async role => {
    mocks.getAccount.mockResolvedValue({ status: "ok", account: { id: authorId, role, displayName: "Not an Author" } });
    await expectError(await call(action, body), 403, "FORBIDDEN");
    expectNoWork();
  });

  it(`SYS-16.2 SYS-08.3 rejects ${action} from an untrusted origin or a mismatched workspace account before any write`, async () => {
    await expectError(await call(action, body, { Origin: "https://foreign.example.test", "Idempotency-Key": key }), 403, "FORBIDDEN");
    await expectError(await call(action, body, { [accountHeader]: "00000000-0000-4000-8000-000000000002", "Idempotency-Key": key }),
      403, "FORBIDDEN");
    expectNoWork();
  });

  it(`AUT-06.6 SYS-10.2 ${action} stays user-scoped, never calls the LLM boundary and hides diagnostics`, async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST", message: "SENTINEL_DATABASE_DIAGNOSTIC" }, status: 503 });
    mocks.from.mockReturnValue(new Proxy({}, { get: () => () => { throw new Error("SENTINEL_DATABASE_DIAGNOSTIC"); } }));
    const response = await call(action, body);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(JSON.stringify(await response.json())).not.toContain("SENTINEL");
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.boundary).not.toHaveBeenCalled();
  });
}
