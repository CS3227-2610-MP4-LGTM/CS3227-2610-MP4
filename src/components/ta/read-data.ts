"use client";
import { accountAccessHeader } from "@/lib/learner/challenges";
import type { ReadFailure } from "@/lib/ta/submissions";
// Keep transport and account-failure classification consistent across TA reads.
export async function readTaData<T>(path: string): Promise<{ status: "ok"; data: T } | ReadFailure> {
  try {
    const response = await fetch(`/api/v1/ta/${path}`, { cache: "no-store" });
    if (response.ok) return { status: "ok", data: (await response.json()).data };
    const access = response.headers.get(accountAccessHeader);
    if (response.status === 401) return { status: "unauthenticated" };
    if (response.status === 403) return { status: access === "account_unavailable" ? access : "role_denied" };
    if (response.status === 503 && access === "account_service_unavailable") return { status: access };
    if (response.status === 400) return { status: "invalid" };
    if (response.status === 404) return { status: "not_found" };
  } catch { /* Explicit recovery only; never replay account failures. */ }
  return { status: "unavailable" };
}
