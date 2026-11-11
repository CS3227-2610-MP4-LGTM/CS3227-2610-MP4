"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import {
  authorChallengesHref, configurationHref, validateDraftFields,
  type DraftValues, type DraftWriteOutcome,
} from "@/lib/author/drafts";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import {
  DraftFieldControls, emptyForm, firstMessages, focusFirstInvalid, formInput,
  type FieldRefs, type FormErrors, type FormValues,
} from "./draft-fields";
import { rememberDraftSaved } from "./notices";

type Create = (input: DraftValues, idempotencyKey: string) => Promise<DraftWriteOutcome>;
type Phase = "idle" | "saving" | "failed" | "uncertain" | "checking" | "opening";

const metadata = ["title", "description", "language", "difficulty", "workingCode"] as const;
const configuration = ["flawCount", "categories"] as const;

export function CreateChallengeForm({ create, navigate }: { create: Create; navigate: (href: string) => void }) {
  const reportAccessFailure = useReportWorkspaceAccessFailure();
  const [values, setValues] = useState<FormValues>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const refs: FieldRefs = useRef({});
  const busy = useRef(false);
  // The exact request of an unconfirmed save; "Check save" replays it with the same key.
  const pendingSave = useRef<{ input: DraftValues; key: string } | null>(null);

  async function send(input: DraftValues, key: string, checking: boolean) {
    busy.current = true;
    setPhase(checking ? "checking" : "saving");
    let result: DraftWriteOutcome;
    try {
      result = await create(input, key);
    } catch {
      result = { status: "uncertain" };
    }
    busy.current = false;
    if (result.status === "ok" && result.draft) {
      pendingSave.current = null;
      rememberDraftSaved(result.draft.id);
      // Next can keep this route mounted while hidden, so drop the form's fields once saved.
      setPhase("opening");
      navigate(configurationHref(result.draft.id));
      return;
    }
    if (isWorkspaceAccessFailure(result)) {
      setPhase(pendingSave.current ? "uncertain" : "idle");
      reportAccessFailure(result.status);
      return;
    }
    if (result.status === "uncertain") {
      setPhase("uncertain");
      return;
    }
    // Any other answer is definitive: this save did not create a draft.
    pendingSave.current = null;
    if (result.status === "invalid" && result.fieldErrors) {
      const next = firstMessages(result.fieldErrors);
      setErrors(next);
      setPhase("idle");
      focusFirstInvalid(next, refs);
      return;
    }
    setPhase("failed");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || pendingSave.current) return;
    const { values: valid, fieldErrors } = validateDraftFields(formInput(values));
    const next = firstMessages(fieldErrors);
    setErrors(next);
    if (Object.keys(next).length) {
      setPhase("idle");
      focusFirstInvalid(next, refs);
      return;
    }
    const input = valid as DraftValues;
    const key = crypto.randomUUID();
    pendingSave.current = { input, key };
    void send(input, key, false);
  }

  function checkSave() {
    if (busy.current || !pendingSave.current) return;
    void send(pendingSave.current.input, pendingSave.current.key, true);
  }

  const working = phase === "saving" || phase === "checking";
  if (phase === "opening") return <p role="status" className="pending-status">Opening flaw configuration…</p>;
  return <form className="draft-form" onSubmit={submit} noValidate aria-busy={working}>
    <section className="form-section" aria-labelledby="create-details">
      <h2 id="create-details">Challenge details</h2>
      <DraftFieldControls fields={metadata} values={values} errors={errors} disabled={working} onChange={setValues} refs={refs} />
    </section>
    <section className="form-section" aria-labelledby="create-configuration">
      <h2 id="create-configuration">Flaws to inject</h2>
      <DraftFieldControls fields={configuration} values={values} errors={errors} disabled={working} onChange={setValues} refs={refs} />
    </section>
    <div role="status" aria-live="polite" className="pending-status">
      {phase === "saving" ? "Saving draft…" : phase === "checking" ? "Checking save…" : ""}
    </div>
    {phase === "failed" && <p role="alert" className="notice error-notice">We couldn&apos;t save the draft. Try again.</p>}
    {phase === "uncertain" && <div role="alert" className="notice error-notice">
      <p>We couldn&apos;t confirm whether the draft was saved.</p>
      <button type="button" className="button secondary" onClick={checkSave}>Check save</button>
    </div>}
    <div className="form-actions">
      <button type="submit" className="button primary" disabled={working || phase === "uncertain"}>Save draft</button>
      <Link href={authorChallengesHref} className="button secondary">Cancel</Link>
    </div>
  </form>;
}
