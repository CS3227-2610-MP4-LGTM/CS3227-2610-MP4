"use client";
import { accountAccessHeader } from "@/lib/learner/challenges";
import type { MutationFailure, OverrideResult, ResolutionResult, FlagPageResult } from "@/lib/ta/moderation";
export async function taRequest(path: string, init?: RequestInit): Promise<{status: "ok"; data: unknown} | MutationFailure> {
 try {
  const response = await fetch(`/api/v1/ta/${path}`,{...init,cache: "no-store"});
  const body = await response.json();
  if (response.ok) return {status: "ok",data: body.data};
  const access=response.headers.get(accountAccessHeader);
  if (response.status===401) return {status: "unauthenticated"};
  if (response.status===403) return {status: access === "account_unavailable" ? access : "role_denied"};
  if (response.status===503 && access === "account_service_unavailable") return {status: access};
  if (response.status===400) return {status: "invalid"};
  if (response.status===404) return {status: "not_found"};
  if (response.status===409) return {status: body.error?.code === "INVALID_STATE" ? "invalid_state" : body.error?.code === "IDEMPOTENCY_CONFLICT" ? "idempotency_conflict" : "conflict"};
 } catch { /* An explicit retry retains its original key. */ }
 return {status: "unavailable"};
}
export async function saveOverride(id: string,payload: {score: number;reason: string},key: string): Promise<OverrideResult> {
 const result=await taRequest(`submissions/${encodeURIComponent(id)}/overrides`,{method: "POST",headers: {"Content-Type": "application/json","Idempotency-Key": key},body: JSON.stringify(payload)});
 return result.status === "ok" ? {status: "ok",...(result.data as Omit<Extract<OverrideResult,{status: "ok"}>,"status">)} : result;
}
export async function saveResolution(id: string,payload: {disposition: "upheld" | "dismissed";reason: string},key: string): Promise<ResolutionResult> {
 const result=await taRequest(`flags/${encodeURIComponent(id)}/resolutions`,{method: "POST",headers: {"Content-Type": "application/json","Idempotency-Key": key},body: JSON.stringify(payload)});
 return result.status === "ok" ? {status: "ok",flag: result.data as Extract<ResolutionResult,{status: "ok"}>["flag"]} : result;
}
export async function readFlagPage(search: string): Promise<FlagPageResult> {
 const result=await taRequest(`flags${search ? `?${search}` : ""}`);
 if (result.status === "ok") return {status: "ok",page: result.data as Extract<FlagPageResult,{status: "ok"}>["page"]};
 return ["invalid_state","conflict","idempotency_conflict"].includes(result.status) ? {status: "unavailable"} : result as Exclude<FlagPageResult,{status: "ok"}>;
}
