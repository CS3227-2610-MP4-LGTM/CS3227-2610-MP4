import { expect, it } from "vitest";
import { projectEffectiveGrade } from "@/lib/grading/effective-grade";
it.each([0, 59, 60, 100])("TA-03.3 SYS-12.3 shares score %i / pass mark 60 with every role projection", score => {
  expect(projectEffectiveGrade(25, [{ score, auditOrder: 3 }])).toEqual({ score, passed: score >= 60, source: "ta" });
  expect(projectEffectiveGrade(score, [])).toEqual({ score, passed: score >= 60, source: "ai" });
});
it("TA-03.5 refuses to manufacture a grade without a completed original", () => {
  expect(projectEffectiveGrade(null, [])).toBeNull();
  expect(projectEffectiveGrade(null, [{ score: 100, auditOrder: 1 }])).toBeNull();
});
it("TA-03.4 TA-03.6 SYS-12.3 uses maximum auditOrder regardless of timestamp/array/response ordering without mutating evidence", () => {
  const entries = [{ score: 59, auditOrder: 8 }, { score: 100, auditOrder: 3 }, { score: 60, auditOrder: 7 }];
  const before = structuredClone(entries);
  expect(projectEffectiveGrade(25, entries)).toEqual({ score: 59, passed: false, source: "ta" });
  expect(entries).toEqual(before);
});
