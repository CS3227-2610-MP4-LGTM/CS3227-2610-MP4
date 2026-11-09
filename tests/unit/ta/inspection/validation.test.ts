// @vitest-environment node
import { expect, it, vi } from "vitest";
import { parseSubmissionQuery, encodeSubmissionCursor } from "@/server/ta/validation";
import { id, submittedAt } from "./evidence";
vi.mock("server-only", () => ({}));

it("TA-01.2 TA-01.3 SYS-02.1 accepts combined optional filters and default/boundary page sizes", () => {
  expect(parseSubmissionQuery(new URLSearchParams())).toMatchObject({ limit: 20 });
  for (const limit of ["1", "20", "50"]) {
    expect(parseSubmissionQuery(new URLSearchParams({ learnerId: id(11), challengeId: id(101), gradingState: "completed", limit })))
      .toMatchObject({ learnerId: id(11), challengeId: id(101), gradingState: "completed", limit: Number(limit) });
  }
  for (const gradingState of ["pending", "running", "failed", "completed"]) {
    expect(parseSubmissionQuery(new URLSearchParams({ gradingState }))).toMatchObject({ gradingState });
  }
});
it.each([
  "learnerId=bad", "challengeId=bad", "gradingState=all", "gradingState=COMPLETED", "limit=0", "limit=51", "limit=1.5",
  "limit=-1", "limit=01", "limit=", "extra=true", "learnerId=", "cursor=", "cursor=%%%", `cursor=${"a".repeat(513)}`,
  `learnerId=${id(11)}&learnerId=${id(12)}`, "limit=1&limit=2", "gradingState=pending&gradingState=failed",
])("SYS-02.1 TA-01.2 TA-01.3 rejects malformed, duplicate or unknown query %s", search => {
  expect(() => parseSubmissionQuery(new URLSearchParams(search))).toThrow();
});
it("TA-01.3 binds bounded opaque cursors to all filters and restores their ordering anchor", () => {
  const filters = { learnerId: id(11), challengeId: id(101), gradingState: "completed" as const };
  const anchor = { submittedAt, id: id(501) };
  const cursor = encodeSubmissionCursor(anchor, filters);
  expect(cursor.length).toBeLessThanOrEqual(512);
  expect(parseSubmissionQuery(new URLSearchParams({ ...filters, cursor }))).toMatchObject({ ...filters, anchor });
  for (const changed of [{ ...filters, learnerId: id(12) }, { ...filters, challengeId: id(102) }, { ...filters, gradingState: "failed" }, {}]) {
    expect(() => parseSubmissionQuery(new URLSearchParams({ ...changed, cursor }))).toThrow();
  }
});
