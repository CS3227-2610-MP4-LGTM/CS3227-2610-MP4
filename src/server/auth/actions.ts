"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signUp, signIn, signOut, type AuthResult } from "./service";

export async function signUpAction(data: FormData): Promise<AuthResult> {
  const result = await signUp({ displayName: data.get("displayName"), email: data.get("email"),
    password: data.get("password"), role: data.get("role") });
  if (result.status === "created_without_session") {
    revalidatePath("/", "layout");
    redirect("/sign-in?notice=created-without-session");
  }
  if (result.status === "authenticated") {
    revalidatePath("/", "layout");
    redirect("/?notice=account-created");
  }
  return result;
}

export async function signInAction(data: FormData): Promise<AuthResult> {
  const result = await signIn({ email: data.get("email"), password: data.get("password") });
  if (result.status === "authenticated") {
    revalidatePath("/", "layout");
    redirect("/");
  }
  return result;
}

export async function signOutAction(): Promise<void> {
  const result = await signOut();
  revalidatePath("/", "layout");
  redirect(result.status === "signed_out" ? "/sign-in?notice=signed-out" : "/sign-in?notice=sign-out-unconfirmed");
}
