"use client";
import { useSearchParams } from "next/navigation";
import { accountAccessHeader } from "@/lib/learner/challenges";
import type { DetailResult, ListResult, ReadFailure } from "@/lib/ta/submissions";
import { SubmissionList } from "./submission-list";
import { SubmissionDetail } from "./submission-detail";
async function readData<T>(suffix: string): Promise<{ status: "ok"; data: T } | ReadFailure> {
 try {
  const response = await fetch(`/api/v1/ta/submissions${suffix}`, { cache: "no-store" });
  if (response.ok) return { status: "ok", data: (await response.json()).data };
  const access = response.headers.get(accountAccessHeader);
  if (response.status === 401) return { status: "unauthenticated" };
  if (response.status === 403) return { status: access === "account_unavailable" ? access : "role_denied" };
  if (response.status === 503 && access === "account_service_unavailable") return { status: access };
  if (response.status === 400) return { status: "invalid" };
  if (response.status === 404) return { status: "not_found" };
 } catch { /* Present explicit retry; never replay account failures. */ }
 return { status: "unavailable" };
}
async function readPage(search: string): Promise<ListResult> {
 const result = await readData<Extract<ListResult, { status: "ok" }>["page"]>(search ? `?${search}` : "");
 return result.status === "ok" ? { status: "ok", page: result.data } : result;
}
async function readSubmission(id: string): Promise<DetailResult> {
 const result = await readData<Extract<DetailResult, { status: "ok" }>["submission"]>(`/${encodeURIComponent(id)}`);
 return result.status === "ok" ? { status: "ok", submission: result.data } : result;
}
export function InspectionRoute({ submissionId }: { submissionId?: string }) {
 const search = useSearchParams().toString();
 if (submissionId) return <SubmissionDetail submissionId={submissionId} search={search} readSubmission={readSubmission} />;

 const params = new URLSearchParams(search);
 const notices = params.getAll("notice");
 const accountCreated = notices.length === 1 && notices[0] === "account-created";
 if (accountCreated) params.delete("notice");

 return <>
   {accountCreated && <p className="notice" role="status">Account created.</p>}
   <SubmissionList search={params.toString()} readPage={readPage}
     navigate={href => window.history.pushState(null, "", href)} />
 </>;
}
