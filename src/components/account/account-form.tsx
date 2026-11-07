"use client";

import { useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import Link from "next/link";
import type { AuthResult } from "@/server/auth/service";

type Mode = "sign-up" | "sign-in";
const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const fieldMessages: Record<string, Record<string, string>> = {
  displayName: { required: "Enter a display name.", too_long: "Display name is too long." },
  email: { required: "Enter your email.", invalid: "Enter a valid email address." },
  password: { required: "Enter a password.", too_short: "Password is too short." },
  role: { required: "Choose Learner, Author or TA.", invalid: "Choose Learner, Author or TA." },
};

export function AccountForm({ mode, action }: { mode: Mode; action: (data: FormData) => Promise<AuthResult> }) {
  const ready = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const form = useRef<HTMLFormElement>(null);
  const busy = useRef(false);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const creating = mode === "sign-up";

  // These forms submit through JavaScript. Do not expose editable controls in
  // React's hidden streamed subtree before hydration can preserve their focus
  // and handle submission; keyboard input must target the final visible form.
  if (!ready) return <section className="account-card" aria-busy="true"><p role="status">Preparing account form…</p></section>;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    const data = new FormData(event.currentTarget);
    setErrors({});
    setNotice("");
    startTransition(async () => {
      try {
        const result = await action(data);
        if (result.status === "invalid") {
          const nextErrors = Object.fromEntries(Object.entries(result.fieldErrors)
            .map(([field, code]) => [field, fieldMessages[field]?.[code] ?? "Check this field."]));
          setErrors(nextErrors);
          const first = ["displayName", "email", "password", "role"].find((key) => nextErrors[key]);
          if (first) (form.current?.elements.namedItem(first) as HTMLElement | null)?.focus();
        } else if (result.status === "throttled") {
          setNotice("Too many attempts. Try again later.");
        } else if (result.status === "rejected") {
          setNotice(creating ? "We couldn't create an account with these details. Check them or sign in." : "Email or password is incorrect.");
        } else {
          setNotice(creating ? "Account creation is unavailable. Try again." : "Sign-in is unavailable. Try again.");
        }
      } catch (error) {
        // Preserve framework redirects; network failures have unknown outcomes.
        if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
        setNotice(creating ? "We couldn't confirm account creation. Try signing in, or try again." : "We couldn't confirm sign-in. Try again.");
      } finally {
        const password = form.current?.elements.namedItem("password") as HTMLInputElement | null;
        if (password) password.value = "";
        busy.current = false;
        setPending(false);
      }
    });
  }

  const errorProps = (field: string, help?: string) => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": [help, errors[field] ? `${field}-error` : undefined].filter(Boolean).join(" ") || undefined,
  });
  const error = (field: string) => errors[field] ? <p className="field-error" id={`${field}-error`}>{errors[field]}</p> : null;

  return <section className="account-card" aria-labelledby="account-title">
    <p className="eyebrow">Code review academy</p>
    <h1 id="account-title">{creating ? "Create an account" : "Sign in"}</h1>
    <p className="muted">{creating ? "Choose your workspace and start learning together." : "Welcome back to your workspace."}</p>
    <form ref={form} onSubmit={submit} noValidate aria-busy={pending}>
      {creating && <div className="field"><label htmlFor="displayName">Display name</label>
        <input id="displayName" name="displayName" autoComplete="nickname" required {...errorProps("displayName", "name-help")} />
        <p className="field-help" id="name-help">Up to 80 characters.</p>{error("displayName")}</div>}
      <div className="field"><label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required {...errorProps("email")} />{error("email")}</div>
      <div className="field"><label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete={creating ? "new-password" : "current-password"} required {...errorProps("password", "password-help")} />
        <p className="field-help" id="password-help">At least 6 characters.</p>{error("password")}</div>
      {creating && <div className="field"><label htmlFor="role">Role</label>
        <select id="role" name="role" defaultValue="" required {...errorProps("role", "role-help")}>
          <option value="" disabled>Choose a role</option>
          <option value="learner">Learner — Practise reviewing code</option>
          <option value="author">Author — Create review challenges</option>
          <option value="ta">TA — Moderate grades and support learners</option>
        </select>
        <p className="field-help" id="role-help">Your role cannot be changed after account creation.</p>{error("role")}</div>}
      <div aria-live="polite" role="status" className="pending-status">{pending ? creating ? "Creating account…" : "Signing in…" : ""}</div>
      {notice && <p role="alert" className="notice error-notice">{notice}</p>}
      <button className="button primary full-width" type="submit" disabled={pending}>{pending ? creating ? "Creating account…" : "Signing in…" : creating ? "Create account" : "Sign in"}</button>
    </form>
    <p className="account-alternate">{creating ? "Already have an account? " : "New to LGTM? "}<Link href={creating ? "/sign-in" : "/sign-up"}>{creating ? "Sign in" : "Create an account"}</Link></p>
  </section>;
}
