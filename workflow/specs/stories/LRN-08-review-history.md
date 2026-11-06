# LRN-08 — Review history

## Story

As a Learner, I want review history showing both attempts, grades and moderation
outcomes so that I can track my learning.

**Priority:** Should

**AI:** No

## Dependencies

- **Product:** [LRN-08 allocation](../PRODUCT-SPEC.md#learner),
  [grading](../PRODUCT-SPEC.md#grading),
  [moderation flags](../PRODUCT-SPEC.md#moderation-flags) and
  [learning presentation](../PRODUCT-SPEC.md#7-non-functional-requirements).
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code)
  for inert historical text;
  [SYS-04](../TECHNICAL-SPEC.md#sys-04--shared-building-blocks) for source display;
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures)
  for access failures;
  [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) for retained records,
  effective grades and ordered audit history;
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for readable history.
- **Security:** No SEC dependency; history displays stored records and starts no
  AI operation. LRN-05/LRN-06 own AI-result interactions.
- **Contracts:** [Shared values and bounds](../INTEGRATION-SPEC.md#shared-values-and-bounds)
  for pagination;
  [immutable published revisions](../INTEGRATION-SPEC.md#sys-12-decision-immutable-published-revisions)
  for retained evidence;
  [code, proposals and locations](../INTEGRATION-SPEC.md#code-proposals-and-locations)
  for historical Learner projection;
  [transport, concurrency and errors](../INTEGRATION-SPEC.md#transport-concurrency-and-errors)
  for ordering/cursors;
  [shared response types](../INTEGRATION-SPEC.md#shared-response-types),
  [Learner surface](../INTEGRATION-SPEC.md#learner-surface),
  [matching and score](../INTEGRATION-SPEC.md#matching-and-score) and
  [flags](../INTEGRATION-SPEC.md#flags) for cards, effective grades and moderation.
- **Related stories:** [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns
  navigation, history's empty state and access recovery;
  [LRN-05](LRN-05-grade-a-submitted-review.md) owns the result and original grade;
  [LRN-06](LRN-06-feedback-hints-and-retry.md) owns feedback/hints and retry;
  [LRN-07](LRN-07-report-an-unmatched-comment.md) owns report creation;
  [TA-02 and TA-03 allocations](../PRODUCT-SPEC.md#ta) own resolutions/overrides.

## Acceptance criteria

- **LRN-08.1:** `/learner/history` shows ACC-03's “Review history” heading and
  navigation. Each own attempt is a separate entry, including both attempts on
  the same challenge, with “Challenge”, “Attempt”, “Submitted”, “Grading status”,
  “Effective score” and “Open flags”. The title and “View result” link open
  `/learner/history/:submissionId`. Submitted times are shown with date, time and
  timezone; attempt numbers and open-flag counts come from SubmissionCard.
  History never merges two attempts into a best-score row or lists another
  Learner's work.
- **LRN-08.2:** List grading states are labelled “Pending”, “Running”, “Failed”
  and “Completed”. Only completed cards show effectiveScore as `<score> / 100`;
  other states show “Not available” in that column, never zero. Scores reflect
  the effective grade contract, not a locally selected maximum. Empty history
  uses ACC-03.8, with catalogue navigation still available.
- **LRN-08.3:** History uses the shared default page bound and list ordering.
  “Next page” appears only for nonnull nextCursor and opens that cursor in the
  URL; a cursor page offers “First page” to remove it. Final pages omit “Next
  page”. Back/reload restore the requested cursor page. During reads show
  “Loading review history…” and disable pagination. Failure shows “We couldn't
  load review history. Try again.” with “Try again” for that same page. An invalid
  cursor shows “This history page isn't valid.” with “First page” to
  `/learner/history`. Failure never appears as an empty history or missing grade.
- **LRN-08.4:** On LRN-05's result, “Current grade” shows the completed effective
  score out of 100 and “Passed” or “Not passed” using the shared mark. Its source
  label is “Original AI assessment” when source is ai, otherwise “TA override”.
  With no override, state “No TA overrides. The current grade is the original
  assessment.” With overrides, state “A TA override determines the current grade.”
  Keep LRN-05's “Original assessment”, component points, comment statuses and
  feedback unchanged and visibly separate. Do not invent replacement components
  or comment credits from an override score. Noncompleted grading shows “Current
  grade not available.” rather than an effective score or pass/fail.
- **LRN-08.5:** “Override history” lists every returned override, including
  corrections, oldest to newest by server auditOrder. Label entries “TA action”,
  with “Recorded”, “Replacement score” and “Reason”; show time with timezone,
  score out of 100 and the full inert reason. Omit actor IDs and identity
  columns. Identify the latest entry as “Current override”; earlier entries
  remain visible. Ordering and timestamp ties follow SYS-12 and auditOrder. No
  override shows “No TA overrides.” History is read-only for the Learner.
- **LRN-08.6:** “Moderation flags” displays every returned flag, including resolved
  ones, with its label below, “Open” or “Resolved”, recorded time, and its reason
  when present. Learner reports also identify the reported comment and line;
  rule flags do not invent a comment association or reason absent from FlagView.
  No flags shows “No moderation flags.”

  | Contract kind | Plain-language label |
  | --- | --- |
  | `near_pass_mark` | “Score near the pass mark” |
  | `grading_output_retried` | “AI grading output needed a retry” |
  | `assessment_disagreement` | “Location match and AI assessment disagree” |
  | `learner_report` | “Learner reported an unmatched comment” |

- **LRN-08.7:** Each flag has “Resolution history”. Open flags with no
  resolutions show “Awaiting TA review.” Resolved flags show “Latest resolution”
  with its recorded disposition and reason; the full history retains every
  resolution and correction, ordered as in LRN-08.5, labelled “TA action” with
  “Recorded”, “Disposition” and “Reason”. Times use LRN-08.5's presentation;
  omit identities. Display all returned reasons as inert text without revealing
  private grading material. A resolution does not itself imply a changed grade:
  effective-grade presentation follows LRN-08.4. Resolved flags stay visible,
  and overrides do not erase rule flags.
- **LRN-08.8:** Unpublish, archive or newer publication never removes an own
  attempt from history or breaks its result link. Results retain their submitted
  title, pinned code, comments, original assessment, permitted learning material
  and moderation records under SYS-12. The code/diff remains Learner-projected;
  historical access does not grant private answers or a new review. Retry
  availability remains LRN-06's decision. Result-read failures and missing records
  use LRN-05.7; session/role/record failures use ACC-03.

## Use cases

### UC-LRN-08-1 — Revisit an attempt and its moderation

**Actor:** Learner

**Preconditions:** Usable signed-in Learner account; own submissions may exist.

**Trigger:** Activate “Review history”.

1. The Learner sees each attempt's state, effective score and open flags.
2. The Learner pages through history and opens “View result”.
3. The result distinguishes the current grade from the original assessment.
4. The Learner reads every override, flag and resolution with its reason/history.
5. “Review history” returns to the list; catalogue navigation remains available.

**Alternate paths:** Both attempts lead to their independent results. Unpublished
and archived challenges remain reviewable through LRN-08.8; empty history follows
ACC-03.

**Failure paths:** List failures follow LRN-08.3; result failures follow LRN-05.7;
account and access failures follow ACC-03.

**Postconditions:** Browsing changes no grade or moderation record. The Learner
can distinguish original assessment, effective outcome and retained human decisions.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| First and second attempts have different scores or states | LRN-08.1–2 shows separate rows and result destinations. |
| A genuine completed zero versus a failed grade | LRN-08.2 displays zero only for the completed result. |
| Several overrides or resolution corrections share a timestamp | LRN-08.5–7 preserves server audit ordering and every reason. |
| A resolved report and open rule flag coexist | LRN-08.6–7 shows both; the card's open count is not the total flag count. |
| Override changes pass/fail without resolving flags | LRN-08.4 changes the effective outcome; original and flags stay visible. |

## UI notes

Use readable rows or stacked entries at phone width with the same labels. Keep
original assessment, current grade, override history and moderation history
visibly distinct. Use text labels for grade/flag states, not colour alone. Focus
the list heading after pagination and the result heading after entry; announce
loading and failures under SYS-17. Display reasons in full and retain access to
every history entry without adding TA editing controls to the Learner result.
