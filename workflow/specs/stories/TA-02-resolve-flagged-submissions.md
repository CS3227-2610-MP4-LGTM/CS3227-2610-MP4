# TA-02 — Resolve flagged submissions

## Story

As a TA, I want a flagged-submission queue with reasons and resolution history so
that I can resolve cases needing moderation.

**Priority:** Must

**AI:** No

## Dependencies

- **Product:** [TA-02 allocation](../PRODUCT-SPEC.md#ta) and
  [moderation flags](../PRODUCT-SPEC.md#moderation-flags).
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code),
  [SYS-08](../TECHNICAL-SPEC.md#sys-08--authorization-at-the-data-boundary),
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures),
  [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) and
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for inert reasons,
  protected append-only moderation and accessible controls.
- **Security:** None; resolving stored flags makes no AI request.
- **Contracts:** [Shared bounds](../INTEGRATION-SPEC.md#shared-values-and-bounds),
  [transport, concurrency and errors](../INTEGRATION-SPEC.md#transport-concurrency-and-errors),
  [FlagView](../INTEGRATION-SPEC.md#shared-response-types),
  [TA surface](../INTEGRATION-SPEC.md#ta-surface),
  [audit ordering](../INTEGRATION-SPEC.md#2-domain-model-and-publication-lifecycle)
  and [flags](../INTEGRATION-SPEC.md#flags).
- **Related stories:** [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns
  navigation/access recovery; [TA-01](TA-01-inspect-submissions.md) owns evidence;
  [TA-03](TA-03-override-a-grade.md) owns grade changes.

## Acceptance criteria

- **TA-02.1:** Opening `/ta/flags` shows “Flagged submissions”, ACC-03 navigation
  and open flags by default. Each queue entry represents one flag, with
  “Submission”, “Flag reason”, “Status”, “Recorded” and “View submission”. Multiple
  flags on one submission remain distinct. The link opens TA-01 detail at
  `/ta/submissions/:submissionId` with the relevant flag identified. Show
  timestamps with date, time and timezone. No open flags uses ACC-03's “No flagged
  submissions.”
- **TA-02.2:** “Status” offers “Open” and “Resolved”; “Flag reason” offers “All”
  and the labels below. “Apply filters” resets the cursor and saves filters in
  the URL. Each flag shows its label, open/resolved status and full learner
  report reason when present. A learner report identifies its comment and line
  in submission detail. Rule flags do not invent a report reason or comment
  association; their label describes the trigger, with TA-01 evidence available.

  | Kind | Label |
  | --- | --- |
  | `near_pass_mark` | “Score near the pass mark” |
  | `grading_output_retried` | “AI grading output needed a retry” |
  | `assessment_disagreement` | “Location match and AI assessment disagree” |
  | `learner_report` | “Learner reported an unmatched comment” |

- **TA-02.3:** Queue pagination uses shared bounds/order and retains filters.
  “Next page” appears only for nonnull nextCursor; “First page” removes the
  cursor. Reload/back restores the requested query. During reads show “Loading
  flagged submissions…” and disable page controls. Failure shows “We couldn't
  load flagged submissions. Try again.” with “Try again” for that query. Invalid
  cursor shows “This queue page isn't valid.” with “First page”. A filtered empty
  result other than the default shows “No flags match these filters.” with
  “Show open flags” returning to `/ta/flags`.
- **TA-02.4:** Submission detail shows every flag, including resolved flags,
  with “Resolution history”. With none show “No moderation flags.” Open flags
  without resolutions show “Awaiting TA review.” Every resolution/correction
  displays “TA”, “Recorded”, “Disposition” and “Reason”; identify the latest as
  “Latest resolution”. Show full inert reasons, verified actor IDs and times
  with timezone, oldest to newest by server auditOrder. Timestamp ties use that
  order. No resolution or flag can be edited or deleted.
- **TA-02.5:** An open flag offers “Resolve flag”; a resolved flag offers “Add
  correction”. The form has required “Disposition”, with unselected placeholder
  “Select a disposition”, options “Upheld” and “Dismissed”, and required “Reason”.
  “Save resolution” submits; “Cancel” closes without writes. Missing/invalid
  disposition shows “Select Upheld or Dismissed.” Blank/whitespace-only reason
  shows “Enter a reason.” An oversized reason shows “Reason exceeds the allowed
  length.” using the shared moderation-reason bound. Invalid input retains the
  draft, associates messages with fields and creates no record.
- **TA-02.6:** While saving show “Saving resolution…” and disable repeat submit.
  Success shows “Resolution saved.”, adds the returned audit entry and marks the
  flag resolved with the latest disposition. A correction appends a new entry;
  prior reasons remain visible. An override is neither required nor implied:
  resolving a flag leaves its grade and published answer key unchanged. Returning
  to the open queue reflects that resolved flag's removal; resolved filters and
  detail retain it. Other open flags on the submission remain open.
- **TA-02.7:** Failed saving shows “We couldn't save this resolution. Try again.”
  and retains the draft for “Try again”. If the outcome is unknown, retry follows
  shared idempotency so the same action cannot add duplicate entries. Concurrent
  distinct decisions both remain in audit history, with latest disposition
  determined by server order. A rejected state/conflict shows “This flag changed.
  Refresh before saving.” with “Refresh submission”; refresh retains the draft
  for review before an explicit new save. No failure claims a saved resolution.
- **TA-02.8:** An absent flag shows “Flag not found.” with “Back to flagged
  submissions”; detail read failures follow TA-01. Session, forbidden-record and
  role failures follow ACC-03. Neither access failure nor interrupted-session
  recovery automatically replays a decision. TAs can resolve retained historical
  flags after a challenge is unpublished or archived under SYS-12.

## Use cases

### UC-TA-02-1 — Resolve or correct a moderation case

**Actor:** TA

**Preconditions:** Usable signed-in TA account; a flag exists in scope.

**Trigger:** Open “Flagged submissions”.

1. The TA filters the queue and opens the flagged submission.
2. The TA inspects TA-01 evidence, the flag reason and existing resolution history.
3. The TA chooses “Resolve flag” or “Add correction”, selects a disposition and
   supplies a reason.
4. “Save resolution” records the decision and refreshes visible history/status.
5. “Back to flagged submissions” returns to the queue.

**Alternate paths:** The TA cancels under TA-02.5, or separately overrides a
grade through TA-03. Resolved cases remain discoverable under TA-02.2–4.

**Failure paths:** List errors follow TA-02.3; validation follows TA-02.5;
save/conflict/access recovery follows TA-02.7–8.

**Postconditions:** A successful decision appends an attributable resolution;
the original flag, grade, key and previous decisions remain intact.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| One submission has several flags | TA-02.1 and TA-02.6 resolve only the selected flag. |
| Two TAs decide concurrently | TA-02.7 retains both decisions with deterministic latest disposition. |
| A correction changes upheld to dismissed | TA-02.4–6 preserves both reasons. |
| Grade override removes the near-pass condition | The original rule flag remains under TA-02.6 and the flags contract. |
| Duplicate submit or interrupted response | TA-02.6–7 prevents duplicate action records. |

## UI notes

Keep the selected flag, evidence link, original assessment and current grade
visible while moderating. Label dispositions and statuses with text. Associate
errors with their form fields, focus the first invalid field, announce saving
and success, and return focus to the flag after save/cancel under SYS-17. Preserve
readable history and labelled back navigation at phone width.
