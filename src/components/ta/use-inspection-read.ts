"use client";
import { useEffect, useMemo, useState } from "react";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
export function useInspectionRead<T extends { status: string }>(key: string, read: (key: string) => Promise<T>) {
  const [retry, setRetry] = useState(0);
  const request = useMemo(() => ({ key, retry }), [key, retry]);
  const [settled, setSettled] = useState<{ request: typeof request; result: T | { status: "unavailable" } }>();
  const report = useReportWorkspaceAccessFailure();
  useEffect(() => {
    let active = true;
    const settle = (result: T | { status: "unavailable" }) => { if (active) setSettled({ request, result }); };
    read(key).then(settle, () => settle({ status: "unavailable" }));
    return () => { active = false; };
  }, [key, read, request]);
  const result = settled?.request === request ? settled.result : undefined;
  useEffect(() => { if (result && isWorkspaceAccessFailure(result)) report(result.status); }, [result, report]);
  return { result, refresh: () => setRetry(value => value + 1), denied: result && isWorkspaceAccessFailure(result) };
}
