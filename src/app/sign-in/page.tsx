import { Suspense } from "react";
import { connection } from "next/server";
import { AccountEntry } from "@/components/account/account-entry";

export const instant = false;
export default function Page(props: PageProps<"/sign-in">) {
  return <Suspense fallback={<main className="loading-shell" role="status">Loading account…</main>}><Entry searchParams={props.searchParams} /></Suspense>;
}
async function Entry({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  await connection();
  const { notice } = await searchParams;
  return <AccountEntry mode="sign-in" notice={typeof notice === "string" ? notice : undefined} />;
}
