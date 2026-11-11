// @vitest-environment node
/// <reference types="vite/client" />
// Fix round 1 supplemental tests for T-20 review findings REV-01, REV-03 and REV-05.
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAccount: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.getAccount }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/server/supabase/admin", () => ({
  createAdminClient: () => { throw new Error("Author draft entry points must use a user-scoped client"); },
}));
vi.mock("@/server/llm/boundary", () => ({
  createLlmBoundary: () => { throw new Error("Author draft entry points make no LLM request"); },
}));

type Context = { params: Promise<{ id: string }> };
type CollectionRoute = { POST: (request: Request) => Promise<Response> };
type ItemRoute = { PATCH: (request: Request, context: Context) => Promise<Response> };
const collectionPath = "/src/app/api/v1/author/challenges/route.ts";
const itemPath = "/src/app/api/v1/author/challenges/[id]/route.ts";
const collections = import.meta.glob<CollectionRoute>("/src/app/api/v1/author/challenges/route.ts");
const items = import.meta.glob<ItemRoute>("/src/app/api/v1/author/challenges/*/route.ts");

const origin = "https://app.example.test";
const authorId = "00000000-0000-4000-8000-000000000001";
const challengeId = "00000000-0000-4000-8000-000000000101";
const key = "00000000-0000-4000-8000-000000000981";
const valid = {
  title: "Checkout totals",
  description: "Review the changes to discounts and basket totals.",
  language: "javascript",
  difficulty: "easy",
  workingCode: "function total(items) {\n  return items.length;\n}\n",
  flawCount: 2,
  categories: ["logic_bug", "edge_case"],
};
const versions = { expectedRowVersion: 1, expectedDraftVersion: 1 };
const int32Max = 2_147_483_647;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAccount.mockResolvedValue({ status: "ok", account: { id: authorId, role: "author", displayName: "Author A" } });
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "test stub" }, status: 400 });
  mocks.from.mockImplementation(() => { throw new Error("Unexpected table access in a request-boundary test"); });
});

async function create(body: unknown) {
  if (!collections[collectionPath]) throw new Error(`Missing T-20 Route Handler: ${collectionPath}`);
  const { POST } = await collections[collectionPath]();
  return POST(new Request(`${origin}/api/v1/author/challenges`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  }));
}

async function patch(body: unknown) {
  if (!items[itemPath]) throw new Error(`Missing T-20 Route Handler: ${itemPath}`);
  const { PATCH } = await items[itemPath]();
  return PATCH(new Request(`${origin}/api/v1/author/challenges/${challengeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: challengeId }) });
}

async function expectValidationError(response: Response) {
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const payload = await response.json();
  expect(payload).toEqual({ error: expect.objectContaining({ code: "VALIDATION_ERROR", message: expect.stringMatching(/\S/) }) });
  return payload.error as { fieldErrors?: Record<string, string[]> };
}

function payloadOf(call: number) {
  return (mocks.rpc.mock.calls[call][1] as { p_payload: Record<string, unknown> }).p_payload;
}

// PostgreSQL text and jsonb cannot store U+0000, so it must fail validation instead of surfacing as a 503.
const nulCases: [string, Record<string, string>, string][] = [
  ["title", { title: "Checkout\u0000totals" }, "Enter a title."],
  ["description", { description: "Review\u0000the totals." }, "Enter a description."],
  ["workingCode", { workingCode: "const a = 1;\u0000\n" }, "Working code contains invalid characters."],
];

it.each(nulCases)("AUT-01.2 SYS-02.1 REV-01 rejects U+0000 in %s on create with its field message and no write",
  async (field, change, message) => {
    const error = await expectValidationError(await create({ ...valid, ...change }));
    expect(error.fieldErrors).toEqual({ [field]: [message] });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

it.each(nulCases)("AUT-02.2 AUT-06.3 SYS-02.1 REV-01 rejects U+0000 in %s on a draft edit with its field message and no write",
  async (field, change, message) => {
    const error = await expectValidationError(await patch({ ...versions, ...change }));
    expect(error.fieldErrors).toEqual({ [field]: [message] });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

it("AUT-01.3 REV-03 sends create categories in vocabulary order so equal selections fingerprint equally", async () => {
  await create({ ...valid, categories: ["security", "logic_bug"] });
  await create({ ...valid, categories: ["logic_bug", "security"] });
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  expect(payloadOf(0).categories).toEqual(["logic_bug", "security"]);
  expect(payloadOf(1)).toEqual(payloadOf(0));
});

it("AUT-06.3 REV-03 sends edited categories in vocabulary order", async () => {
  await patch({ ...versions, categories: ["performance", "security", "logic_bug"] });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(payloadOf(0).categories).toEqual(["logic_bug", "security", "performance"]);
});

it.each(["expectedRowVersion", "expectedDraftVersion"])(
  "AUT-06.3 REV-05 a draft edit with %s at the 2,147,483,647 contract bound reaches the database", async (field) => {
    await patch({ ...versions, [field]: int32Max, title: "New title" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(payloadOf(0)).toMatchObject({ [field]: int32Max });
  });

it.each(["expectedRowVersion", "expectedDraftVersion"])(
  "AUT-06.3 SYS-02.1 REV-05 a draft edit with %s above the contract bound is rejected before any write", async (field) => {
    await expectValidationError(await patch({ ...versions, [field]: int32Max + 1, title: "New title" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
