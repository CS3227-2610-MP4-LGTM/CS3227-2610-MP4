import { describe, expect, it, vi } from "vitest";
import { encodeChallengeCursor, parseChallengeListQuery } from "@/server/learner/validation";

vi.mock("server-only", () => ({}));

const params = (search = "") => new URLSearchParams(search);
const anchor = {
  publishedAt: "2026-01-01T00:00:00Z",
  challengeId: "00000000-0000-4000-8000-000000000101",
};

describe("challenge catalogue input", () => {
  it("LRN-01.3 LRN-01.4 SYS-02.1 preserves contract filter values and bounds every page", () => {
    expect(parseChallengeListQuery(params())).toMatchObject({ limit: 20 });
    expect(parseChallengeListQuery(params("language=javascript&difficulty=easy&category=logic_bug&limit=1")))
      .toMatchObject({ language: "javascript", difficulty: "easy", category: "logic_bug", limit: 1 });
    expect(parseChallengeListQuery(params("limit=50"))).toMatchObject({ limit: 50 });
  });

  it.each([
    "language=JavaScript",
    "language=javascript,python",
    "language=javascript&language=python",
    "language=javascript&language=javascript",
    "language=",
    "difficulty=expert",
    "category=logic-bug",
    "category=security&category=performance",
    "cursor=",
    "cursor=not-a-cursor",
    `cursor=${"a".repeat(513)}`,
    "limit=",
    "limit=0",
    "limit=-1",
    "limit=1.5",
    "limit=51",
    "limit=1&limit=2",
    "search=discount",
    "learnerId=00000000-0000-4000-8000-000000000011",
  ])("LRN-01.7 SYS-02.1 rejects invalid or unexpected query %s", (search) => {
    expect(() => parseChallengeListQuery(params(search))).toThrow();
  });

  it("LRN-01.4 LRN-01.7 binds a cursor to every filter regardless of URL parameter order", () => {
    const filters = { language: "javascript", difficulty: "easy", category: "logic_bug" } as const;
    const cursor = encodeChallengeCursor(anchor, filters);
    expect(cursor.length).toBeGreaterThan(0);
    expect(cursor.length).toBeLessThanOrEqual(512);
    const encoded = encodeURIComponent(cursor);
    expect(parseChallengeListQuery(params(`category=logic_bug&cursor=${encoded}&difficulty=easy&language=javascript`)))
      .toMatchObject({ ...filters, limit: 20, cursor: anchor });
    for (const query of [
      "language=python&difficulty=easy&category=logic_bug",
      "language=javascript&difficulty=medium&category=logic_bug",
      "language=javascript&difficulty=easy&category=edge_case",
      "language=javascript&difficulty=easy",
    ]) {
      expect(() => parseChallengeListQuery(params(`${query}&cursor=${encoded}`))).toThrow();
    }
  });
});
