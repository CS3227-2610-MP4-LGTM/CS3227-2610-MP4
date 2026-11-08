// @vitest-environment node
import { expect, it, vi } from "vitest";
import { parseOverride, parseResolution, parseFlagQuery, encodeFlagCursor } from "@/server/ta/moderation-validation";
import { id, submittedAt } from "../inspection/evidence";
vi.mock("server-only", () => ({}));
it.each([0, 59, 60, 70, 100])("TA-03.2 accepts integer score %i and trims a reason by Unicode code points", score => {
  expect(parseOverride({ score, reason: ` ${"📝".repeat(2000)} ` })).toEqual({ score, reason: "📝".repeat(2000) });
});
it.each([undefined, null, "", "70", -1, 101, 1.5, NaN, Infinity])("TA-03.2 SYS-02.1 rejects invalid score %s", score => {
  expect(() => parseOverride({ score, reason: "Review evidence" })).toThrow();
});
it.each(["upheld", "dismissed"])("TA-02.5 accepts %s and a trimmed reason at the shared bound", disposition => {
  expect(parseResolution({ disposition, reason: ` ${"📝".repeat(2000)} ` })).toEqual({ disposition, reason: "📝".repeat(2000) });
});
it.each([undefined, null, "", "resolved", "Upheld"])("TA-02.5 rejects invalid disposition %s", disposition => {
  expect(() => parseResolution({ disposition, reason: "Evidence" })).toThrow();
});
it.each([undefined, null, "", " \n\t ", "a".repeat(2001), "📝".repeat(2001), 12])("TA-02.5 TA-03.2 SYS-12.3 rejects invalid moderation reason", reason => {
  expect(() => parseResolution({ disposition: "upheld", reason })).toThrow();
  expect(() => parseOverride({ score: 70, reason })).toThrow();
});
it.each(["actorId", "actor_id", "createdAt", "created_at", "auditOrder", "audit_order", "submissionId", "id", "role"])(
  "TA-03.8 SYS-02.1 SYS-12.3 rejects forged or unexpected %s", field => {
    expect(() => parseOverride({ score: 70, reason: "Evidence", [field]: id(22) })).toThrow();
    expect(() => parseResolution({ disposition: "upheld", reason: "Evidence", [field]: id(22) })).toThrow();
  },
);
it("TA-02.1 TA-02.2 TA-02.3 validates default/open/resolved and all flag kinds with bounded filters", () => {
  expect(parseFlagQuery(new URLSearchParams())).toMatchObject({ status: "open", limit: 20 });
  for (const status of ["open", "resolved"]) for (const kind of ["near_pass_mark", "grading_output_retried", "assessment_disagreement", "learner_report"]) {
    expect(parseFlagQuery(new URLSearchParams({ status, kind, limit: "50" }))).toMatchObject({ status, kind, limit: 50 });
  }
  expect(parseFlagQuery(new URLSearchParams("limit=1"))).toMatchObject({ limit: 1 });
});
it.each(["status=all", "kind=all", "kind=other", "limit=0", "limit=51", "limit=1.5", "limit=01", "limit=", "actorId=x", "status=open&status=resolved", "cursor=", "cursor=broken", `cursor=${"a".repeat(513)}`])(
  "TA-02.3 SYS-02.1 rejects malformed, duplicate, unknown or oversized query %s", query => {
    expect(() => parseFlagQuery(new URLSearchParams(query))).toThrow();
  },
);
it("TA-02.3 binds opaque cursor to status/kind and preserves createdAt-descending ID-ascending anchor", () => {
  const filters = { status: "resolved" as const, kind: "learner_report" as const };
  const anchor = { createdAt: submittedAt, id: id(801) };
  const cursor = encodeFlagCursor(anchor, filters);
  expect(cursor.length).toBeLessThanOrEqual(512);
  expect(parseFlagQuery(new URLSearchParams({ ...filters, cursor }))).toMatchObject({ ...filters, anchor });
  for (const changed of ([{ status: "open", kind: filters.kind }, { status: "resolved", kind: "near_pass_mark" }, {}] as Record<string, string>[])) {
    expect(() => parseFlagQuery(new URLSearchParams({ ...changed, cursor }))).toThrow();
  }
});
