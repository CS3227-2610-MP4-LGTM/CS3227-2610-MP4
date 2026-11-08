import { beforeEach, expect, it, vi } from "vitest";
import { GET as getCatalogue } from "@/app/api/v1/challenges/route";
import { GET as getChallenge } from "@/app/api/v1/challenges/[id]/route";
import { readFirstAttemptAction } from "@/app/learner/challenges/[id]/actions";
import { accountAccessHeader } from "@/lib/learner/challenges";
import { encodeChallengeCursor } from "@/server/learner/validation";

const mocks = vi.hoisted(() => ({ getAccount: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.getAccount }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));

const challengeId = "00000000-0000-4000-8000-000000000101";
const revisionId = "00000000-0000-4000-8000-000000000201";
const replacementId = "00000000-0000-4000-8000-000000000202";
const publishedAt = "2026-01-01T00:00:00Z";
const learner = { status: "ok", account: { id: challengeId, displayName: "Learner", role: "learner" } };
const anchorCard = {
  id: challengeId, revisionId, publishedAt, title: "Checkout totals", description: "Review the changes.",
  language: "javascript", difficulty: "easy", categories: ["logic_bug"],
};
const nextCard = { ...anchorCard,
  id: "00000000-0000-4000-8000-000000000102", revisionId: "00000000-0000-4000-8000-000000000203",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAccount.mockResolvedValue(learner);
});

function catalogue(cursor?: string) {
  const url = new URL("https://app.example.test/api/v1/challenges?limit=1&language=javascript");
  if (cursor) url.searchParams.set("cursor", cursor);
  return getCatalogue(new Request(url));
}

function detail() {
  return getChallenge(new Request(`https://app.example.test/api/v1/challenges/${challengeId}`),
    { params: Promise.resolve({ id: challengeId }) });
}

it("rejects an issued cursor when the same filtered ordering tuple points to a replacement revision", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: { status: "ok", items: [anchorCard, nextCard] } })
    .mockResolvedValueOnce({ data: { status: "ok", items: [nextCard], anchorRevisionId: revisionId } })
    .mockResolvedValueOnce({ data: { status: "ok", items: [nextCard], anchorRevisionId: replacementId } });

  const first = await catalogue();
  expect(first.status).toBe(200);
  const { data: { nextCursor } } = await first.json();

  const accepted = await catalogue(nextCursor);
  expect(accepted.status).toBe(200);
  expect(await accepted.json()).toEqual({ data: { items: [nextCard], nextCursor: null } });

  const stale = await catalogue(nextCursor);
  expect(stale.status).toBe(400);
  expect(await stale.json()).toEqual({
    error: { code: "VALIDATION_ERROR", message: expect.any(String) },
  });
  expect(mocks.rpc).toHaveBeenNthCalledWith(2, "list_learner_challenges", {
    p_limit: 1, p_language: "javascript", p_before: publishedAt, p_after_id: challengeId,
  });
  expect(mocks.rpc.mock.calls[2]).toEqual(mocks.rpc.mock.calls[1]);
});

it("requires a revision ID on an incoming API cursor before reading the catalogue", async () => {
  const cursor = encodeChallengeCursor({ challengeId, publishedAt }, { language: "javascript" });
  expect((await catalogue(cursor)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("returns account recovery when the profile disappears before the detail RPC", async () => {
  mocks.getAccount.mockResolvedValueOnce(learner).mockResolvedValueOnce({ status: "forbidden" });
  mocks.rpc.mockResolvedValue({ data: { status: "forbidden" } });

  const response = await detail();
  expect(response.status).toBe(403);
  expect(response.headers.get(accountAccessHeader)).toBe("account_unavailable");
  expect(await response.json()).toEqual({ error: { code: "FORBIDDEN", message: expect.any(String) } });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("read_learner_challenge", { p_challenge_id: challengeId });
});

it("returns account recovery when the profile disappears before the first-attempt RPC", async () => {
  mocks.getAccount.mockResolvedValueOnce(learner).mockResolvedValueOnce({ status: "forbidden" });
  mocks.rpc.mockResolvedValue({ data: { status: "forbidden" } });

  expect(await readFirstAttemptAction(challengeId)).toEqual({ status: "account_unavailable" });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("read_learner_challenge", { p_challenge_id: challengeId });
});

it("preserves a record denial when the caller still has a valid Learner account", async () => {
  mocks.rpc.mockResolvedValue({ data: { status: "forbidden" } });

  const response = await detail();
  expect(response.status).toBe(403);
  expect(response.headers.get(accountAccessHeader)).toBeNull();
  expect(await readFirstAttemptAction(challengeId)).toEqual({ status: "forbidden" });
});
