"use client";

import Link from "next/link";
import { ConfirmationDialog } from "@/components/account/confirmation-dialog";
import { challengeHref, type DraftView } from "@/lib/author/drafts";
import { DraftFieldControls } from "./draft-fields";
import { useDraftEditor, type ReloadDraft, type SaveDraft } from "./use-draft-editor";

const metadata = ["title", "description", "language", "difficulty", "workingCode"] as const;
const configuration = ["flawCount", "categories"] as const;
const fields = [...metadata, ...configuration] as const;
const clearWarningId = "edit-clear-warning";

export function EditDraftForm({ draft, save, reload }: {
  draft: DraftView;
  save: SaveDraft;
  reload: ReloadDraft;
  navigate?: (href: string) => void;
}) {
  const editor = useDraftEditor({ initial: draft, fields, save, reload });
  const { phase, archived } = editor;
  const disabled = archived || editor.working;

  return <section className="author-screen" aria-labelledby="edit-heading">
    <p className="eyebrow">{editor.saved.title}</p>
    <h1 id="edit-heading">Edit draft</h1>
    {archived && <p className="notice">Archived challenges can&apos;t be edited.</p>}
    {editor.saved.status === "published" &&
      <p className="notice">The published revision stays live until you publish a new revision.</p>}
    <form className="draft-form" noValidate aria-busy={editor.working}
      onSubmit={event => { event.preventDefault(); editor.requestSave(); }}>
      <section className="form-section" aria-labelledby="edit-details">
        <h2 id="edit-details">Challenge details</h2>
        <DraftFieldControls fields={metadata} values={editor.values} errors={editor.errors}
          disabled={disabled} onChange={editor.setValues} refs={editor.refs} />
      </section>
      <section className="form-section" aria-labelledby="edit-configuration">
        <h2 id="edit-configuration">Flaws to inject</h2>
        <DraftFieldControls fields={configuration} values={editor.values} errors={editor.errors}
          disabled={disabled} onChange={editor.setValues} refs={editor.refs} />
      </section>
      <div role="status" aria-live="polite" className="pending-status">
        {phase === "saving" && "Saving changes…"}
        {phase === "reloading" && "Reloading challenge…"}
        {phase === "saved" && <>
          <span className="status-line">Draft changes saved.</span>
          {editor.clearedProposals && <span className="status-line">Generate new proposals to continue.</span>}
        </>}
      </div>
      {phase === "conflict" && <div role="alert" className="notice error-notice">
        <p>This challenge changed. Reload it before continuing.</p>
        <button type="button" className="button secondary" onClick={() => void editor.reloadDraft()}>Reload challenge</button>
      </div>}
      {phase === "failed" && <p role="alert" className="notice error-notice">We couldn&apos;t save the changes. Try again.</p>}
      {phase === "uncertain" && <div role="alert" className="notice error-notice">
        <p>We couldn&apos;t confirm the change. Refresh the challenge before continuing.</p>
        <button type="button" className="button secondary" onClick={() => void editor.reloadDraft()}>Refresh challenge</button>
      </div>}
      <div className="form-actions">
        <button type="submit" className="button primary" disabled={!editor.canSave}>Save changes</button>
        <Link href={challengeHref(draft.id)} className="button secondary">Cancel</Link>
      </div>
    </form>
    {editor.confirming && <ConfirmationDialog title="Clear the current proposals?" descriptionId={clearWarningId}
      onCancel={editor.cancelConfirm}>
      <p id={clearWarningId}>Saving changes clears the current proposals and decisions.</p>
      <div className="form-actions">
        <button type="button" className="button primary" onClick={editor.confirm}>Save changes</button>
        <button type="button" className="button secondary" onClick={editor.cancelConfirm}>Cancel</button>
      </div>
    </ConfirmationDialog>}
  </section>;
}
