# AUT-06 — Maintain challenges

## Story

As an Author, I want to edit, unpublish and archive challenges so that I can
maintain the catalogue while preserving past attempts.

**Priority:** Must

**AI:** No

## Dependencies

- **Product:** [AUT-06 allocation](../PRODUCT-SPEC.md#author),
  [flaw proposals and answer keys](../PRODUCT-SPEC.md#flaw-proposals-and-answer-keys),
  [hints and attempts](../PRODUCT-SPEC.md#hints-and-attempts),
  [challenge input](../PRODUCT-SPEC.md#challenge-input),
  [shared vocabularies](../PRODUCT-SPEC.md#shared-vocabularies) and
  [Author navigation](../PRODUCT-SPEC.md#5-navigation-and-ui).
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code),
  [SYS-04](../TECHNICAL-SPEC.md#sys-04--shared-building-blocks),
  [SYS-08](../TECHNICAL-SPEC.md#sys-08--authorization-at-the-data-boundary),
  [SYS-09](../TECHNICAL-SPEC.md#sys-09--authentication-with-cache-components),
  [SYS-10](../TECHNICAL-SPEC.md#sys-10--database-enforcement-and-privileged-access),
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures),
  [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) and
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui).
- **Security:** None: this story makes no AI request; SYS-02 and SYS-12 govern
  inert code and record access.
- **Contracts:** [shared bounds](../INTEGRATION-SPEC.md#shared-values-and-bounds),
  [code cap](../INTEGRATION-SPEC.md#pasted-code-cap),
  [publication lifecycle](../INTEGRATION-SPEC.md#sys-12-decision-immutable-published-revisions),
  [transport, concurrency and errors](../INTEGRATION-SPEC.md#transport-concurrency-and-errors)
  and [Author surface](../INTEGRATION-SPEC.md#author-surface).
- **Related stories:** [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns
  account, session and access-failure presentation. Author journey:
  [AUT-01](AUT-01-create-a-draft.md),
  [AUT-02](AUT-02-configure-flaws.md),
  [AUT-03](AUT-03-generate-flaw-proposals.md),
  [AUT-04](AUT-04-preview-and-decide-flaws.md),
  [AUT-05](AUT-05-publish-a-challenge.md).

## Acceptance criteria

- **AUT-06.1:** “My challenges” lists only the Author's own challenges, showing
  title, language, difficulty and lifecycle status, with “View challenge” and
  “Create challenge”. A labelled “Status” filter supports all lifecycle states;
  “Load more” follows bounded pagination when another page exists. No records
  shows “No challenges yet.” A filter with no matches shows “No matching
  challenges.” with “Clear filter”. A read failure shows “We couldn't load your
  challenges. Try again.” with “Try again”, never a false empty list.
- **AUT-06.2:** Own challenge detail shows lifecycle status, the working draft,
  current published revision if any, and “Back to challenges”. Editable challenges
  offer “Edit draft”; published challenges additionally offer “Unpublish”; all
  nonarchived states offer “Archive”. “Edit draft” exposes AUT-01 metadata/code and
  AUT-02 configuration with “Save changes” and “Cancel”. Detail read failure shows
  “We couldn't load this challenge. Try again.”; absence shows “Challenge not found.”
  with “Back to challenges”. Account/access denial follows ACC-03.
- **AUT-06.3:** “Save changes” uses AUT-01/AUT-02 field validation and shows “Saving
  changes…” then “Draft changes saved.” Changes invalidate proposals/decisions
  under the lifecycle contract. Before saving over a set, show “Saving changes
  clears the current proposals and decisions.” with “Save changes” and “Cancel”.
  Editing a published challenge changes its working draft only; show “The published
  revision stays live until you publish a new revision.” AUT-03–AUT-05 govern
  regenerating, deciding and publishing. Cancel makes no saved changes.
- **AUT-06.4:** “Unpublish” on a published challenge asks “Unpublish this challenge?
  Learners won't be able to start or retry it.” with “Unpublish” and “Cancel”.
  Confirming shows “Unpublishing…” then returns to “My challenges” with “Challenge
  unpublished.” Discovery and new attempts are blocked; history remains accessible
  under SYS-12. Unpublished detail still permits editing and publication of a new
  revision through AUT-03–AUT-05.
- **AUT-06.5:** “Archive” asks “Archive this challenge? This can't be undone. Editing,
  publishing and new attempts will be unavailable.” with “Archive” and “Cancel”.
  Confirming shows “Archiving…” then returns to “My challenges” with “Challenge
  archived.” Archived detail is read-only with “Archived challenges can't be edited.”
  No restore/delete action is offered. Drafts, revisions and attempts are retained;
  the catalogue no longer exposes the challenge.
- **AUT-06.6:** Saves/lifecycle actions prevent repeated submission while pending.
  Version conflicts show “This challenge changed. Reload it before continuing.”
  with “Reload challenge”, without overwriting newer state. Confirmed failures show
  “We couldn't save the changes. Try again.”, “We couldn't unpublish the challenge.
  Try again.” or “We couldn't archive the challenge. Try again.” as appropriate.
  Unsaved edit values remain on confirmed save failure. An uncertain outcome shows
  “We couldn't confirm the change. Refresh the challenge before continuing.” with
  “Refresh challenge”; lifecycle actions resolve the same operation under shared
  idempotency. No uncertainty is shown as success or automatically retried as a
  new action. Account/access recovery uses ACC-03 without replaying mutations.
- **AUT-06.7:** Concurrent publication/lifecycle/attempt creation follows the shared
  committed ordering. No attempt starts after unpublishing/archiving wins. Already
  committed submissions retain their pinned code, key, original grade, permitted
  feedback and history. Authors gain no access to learner submissions/grades.
  Historical revision detail remains available only to authorized readers under
  SYS-12; an old revision never becomes a catalogue route around lifecycle rules.

## Use cases

### UC-AUT-06-1 — Revise an existing exercise

**Actor:** Author

**Preconditions:** Own editable challenge exists.

**Trigger:** “View challenge” then “Edit draft”.

1. Review lifecycle status and the current working draft.
2. Edit metadata/code/configuration and save, confirming proposal invalidation.
3. Read “Draft changes saved.” and regenerate/review/publish under AUT-03–AUT-05
   when ready, or return to “My challenges”.

**Alternate paths:** Cancel preserves saved state; existing publication stays live
under AUT-06.3 until publication or explicit lifecycle action.

**Failure paths:** Validation follows AUT-01/AUT-02; conflicts/failures use
AUT-06.6; list/detail recovery uses AUT-06.1–2 and ACC-03.

**Postconditions:** Saved changes affect only the draft until a new publication;
past attempts retain their original evidence.

### UC-AUT-06-2 — Withdraw or retire an exercise

**Actor:** Author

**Preconditions:** Own challenge is eligible for the selected lifecycle action.

**Trigger:** Choose “Unpublish” or “Archive” from challenge detail.

1. Read the consequences and confirm, or cancel without changing state.
2. Wait for the operation to resolve.
3. Return to “My challenges” with its updated status and success message.

**Alternate paths:** Unpublished challenges may later publish a new revision;
archiving is terminal under AUT-06.5.

**Failure paths:** AUT-06.6 handles stale/uncertain/failed operations; account/access
failure follows ACC-03 without replaying confirmation.

**Postconditions:** Successful withdrawal blocks discovery/new attempts and
preserves history. Failure preserves the last committed lifecycle state.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Published challenge has an edited draft | AUT-06.3 distinguishes live revision from unpublished changes. |
| Unpublish races a learner's first submission or retry | AUT-06.7 uses committed ordering, preserving any committed attempt. |
| Archive is requested on an already archived challenge | Replay returns the recorded result; a fresh ineligible action cannot change terminal state. |
| Another tab publishes before lifecycle confirmation | AUT-06.6 requires reload, without silently applying stale confirmation. |
| List filter/order cursor is invalid | Shared transport validation; offer clearing the filter/reloading, not an empty success. |
| Challenge belongs to another Author | ACC-03 record denial; no draft/private answer is disclosed. |

## UI notes

Keep “Edit draft”, “Unpublish” and terminal “Archive” distinct and clearly labelled.
Show live-publication and draft information separately; archived records remain
reachable through the status filter. SYS-04 provides shared code/diff presentation.
SYS-17 applies to filter labels, confirmation focus/cancel behavior, pending and
result announcements, and readable controls at phone width. This story itself
makes no AI calls; publication/generation journeys belong to AUT-03–AUT-05.
