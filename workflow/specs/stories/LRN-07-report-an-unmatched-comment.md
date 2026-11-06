# LRN-07 — Report an unmatched comment

## Story

As a Learner, I want to report an unmatched comment that I believe identifies a
real issue absent from the answer key so that a TA can review it.

**Priority:** Must

**AI:** No

## Dependencies

- **Product:** [LRN-07 allocation](../PRODUCT-SPEC.md#learner),
  [grading](../PRODUCT-SPEC.md#grading) and
  [moderation flags](../PRODUCT-SPEC.md#moderation-flags);
  [TA-02 allocation](../PRODUCT-SPEC.md#ta) owns resolution.
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code)
  for reason validation and inert text;
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures)
  for access failures;
  [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) for owned completed
  submissions and immutable reports;
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for the form.
- **Security:** No SEC dependency; a Learner report is a human moderation request,
  not an AI operation.
- **Contracts:** [Shared values and bounds](../INTEGRATION-SPEC.md#shared-values-and-bounds)
  for report reasons;
  [transport, concurrency and errors](../INTEGRATION-SPEC.md#transport-concurrency-and-errors)
  for safe replay;
  [shared response types](../INTEGRATION-SPEC.md#shared-response-types),
  [Learner surface](../INTEGRATION-SPEC.md#learner-surface) and
  [flags](../INTEGRATION-SPEC.md#flags) for eligibility, uniqueness and results.
- **Related stories:** [LRN-05](LRN-05-grade-a-submitted-review.md) owns result and
  comment statuses; [LRN-08](LRN-08-review-history.md) owns flag/resolution display;
  [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns access recovery.

## Acceptance criteria

- **LRN-07.1:** On the Learner's own completed result, each unmatched comment
  without a prior report has “Report unmatched comment”. Matched and duplicate
  comments have no report action. Neither pending, running nor failed grading
  offers reporting. The same rules apply independently to either attempt,
  including its historical result after unpublish/archive under SYS-12.
- **LRN-07.2:** Activating the action opens “Report unmatched comment” with the
  selected read-only comment and line number, required field “Reason”, and
  “Send report” and “Cancel”. The form states “Explain why this comment identifies
  an issue missing from the answer key. Reporting does not change your grade.”
  It accepts only the selected comment's ID and the reason through the report
  contract; the Learner cannot select a different owner, flag kind or grade.
- **LRN-07.3:** Submitting an empty/whitespace-only reason shows “Enter a reason.”;
  otherwise a reason beyond the shared text bound shows “Reason is too long.”
  Normalization and bounds follow the contract. Validation leaves the form open
  with its entered text, sends no report and focuses “Reason”. “Cancel” closes
  the form without a report or grade change. Help text communicates the shared
  reason bound; it does not introduce a new one.
- **LRN-07.4:** Valid “Send report” changes to “Sending report…” and disables
  repeated submission, reason editing and “Cancel” while pending. Success closes
  the form, shows “Report sent. A TA can review this comment.” and replaces that
  comment's action with “Reported”. The returned flag appears through LRN-08's
  moderation display. Reporting changes neither the original nor effective
  grade, matching, comments or answer key and does not trigger regrading.
- **LRN-07.5:** A comment can be reported only once within its submission under
  the flags contract. Reload and reopening keep “Reported”, including after
  resolution; there is no edit, withdrawal or second-report action. If another
  tab reports the same comment first, a duplicate rejection shows “This comment
  has already been reported.” and refreshes the result to show “Reported” and
  the existing flag. A replay of the original successful request returns that
  same report, never an additional flag.
- **LRN-07.6:** An unknown request outcome shows “We couldn't confirm your report.
  Check report again.” with “Check report”. Retain the selected comment and
  submitted reason read-only; checking replays the same key and payload under
  the transport contract and shows “Checking report…” while pending. An
  in-progress replay shows “Your report is still being confirmed. Check again.”
  with the same check action. Confirmed success follows LRN-07.4; a definitive
  failure restores the form as below. Do not send a different report while
  uncertain. Reopening the result checks its stored flags before offering the
  action again.
- **LRN-07.7:** A definitive non-access service failure shows “We couldn't send
  your report. Try again.”; throttling shows “Too many requests. Try again later.”
  Retain the reason and restore “Send report” and editing. A new explicit send
  after a recorded failure follows the transport new-key rule. If the selected
  comment is no longer eligible or cannot be found, show “This comment isn't
  available for reporting.” and “Back to result”, which reloads the result
  without creating a report. An idempotency conflict shows “We couldn't reuse
  this report request. Refresh the result to check your reports.” with “Refresh
  result”, not an automatic new send. ACC-03 owns session and forbidden-record
  recovery; no report is replayed automatically after sign-in.

## Use cases

### UC-LRN-07-1 — Request moderation of a missed issue

**Actor:** Learner

**Preconditions:** Own completed attempt contains an unreported unmatched comment.

**Trigger:** Activate “Report unmatched comment” on that comment.

1. The Learner reads the selected evidence and enters a reason.
2. “Send report” validates the reason and shows pending state.
3. Success marks the comment “Reported” and shows its flag through LRN-08.
4. The Learner remains on the same result with the grade unchanged.

**Alternate paths:** “Cancel” leaves no report. A prior report or concurrent
duplicate follows LRN-07.5; unknown outcomes use the safe check in LRN-07.6.

**Failure paths:** Reason validation follows LRN-07.3; service, eligibility and
request conflicts follow LRN-07.7. Account failures follow ACC-03.

**Postconditions:** A successful report creates one immutable moderation flag for
that comment. TA-02 owns its resolution; LRN-08 owns subsequent outcome display.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Duplicate comment mistaken for an unmatched comment | LRN-07.1 offers no report action. |
| Same comment reported concurrently or after lost response | LRN-07.5–6 yields one report and a persistent “Reported” state. |
| Report on the second attempt | Same eligibility and per-submission uniqueness under LRN-07.1. |
| Existing report has been resolved | LRN-07.5 retains “Reported”; no second report. |
| Reason contains markup or exceeds the shared bound | SYS-02 inert display or LRN-07.3 validation; no execution or silent truncation. |

## UI notes

Associate “Reason” and its error, and focus it when the form opens. On cancellation
return focus to the comment's report action; on success focus its “Reported”
status. Announce pending and outcome notices under SYS-17. Keep the reported
comment visible while composing so the evidence is unambiguous. Grade correction
and resolution controls belong to TA stories and never appear in this form.
