import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Role } from "@/lib/auth/navigation";
import { WorkspacePage } from "./workspace-page";

type Query = Promise<Record<string, string | string[] | undefined>>;
export function RoleLanding({ role, heading, empty, searchParams }: {
  role: Role; heading: string; empty?: string; searchParams: Query;
}) {
  return <Suspense fallback={<main className="loading-shell" role="status">Loading workspace…</main>}>
    <RequestedWorkspace role={role} heading={heading} empty={empty} searchParams={searchParams} />
  </Suspense>;
}

async function RequestedWorkspace(props: { role: Role; heading: string; empty?: string; searchParams: Query }) {
  // Auth SDK initialization emits time-dependent session events. Wait for a
  // real request before constructing any client or rendering account content.
  await connection();
  return <WorkspacePage role={props.role}><LandingContent {...props} /></WorkspacePage>;
}

async function LandingContent({ heading, empty, searchParams }: { heading: string; empty?: string; searchParams: Query }) {
  const query = await searchParams;
  return <><p className="eyebrow">Your workspace</p><h1>{heading}</h1>
    {query.notice === "account-created" && <p className="notice" role="status">Account created.</p>}
    {empty ? <section className="empty-state" aria-label={heading}><span className="empty-symbol" aria-hidden="true">↳</span><h2>{empty}</h2>
      {heading === "My challenges" && <Link href="/author/challenges/new" className="button primary">Create challenge</Link>}</section>
      : <section className="empty-state"><p className="muted">Your challenge workspace is ready.</p></section>}
  </>;
}
