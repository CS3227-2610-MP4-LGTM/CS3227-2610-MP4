import {
  authorErrorMessages, type AuthorChallengePage, type AuthorDraft, type AuthorPageResult, type AuthorReadResult,
  type AuthorWriteResult, type DecisionResult, type DraftPatch, type DraftValues, type ExpectedVersions, type FieldErrors,
  type FinalPreviewResult, type GenerationResult,
} from "@/lib/author/drafts";
import type { WorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { accountAccessHeader } from "@/lib/learner/challenges";
import { workspaceAccountHeader } from "@/lib/learner/submissions";

const base = "/api/v1/author/challenges";
type ErrorBody = { error?: { code?: string; message?: string; fieldErrors?: FieldErrors } };

function accessFailure(response: Response): WorkspaceAccessFailure | null {
  const access = response.headers.get(accountAccessHeader);
  if (response.status === 401) return { status: "unauthenticated" };
  if (access === "role_denied" || access === "account_unavailable" || access === "account_service_unavailable") {
    return { status: access };
  }
  return null;
}

async function errorBody(response: Response): Promise<ErrorBody["error"]> {
  try {
    return ((await response.json()) as ErrorBody).error;
  } catch {
    return undefined;
  }
}

async function write(path: string, init: RequestInit, accountId?: string): Promise<AuthorWriteResult> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    if (accountId) headers.set(workspaceAccountHeader, accountId);
    response = await fetch(path, { ...init, headers, cache: "no-store" });
  } catch {
    return { status: "uncertain" };
  }
  try {
    if (response.ok) return { status: "ok", draft: (await response.json()).data as AuthorDraft };
  } catch {
    return { status: "uncertain" };
  }
  const access = accessFailure(response);
  if (access) return access;
  const error = await errorBody(response);
  switch (response.status) {
    case 400: return { status: "invalid", ...(error?.fieldErrors && { fieldErrors: error.fieldErrors }) };
    case 409:
      if (error?.code === "VERSION_CONFLICT") return { status: "conflict" };
      if (error?.code === "INVALID_STATE" && error.message === authorErrorMessages.archived) return { status: "invalid_state" };
      // An in-progress duplicate may still commit; resolve it with the same request.
      if (error?.code === "INVALID_STATE") return { status: "uncertain" };
      return { status: "failed" };
    case 503: return { status: error?.message === authorErrorMessages.unavailable ? "failed" : "uncertain" };
    case 413: case 403: case 404: case 429: return { status: "failed" };
    default: return { status: "uncertain" };
  }
}

export function createDraft(input: DraftValues, idempotencyKey: string, accountId?: string) {
  return write(base, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(input) }, accountId);
}

export function patchDraft(id: string, patch: DraftPatch, accountId?: string) {
  return write(`${base}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }, accountId);
}

export async function readDraft(id: string): Promise<AuthorReadResult> {
  try {
    const response = await fetch(`${base}/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (response.ok) return { status: "ok", draft: (await response.json()).data as AuthorDraft };
    const access = accessFailure(response);
    if (access) return access;
    if (response.status === 400 || response.status === 404) return { status: "not_found" };
    if (response.status === 403) return { status: "forbidden" };
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function readChallengePage(search: string): Promise<AuthorPageResult> {
  try {
    const response = await fetch(search ? `${base}?${search}` : base, { cache: "no-store" });
    if (response.ok) return { status: "ok", page: (await response.json()).data as AuthorChallengePage };
    const access = accessFailure(response);
    if (access) return access;
    return { status: response.status === 400 ? "invalid" : "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

type Sent = { response: Response; draft?: AuthorDraft } | { response?: never; uncertain: true };

/** Sends one Author mutation; a lost or unreadable success is never reported as a failure. */
async function send(path: string, init: RequestInit, accountId?: string): Promise<Sent> {
  try {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    if (accountId) headers.set(workspaceAccountHeader, accountId);
    const response = await fetch(path, { ...init, headers, cache: "no-store" });
    if (!response.ok) return { response };
    return { response, draft: (await response.json()).data as AuthorDraft };
  } catch {
    return { uncertain: true };
  }
}

/** AUT-03: explicit generation for the saved draft versions under one Idempotency-Key. */
export async function generateProposals(
  id: string, versions: ExpectedVersions, idempotencyKey: string, accountId?: string,
): Promise<GenerationResult> {
  const sent = await send(`${base}/${encodeURIComponent(id)}/proposals`, {
    method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(versions),
  }, accountId);
  if (!sent.response) return { status: "uncertain" };
  if (sent.draft) return { status: "ok", draft: sent.draft };
  const access = accessFailure(sent.response);
  if (access) return access;
  const error = await errorBody(sent.response);
  switch (sent.response.status) {
    case 422: return { status: "invalid_output" };
    case 429: return { status: "limited" };
    case 413: return { status: "too_large" };
    case 504: return { status: "timeout" };
    case 502: return { status: "failed" };
    case 409:
      if (error?.code === "VERSION_CONFLICT") return { status: "conflict" };
      if (error?.code === "INVALID_STATE" && error.message === authorErrorMessages.archived) return { status: "conflict" };
      // An in-progress duplicate may still commit; resolve it with the same key.
      if (error?.code === "INVALID_STATE") return { status: "uncertain" };
      return { status: "failed" };
    case 503: return { status: error?.message === authorErrorMessages.unavailable ? "failed" : "uncertain" };
    case 400: case 403: case 404: return { status: "failed" };
    default: return { status: "uncertain" };
  }
}

/** AUT-04.2: one decision on one active-set proposal with the expected versions. */
export async function decideProposal(
  id: string, proposalId: string, body: ExpectedVersions & { decision: "approved" | "rejected" }, accountId?: string,
): Promise<DecisionResult> {
  const sent = await send(`${base}/${encodeURIComponent(id)}/proposals/${encodeURIComponent(proposalId)}`, {
    method: "PATCH", body: JSON.stringify(body),
  }, accountId);
  if (!sent.response) return { status: "uncertain" };
  if (sent.draft) return { status: "ok", draft: sent.draft };
  const access = accessFailure(sent.response);
  if (access) return access;
  const error = await errorBody(sent.response);
  switch (sent.response.status) {
    case 409: return { status: "conflict" };
    case 503: return { status: error?.message === authorErrorMessages.unavailable ? "failed" : "uncertain" };
    case 400: case 403: case 404: case 413: case 429: return { status: "failed" };
    default: return { status: "uncertain" };
  }
}

/** AUT-04.4: the server-assembled final preview; failures never look like an empty preview. */
export async function readFinalPreview(id: string): Promise<FinalPreviewResult> {
  try {
    const response = await fetch(`${base}/${encodeURIComponent(id)}/preview`, { cache: "no-store" });
    if (response.ok) {
      const preview = (await response.json()).data as Extract<FinalPreviewResult, { status: "ok" }>["preview"];
      return { status: "ok", preview };
    }
    const access = accessFailure(response);
    if (access) return access;
    return { status: response.status === 409 ? "incomplete" : "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
