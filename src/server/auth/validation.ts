import "server-only";
import { z } from "zod";

export const roleSchema = z.enum(["learner", "author", "ta"]);
export type Role = z.infer<typeof roleSchema>;

const email = z.string().min(1, "required").pipe(z.email("invalid"));
// Count Unicode code points, as Postgres char_length does. Never normalize a password.
const password = z.string().min(1, "required").refine((value) => [...value].length >= 6, "too_short");
const displayName = z.string().trim().min(1, "required")
  .refine((value) => [...value].length <= 80, "too_long");

export const signInSchema = z.strictObject({ email, password });
export const signUpSchema = z.strictObject({ displayName, email, password, role: roleSchema });

export type FieldError = "required" | "invalid" | "too_short" | "too_long";
export function fieldErrors(error: z.ZodError): Record<string, FieldError> {
  const errors: Record<string, FieldError> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "input");
    if (errors[field]) continue;
    errors[field] = ["required", "too_short", "too_long"].includes(issue.message)
      ? issue.message as FieldError : "invalid";
  }
  return errors;
}
