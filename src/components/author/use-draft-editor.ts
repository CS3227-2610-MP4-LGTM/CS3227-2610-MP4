"use client";

import { useRef, useState } from "react";
import { useReportWorkspaceAccessFailure } from "@/components/account/workspace-access-boundary";
import {
  validateDraftFields, type DraftField, type DraftPatch, type DraftReadOutcome, type DraftView, type DraftWriteOutcome,
} from "@/lib/author/drafts";
import { isWorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import {
  changedFields, firstMessages, focusFirstInvalid, formFrom, formInput, type FieldRefs, type FormErrors, type FormValues,
} from "./draft-fields";

export type SaveDraft = (patch: DraftPatch) => Promise<DraftWriteOutcome>;
export type ReloadDraft = () => Promise<DraftReadOutcome>;
export type EditorPhase = "idle" | "saving" | "saved" | "conflict" | "failed" | "uncertain" | "reloading";

/**
 * Shared save cycle for Flaw configuration (AUT-02) and Edit draft (AUT-06.3):
 * validate, confirm before clearing proposals, send only changed fields with the
 * expected versions, and resolve conflicts or uncertainty by rereading only.
 */
export function useDraftEditor({ initial, fields, save, reload }: {
  initial: DraftView;
  fields: readonly DraftField[];
  save: SaveDraft;
  reload: ReloadDraft;
}) {
  const reportAccessFailure = useReportWorkspaceAccessFailure();
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState<FormValues>(() => formFrom(initial));
  const [errors, setErrors] = useState<FormErrors>({});
  const [phase, setPhase] = useState<EditorPhase>("idle");
  const [clearedProposals, setClearedProposals] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const refs: FieldRefs = useRef({});
  const busy = useRef(false);

  const archived = saved.status === "archived";
  const changed = changedFields(values, saved, fields);
  const working = phase === "saving" || phase === "reloading";
  const canSave = !archived && !working && changed.length > 0;

  function adopt(draft: DraftView) {
    setSaved(draft);
    setValues(formFrom(draft));
    setErrors({});
  }

  function requestSave() {
    if (busy.current || !canSave) return;
    const { fieldErrors } = validateDraftFields(formInput(values), fields);
    const next = firstMessages(fieldErrors);
    setErrors(next);
    if (Object.keys(next).length) {
      focusFirstInvalid(next, refs);
      return;
    }
    if (saved.proposals.length) setConfirming(true);
    else void commit();
  }

  async function commit() {
    setConfirming(false);
    if (busy.current) return;
    const { values: changedValues } = validateDraftFields(formInput(values), changed);
    const patch: DraftPatch = {
      expectedRowVersion: saved.rowVersion, expectedDraftVersion: saved.draftVersion, ...changedValues,
    };
    const hadProposals = saved.proposals.length > 0;
    busy.current = true;
    setPhase("saving");
    setClearedProposals(false);
    let result: DraftWriteOutcome;
    try {
      result = await save(patch);
    } catch {
      result = { status: "uncertain" };
    }
    busy.current = false;
    if (result.status === "ok" && result.draft) {
      adopt(result.draft);
      setClearedProposals(hadProposals && result.draft.proposals.length === 0);
      setPhase("saved");
    } else if (isWorkspaceAccessFailure(result)) {
      setPhase("uncertain");
      reportAccessFailure(result.status);
    } else if (result.status === "invalid") {
      const next = firstMessages(result.fieldErrors);
      setErrors(next);
      setPhase(Object.keys(next).length ? "idle" : "failed");
      focusFirstInvalid(next, refs);
    } else if (result.status === "conflict" || result.status === "invalid_state") {
      setPhase("conflict");
    } else {
      setPhase(result.status === "uncertain" ? "uncertain" : "failed");
    }
  }

  async function reloadDraft() {
    if (busy.current) return;
    const previous = phase;
    busy.current = true;
    setPhase("reloading");
    let result: DraftReadOutcome;
    try {
      result = await reload();
    } catch {
      result = { status: "unavailable" };
    }
    busy.current = false;
    if (result.status === "ok" && result.draft) {
      adopt(result.draft);
      setPhase("idle");
      return;
    }
    if (isWorkspaceAccessFailure(result)) reportAccessFailure(result.status);
    // A failed reread leaves the unresolved state and its recovery action in place.
    setPhase(previous);
  }

  return {
    saved, values, setValues, errors, phase, refs, archived, working, canSave, clearedProposals,
    confirming, cancelConfirm: () => setConfirming(false), confirm: () => void commit(), requestSave, reloadDraft,
  };
}
