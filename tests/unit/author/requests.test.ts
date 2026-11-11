// @vitest-environment node
/// <reference types="vite/client" />
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
type CollectionRoute = { GET: (request: Request) => Promise<Response>; POST: (request: Request) => Promise<Response> };
type ItemRoute = {
  GET: (request: Request, context: Context) => Promise<Response>;
  PATCH: (request: Request, context: Context) => Promise<Response>;
};
const collectionPath = "/src/app/api/v1/author/challenges/route.ts";
const itemPath = "/src/app/api/v1/author/challenges/[id]/route.ts";
const collections = import.meta.glob<CollectionRoute>("/src/app/api/v1/author/challenges/route.ts");
const items = import.meta.glob<ItemRoute>("/src/app/api/v1/author/challenges/*/route.ts");

const origin = "https://app.example.test";
const authorId = "00000000-0000-4000-8000-000000000001";
const challengeId = "00000000-0000-4000-8000-000000000101";
const key = "00000000-0000-4000-8000-000000000981";
const accountHeader = "X-LGTM-Workspace-Account-Id";
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
const messages = {
  title: "Enter a title.",
  titleLong: "Title is too long.",
  description: "Enter a description.",
  descriptionLong: "Description is too long.",
  language: "Choose a supported language.",
  difficulty: "Choose a difficulty.",
  code: "Paste working code.",
  codeLarge: "Working code exceeds the size limit.",
  codeInvalid: "Working code contains invalid characters.",
  count: "Choose a whole-number flaw count within the allowed range.",
  categories: "Choose supported flaw categories without duplicates.",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAccount.mockResolvedValue({ status: "ok", account: { id: authorId, role: "author", displayName: "Author A" } });
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "test stub" }, status: 400 });
  mocks.from.mockImplementation(() => { throw new Error("Unexpected table access in a request-boundary test"); });
});

async function collection() {
  if (!collections[collectionPath]) throw new Error(`Missing T-20 Route Handler: ${collectionPath}`);
  return collections[collectionPath]();
}

async function item() {
  if (!items[itemPath]) throw new Error(`Missing T-20 Route Handler: ${itemPath}`);
  return items[itemPath]();
}

async function create(body: unknown, headers: Record<string, string> = {}) {
  const { POST } = await collection();
  return POST(new Request(`${origin}/api/v1/author/challenges`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}

async function patch(body: unknown, headers: Record<string, string> = {}, id = challengeId) {
  const { PATCH } = await item();
  return PATCH(new Request(`${origin}/api/v1/author/challenges/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

async function list(query: string) {
  const { GET } = await collection();
  return GET(new Request(`${origin}/api/v1/author/challenges${query}`));
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const payload = await response.json();
  expect(payload).toEqual({ error: expect.objectContaining({ code, message: expect.stringMatching(/\S/) }) });
  return payload.error as { code: string; message: string; fieldErrors?: Record<string, string[]> };
}

function utf8(value: string) {
  return new TextEncoder().encode(value).length;
}

const fieldCases: [string, Record<string, unknown>, string, string][] = [
  ["a missing title", { title: undefined }, "title", messages.title],
  ["a whitespace-only title", { title: " \t\n " }, "title", messages.title],
  ["a 121-code-point title", { title: "é".repeat(121) }, "title", messages.titleLong],
  ["a missing description", { description: undefined }, "description", messages.description],
  ["a whitespace-only description", { description: "   " }, "description", messages.description],
  ["a 4,001-code-point description", { description: "d".repeat(4001) }, "description", messages.descriptionLong],
  ["a missing language", { language: undefined }, "language", messages.language],
  ["an unsupported language", { language: "ruby" }, "language", messages.language],
  ["a display-label language", { language: "Python" }, "language", messages.language],
  ["a missing difficulty", { difficulty: undefined }, "difficulty", messages.difficulty],
  ["an unsupported difficulty", { difficulty: "expert" }, "difficulty", messages.difficulty],
  ["missing working code", { workingCode: undefined }, "workingCode", messages.code],
  ["whitespace-only working code", { workingCode: " \r\n\t\n" }, "workingCode", messages.code],
  ["20,001-byte working code", { workingCode: "a".repeat(20_001) }, "workingCode", messages.codeLarge],
  ["multibyte working code one byte over the cap", { workingCode: `${"é".repeat(10_000)}a` }, "workingCode", messages.codeLarge],
  ["ill-formed Unicode working code", { workingCode: "const broken = '\uD800';\n" }, "workingCode", messages.codeInvalid],
  ["a missing flaw count", { flawCount: undefined }, "flawCount", messages.count],
  ["a zero flaw count", { flawCount: 0 }, "flawCount", messages.count],
  ["a six flaw count", { flawCount: 6 }, "flawCount", messages.count],
  ["a fractional flaw count", { flawCount: 2.5 }, "flawCount", messages.count],
  ["a string flaw count", { flawCount: "2" }, "flawCount", messages.count],
  ["no categories", { categories: [] }, "categories", messages.categories],
  ["missing categories", { categories: undefined }, "categories", messages.categories],
  ["an unsupported category", { categories: ["style"] }, "categories", messages.categories],
  ["a display-label category", { categories: ["Logic bug"] }, "categories", messages.categories],
  ["duplicate categories", { categories: ["logic_bug", "logic_bug"] }, "categories", messages.categories],
  ["six categories", { categories: ["logic_bug", "edge_case", "error_handling", "security", "performance", "logic_bug"] },
    "categories", messages.categories],
];

it.each(fieldCases)("AUT-01.2 AUT-02.2 SYS-02.1 rejects %s on save with its exact field message and no write",
  async (_case, change, field, message) => {
    const error = await expectError(await create({ ...valid, ...change }), 400, "VALIDATION_ERROR");
    expect(error.fieldErrors).toEqual({ [field]: [message] });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

it.each(fieldCases)("AUT-02.2 AUT-06.3 SYS-02.1 rejects %s on a draft edit with its exact field message and no write",
  async (_case, change, field, message) => {
    // An edit omits unchanged fields, so a "missing" value is sent as an explicit null.
    const value = field in change ? change[field] : valid[field as keyof typeof valid];
    const body = { ...versions, [field]: value === undefined ? null : value };
    const error = await expectError(await patch(body), 400, "VALIDATION_ERROR");
    expect(error.fieldErrors).toEqual({ [field]: [message] });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

it("AUT-01.2 SYS-02.1 accepts the 20,000-byte cap after CRLF and lone-CR normalization and sends LF code", async () => {
  const lines = "x".repeat(9_997);
  const workingCode = `${lines}\r\n${lines}\r${"y".repeat(4)}`;
  expect(utf8(workingCode.replace(/\r\n?/g, "\n"))).toBe(20_000);
  expect(utf8(workingCode)).toBe(20_001);
  await create({ ...valid, workingCode });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledWith("create_author_challenge", {
    p_idempotency_key: key,
    p_payload: expect.objectContaining({ workingCode: `${lines}\n${lines}\n${"y".repeat(4)}` }),
  });
});

it("AUT-01.2 SYS-02.1 measures multibyte code in UTF-8 bytes and accepts exactly 20,000 bytes", async () => {
  const workingCode = "é".repeat(10_000);
  expect(utf8(workingCode)).toBe(20_000);
  await create({ ...valid, workingCode });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it("AUT-01.2 accepts boundary title, description, flaw count and category selections", async () => {
  await create({
    ...valid, title: "t".repeat(120), description: "😀".repeat(4000), flawCount: 5,
    categories: ["logic_bug", "edge_case", "error_handling", "security", "performance"],
  });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  await create({ ...valid, flawCount: 1, categories: ["security"] });
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});

it("AUT-02.2 permits more selected categories than the requested flaw count", async () => {
  await create({ ...valid, flawCount: 1, categories: ["logic_bug", "edge_case", "performance"] });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it("SYS-02.1 rejects unknown create fields without echoing their names", async () => {
  const name = "PRIVATE_AUTHOR_NOTE";
  const error = await expectError(await create({ ...valid, [name]: true }), 400, "VALIDATION_ERROR");
  expect(JSON.stringify(error)).not.toContain(name);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([
  ["a missing key", {}],
  ["a malformed key", { "Idempotency-Key": "not-a-uuid" }],
])("SYS-02.1 rejects a create with %s before any write", async (_case, headers) => {
  const { POST } = await collection();
  const response = await POST(new Request(`${origin}/api/v1/author/challenges`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(valid),
  }));
  await expectError(response, 400, "VALIDATION_ERROR");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("SYS-02.1 rejects malformed JSON before any write", async () => {
  await expectError(await create("{\"title\":"), 400, "VALIDATION_ERROR");
  await expectError(await patch("{\"expectedRowVersion\":"), 400, "VALIDATION_ERROR");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("SYS-02.1 returns 413 for create and edit bodies over 128 KiB before parsing or writing", async () => {
  const oversized = { ...valid, workingCode: "a".repeat(128 * 1024) };
  await expectError(await create(oversized), 413, "PAYLOAD_TOO_LARGE");
  await expectError(await create(`{"title":"${"a".repeat(128 * 1024)}`), 413, "PAYLOAD_TOO_LARGE");
  await expectError(await patch({ ...versions, workingCode: oversized.workingCode }), 413, "PAYLOAD_TOO_LARGE");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([
  ["no draft field", { ...versions }],
  ["a missing expected row version", { expectedDraftVersion: 1, title: "New title" }],
  ["a missing expected draft version", { expectedRowVersion: 1, title: "New title" }],
  ["a non-integer expected version", { expectedRowVersion: 1.5, expectedDraftVersion: 1, title: "New title" }],
  ["a zero expected version", { expectedRowVersion: 0, expectedDraftVersion: 1, title: "New title" }],
  ["an unknown field", { ...versions, title: "New title", status: "published" }],
  ["a client-supplied generation", { ...versions, title: "New title", generationId: challengeId }],
])("AUT-06.3 SYS-02.1 rejects a draft edit with %s before any write", async (_case, body) => {
  await expectError(await patch(body), 400, "VALIDATION_ERROR");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("SYS-02.1 rejects a malformed challenge ID on read and edit before any database access", async () => {
  const { GET } = await item();
  const read = await GET(new Request(`${origin}/api/v1/author/challenges/not-a-uuid`),
    { params: Promise.resolve({ id: "not-a-uuid" }) });
  await expectError(read, 400, "VALIDATION_ERROR");
  await expectError(await patch({ ...versions, title: "New title" }, {}, "not-a-uuid"), 400, "VALIDATION_ERROR");
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
});

it.each([
  ["an unsupported status", "?status=retired"],
  ["a repeated status", "?status=draft&status=published"],
  ["a zero limit", "?limit=0"],
  ["a 51 limit", "?limit=51"],
  ["a fractional limit", "?limit=2.5"],
  ["a 513-character cursor", `?cursor=${"c".repeat(513)}`],
  ["an unknown query field", "?language=python"],
])("AUT-06.1 SYS-02.1 rejects a list query with %s before any database access", async (_case, query) => {
  await expectError(await list(query), 400, "VALIDATION_ERROR");
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
});

it.each([
  ["unauthenticated", 401, "UNAUTHENTICATED"],
  ["forbidden", 403, "FORBIDDEN"],
  ["unavailable", 503, "SERVICE_UNAVAILABLE"],
] as const)("SYS-11 maps a %s account to %i on every Author draft entry point without data access",
  async (status, httpStatus, code) => {
    mocks.getAccount.mockResolvedValue({ status });
    await expectError(await create(valid), httpStatus, code);
    await expectError(await patch({ ...versions, title: "New title" }), httpStatus, code);
    await expectError(await list(""), httpStatus, code);
    const { GET } = await item();
    await expectError(await GET(new Request(`${origin}/api/v1/author/challenges/${challengeId}`),
      { params: Promise.resolve({ id: challengeId }) }), httpStatus, code);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

it.each(["learner", "ta"])("SYS-08.2 SYS-11.3 denies a %s every Author draft entry point with 403 and no data access", async (role) => {
  mocks.getAccount.mockResolvedValue({ status: "ok", account: { id: authorId, role, displayName: "Not an Author" } });
  await expectError(await create(valid), 403, "FORBIDDEN");
  await expectError(await patch({ ...versions, title: "New title" }), 403, "FORBIDDEN");
  await expectError(await list(""), 403, "FORBIDDEN");
  const { GET } = await item();
  await expectError(await GET(new Request(`${origin}/api/v1/author/challenges/${challengeId}`),
    { params: Promise.resolve({ id: challengeId }) }), 403, "FORBIDDEN");
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
});

it("SYS-16.2 rejects untrusted origins on create and edit before any write", async () => {
  const foreign = { Origin: "https://foreign.example.test" };
  await expectError(await create(valid, foreign), 403, "FORBIDDEN");
  await expectError(await patch({ ...versions, title: "New title" }, foreign), 403, "FORBIDDEN");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("SYS-16.2 accepts same-origin and headerless writes", async () => {
  await create(valid, { Origin: origin });
  await create(valid);
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});

it.each([
  ["a different account", "00000000-0000-4000-8000-000000000002"],
  ["a malformed account", "not-a-uuid"],
])("SYS-08.3 SYS-09.3 rejects %s in the workspace account header before any write", async (_case, value) => {
  await expectError(await create(valid, { [accountHeader]: value }), 403, "FORBIDDEN");
  await expectError(await patch({ ...versions, title: "New title" }, { [accountHeader]: value }), 403, "FORBIDDEN");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
