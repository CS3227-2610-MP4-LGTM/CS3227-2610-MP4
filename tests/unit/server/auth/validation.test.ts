// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { signUpSchema } from "@/server/auth/validation";

const input = { displayName: "Name", email: "person@example.test", password: "abcdef", role: "learner" };

describe("account normalization", () => {
  it.each(["\t\n", "\u00a0", "\u2003", "\ufeff", "\u2028\u2029"])("rejects trimmed whitespace-only display name %j", (displayName) => {
    expect(signUpSchema.safeParse({ ...input, displayName }).success).toBe(false);
    expect(signUpSchema.parse({ ...input, displayName: `${displayName}Name${displayName}` }).displayName).toBe("Name");
  });

  it("counts display-name bounds in Unicode code points", () => {
    expect(signUpSchema.safeParse({ ...input, displayName: "😀".repeat(80) }).success).toBe(true);
    expect(signUpSchema.safeParse({ ...input, displayName: "😀".repeat(81) }).success).toBe(false);
  });

  it("counts password minimum without trimming its value", () => {
    expect(signUpSchema.safeParse({ ...input, password: "😀".repeat(3) }).success).toBe(false);
    expect(signUpSchema.parse({ ...input, password: " a b c " }).password).toBe(" a b c ");
  });
});
