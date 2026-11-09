"use client";
import { useSearchParams } from "next/navigation";
import { readTaData } from "./read-data";
import type { DetailResult, ListResult } from "@/lib/ta/submissions";
import { SubmissionList } from "./submission-list";
import { SubmissionDetail } from "./submission-detail";
async function readPage(search: string): Promise<ListResult> {
 const result = await readTaData<Extract<ListResult, { status: "ok" }>["page"]>(`submissions${search ? `?${search}` : ""}`);
 return result.status === "ok" ? { status: "ok", page: result.data } : result;
}
async function readSubmission(id: string): Promise<DetailResult> {
 const result = await readTaData<Extract<DetailResult, { status: "ok" }>["submission"]>(`submissions/${encodeURIComponent(id)}`);
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
