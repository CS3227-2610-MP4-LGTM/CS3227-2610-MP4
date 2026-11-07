import { redirect } from "next/navigation";
import Link from "next/link";
import { getAccount } from "@/server/auth/account";
import { signUpAction, signInAction, signOutAction } from "@/server/auth/actions";
import { accountNotices, workspaceHref } from "@/lib/auth/navigation";
import { AccountForm } from "./account-form";
import { AccessScreen } from "./access-screen";

export async function AccountEntry({ mode, notice }: { mode: "root" | "sign-in" | "sign-up"; notice?: string }) {
  const result = await getAccount();
  if (result.status === "ok") {
    const suffix = mode === "root" && notice === "account-created" ? "?notice=account-created" : "";
    redirect(workspaceHref(result.account.role) + suffix);
  }
  if (result.status === "forbidden" || result.status === "unavailable") {
    return <main className="account-shell"><AccessScreen kind={result.status === "forbidden" ? "account-unavailable" : "service-unavailable"} signOutAction={signOutAction} /></main>;
  }
  if (mode === "root") redirect("/sign-in");
  return <main className="account-shell">
    <Link href="/" className="brand account-brand">LGTM<span aria-hidden="true" className="brand-dot">.</span></Link>
    {notice && Object.hasOwn(accountNotices, notice) && notice !== "account-created" && <p className="notice entry-notice" role={notice === "sign-out-unconfirmed" ? "alert" : "status"}>{accountNotices[notice]}</p>}
    <AccountForm mode={mode} action={mode === "sign-up" ? signUpAction : signInAction} />
  </main>;
}
