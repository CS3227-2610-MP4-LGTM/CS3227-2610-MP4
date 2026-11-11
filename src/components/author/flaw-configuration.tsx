"use client";

import Link from "next/link";
import { ConfirmationDialog } from "@/components/account/confirmation-dialog";
import { authorChallengesHref, type DraftView } from "@/lib/author/drafts";
import { DraftFieldControls } from "./draft-fields";
import { GenerateProposals, type Generate } from "./generate-proposals";
import { useDraftEditor, type ReloadDraft, type SaveDraft } from "./use-draft-editor";

const fields = ["flawCount", "categories", "difficulty"] as const;
const clearWarningId = "configuration-clear-warning";

export function FlawConfiguration({ draft, save, reload, notice, generate, onGenerated }: {
  draft: DraftView;
  save: SaveDraft;
  reload: ReloadDraft;
  navigate?: (href: string) => void;
  notice?: string;
  /** AUT-03.1: explicit generation for the saved configuration only. */
  generate?: Generate;
  onGenerated?: (draft: DraftView) => void;
}) {
  const editor = useDraftEditor({ initial: draft, fields, save, reload });
  const { phase, archived } = editor;

  return <section className="author-screen" aria-labelledby="configuration-heading">
    <p className="eyebrow">{editor.saved.title}</p>
    <h1 id="configuration-heading">Flaw configuration</h1>
    {notice && <p role="status" className="notice">{notice}</p>}
    {archived && <p className="notice">Archived challenges can&apos;t be edited.</p>}
    <form className="draft-form" noValidate aria-busy={editor.working}
      onSubmit={event => { event.preventDefault(); editor.requestSave(); }}>
      <DraftFieldControls fields={fields} values={editor.values} errors={editor.errors}
        disabled={archived || editor.working} onChange={editor.setValues} refs={editor.refs} />
      <div role="status" aria-live="polite" className="pending-status">
        {phase === "saving" && "Saving configuration…"}
        {phase === "reloading" && "Reloading draft…"}
        {phase === "saved" && <>
          <span className="status-line">Configuration saved.</span>
          {editor.clearedProposals && <span className="status-line">Generate new proposals to continue.</span>}
        </>}
      </div>
      {phase === "conflict" && <div role="alert" className="notice error-notice">
        <p>This draft changed. Reload it before saving.</p>
        <button type="button" className="button secondary" onClick={() => void editor.reloadDraft()}>Reload draft</button>
      </div>}
      {phase === "failed" && <p role="alert" className="notice error-notice">We couldn&apos;t save the configuration. Try again.</p>}
      {phase === "uncertain" && <div role="alert" className="notice error-notice">
        <p>We couldn&apos;t confirm the save. Refresh the draft before continuing.</p>
        <button type="button" className="button secondary" onClick={() => void editor.reloadDraft()}>Refresh draft</button>
      </div>}
      <div className="form-actions">
        <button type="submit" className="button primary" disabled={!editor.canSave}>Save configuration</button>
        <Link href={authorChallengesHref} className="button secondary">Back to challenges</Link>
      </div>
    </form>
    {generate && onGenerated && <GenerateProposals draft={editor.saved} unsaved={editor.dirty} generate={generate}
      onGenerated={onGenerated} reload={() => void editor.reloadDraft()} showBack={false} />}
    {editor.confirming && <ConfirmationDialog title="Clear the current proposals?" descriptionId={clearWarningId}
      onCancel={editor.cancelConfirm}>
      <p id={clearWarningId}>Saving changes clears the current proposals and decisions.</p>
      <div className="form-actions">
        <button type="button" className="button primary" onClick={editor.confirm}>Save configuration</button>
        <button type="button" className="button secondary" onClick={editor.cancelConfirm}>Cancel</button>
      </div>
    </ConfirmationDialog>}
  </section>;
}
