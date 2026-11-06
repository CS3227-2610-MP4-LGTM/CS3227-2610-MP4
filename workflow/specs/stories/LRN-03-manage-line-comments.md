# LRN-03 — Manage line comments

## Story

As a Learner, I want to add, edit and remove line comments before submission so
that I can develop my review.

**Priority:** Must

**AI:** No

## Dependencies

- **Product:** [LRN-03 allocation](../PRODUCT-SPEC.md#learner) and
  [navigation and UI](../PRODUCT-SPEC.md#5-navigation-and-ui).
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code)
  for validated, inert text;
  [SYS-04](../TECHNICAL-SPEC.md#sys-04--shared-building-blocks) for shared source;
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures)
  and [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) for access;
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for accessible editing.
- **Security:** No SEC dependency; drafting comments performs no AI operation.
- **Contracts:** [Shared values and bounds](../INTEGRATION-SPEC.md#shared-values-and-bounds)
  for comment text and count;
  [code, proposals and locations](../INTEGRATION-SPEC.md#code-proposals-and-locations)
  for commentable lines;
  [shared response types](../INTEGRATION-SPEC.md#shared-response-types) and
  [Learner surface](../INTEGRATION-SPEC.md#learner-surface) for comment ordering,
  server identities and the absence of persistent drafts.
- **Related stories:** [LRN-02](LRN-02-view-a-challenge-as-a-pr.md) owns the first
  review workspace; [LRN-04](LRN-04-submit-a-final-review.md) owns locking and
  submission; [LRN-06](LRN-06-feedback-hints-and-retry.md) owns retry initialization;
  [ACC-03.4](ACC-03-role-based-landing-and-navigation.md#acceptance-criteria)
  owns interrupted sessions.

## Acceptance criteria

- **LRN-03.1:** In an editable review, each commentable flawed-code line has an
  “Add comment” action, accessibly named with its line number. Activating it
  opens a required “Comment” field associated with that line, with “Add comment”
  and “Cancel”. A valid addition appears under the line with its text, line
  number, “Edit” and “Remove”. Several comments may share a line within the
  shared count bound; adding one never replaces another. No path, diff side or
  line outside the integration location contract can be selected.
- **LRN-03.2:** “Edit” opens the existing comment text with “Save comment” and
  “Cancel”. Only one editor is open at a time; other add, edit and remove
  controls are disabled until it is saved or cancelled. Saving valid text
  replaces only that comment's body and preserves its line and addition order.
  “Cancel” discards only the active editor's changes. “Remove” immediately
  removes that draft comment and leaves the remaining comments unchanged. Moving
  a comment to another line requires removing it and adding a new one. These
  actions affect only the current draft, never a submitted attempt.
- **LRN-03.3:** Comment normalization, text length and total count use the shared
  bounds. Empty or whitespace-only text shows “Enter a comment.”; otherwise
  overlong text shows “Comment is too long.” No invalid addition or edit takes
  effect, and the editor retains its text. At the count cap, “Add comment” is
  disabled with “Comment limit reached. Remove a comment to add another.”;
  existing comments remain editable and removable. Displayed comment text is
  inert. Help text states the linked text/count limits without introducing
  separate bounds.
- **LRN-03.4:** The workspace states “Comments are saved only on this page until
  you submit. Reloading or leaving will discard them.” Drafts, including active
  editor text, live only in page memory; no server draft or browser-persistent
  recovery is created. Before user-initiated navigation away with any draft
  comments or unsaved editor text, show “Leave this review? Your unsaved comments
  will be lost.” with “Keep reviewing” and “Leave review”. The former retains
  the workspace; the latter continues the requested navigation and discards
  the draft. Browser reload/close uses the browser's native unsaved-change
  warning where supported, without requiring custom browser-dialog wording.
  Reloading or returning after leaving starts without those drafts. An
  unrefreshable expired session follows ACC-03.4 and discards them; a warning
  cannot retain protected text or prevent the sign-in transition.
- **LRN-03.5:** The draft comment list and eventual submission array are ordered
  by line number ascending, then by when each comment was added. Editing does
  not move a same-line comment; removing and adding again makes it the newest
  on that line. Server-assigned IDs and ordinals follow the Learner contract;
  no client-supplied identity or timestamp controls submitted ownership/order.
- **LRN-03.6:** An open add/edit editor must be saved or cancelled before review
  confirmation can open. Attempting “Submit review” while one is open shows “Add
  or save your comment, or cancel editing, before submitting.” and focuses that
  editor. A validation failure there follows LRN-03.3. Submission pending,
  uncertain and successful states use LRN-04's editing rules rather than a
  second lock rule.

## Use cases

### UC-LRN-03-1 — Develop a review

**Actor:** Learner

**Preconditions:** Editable first review or eligible retry workspace is open.

**Trigger:** Activate “Add comment” on a flawed-code line.

1. The Learner writes a comment and adds it to the draft.
2. The comment appears beside its line in LRN-03.5 order.
3. The Learner edits or removes comments and adds more, including on the same line.
4. With all editors closed, the Learner continues to LRN-04 confirmation.

**Alternate paths:** “Cancel” keeps the prior draft state. Leaving with draft work
uses LRN-03.4; “Keep reviewing” returns to the intact draft.

**Failure paths:** Invalid text and count exhaustion follow LRN-03.3. An unfinished
editor blocks confirmation under LRN-03.6. Session expiry follows ACC-03.4 without
draft recovery.

**Postconditions:** Before submission, comments exist only in the open page.
Editing does not create an attempt or alter earlier submitted comments.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Two comments on one line | Both remain and follow addition order under LRN-03.1 and LRN-03.5. |
| Edit the oldest same-line comment | Its position stays unchanged under LRN-03.2. |
| Blank text, boundary-length text or one beyond the shared bound | LRN-03.3 accepts/rejects under the shared text definition. |
| Remove the last comment and close all editors | No unsaved comment warning is needed; zero-comment submission belongs to LRN-04. |
| Reload, browser back after departure or unrefreshable expiry | LRN-03.4 promises no retained draft. |

## UI notes

Label every editor with its line number and associate validation with “Comment”.
Focus the field on add/edit; after save/cancel return focus to its line action,
and after removal to that line's “Add comment”. Announce additions, removals and
count errors under SYS-17. Keep comments readable beside or below the shared
source at phone width. The warning concerns local work, not a claim of autosave.
