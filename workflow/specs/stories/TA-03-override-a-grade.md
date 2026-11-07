# TA-03 — Override a grade

## Story

As a TA, I want to override a grade with a justification so that I can correct an
assessment transparently.

**Priority:** Must

**AI:** No

## Dependencies

- **Product:** [TA-03 allocation](../PRODUCT-SPEC.md#ta),
  [grading](../PRODUCT-SPEC.md#grading) and
  [moderation flags](../PRODUCT-SPEC.md#moderation-flags).
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code),
  [SYS-08](../TECHNICAL-SPEC.md#sys-08--authorization-at-the-data-boundary),
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures),
  [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) and
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for validation,
  authorization, immutable originals, attributable audit and accessible forms.
- **Security:** None; a human override starts no AI operation.
- **Contracts:** [Shared bounds](../INTEGRATION-SPEC.md#shared-values-and-bounds),
  [transport and idempotency](../INTEGRATION-SPEC.md#transport-concurrency-and-errors),
  [GradingView](../INTEGRATION-SPEC.md#shared-response-types),
  [TA surface](../INTEGRATION-SPEC.md#ta-surface),
  [audit order](../INTEGRATION-SPEC.md#2-domain-model-and-publication-lifecycle)
  and [effective scoring](../INTEGRATION-SPEC.md#matching-and-score).
- **Related stories:** [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns
  access recovery; [TA-01](TA-01-inspect-submissions.md) owns original evidence;
  [TA-02](TA-02-resolve-flagged-submissions.md) separately owns flag decisions.

## Acceptance criteria

- **TA-03.1:** On TA-01 detail with completed grading, “Override grade” opens a
  form headed “Override grade” with required “Replacement score” and “Reason”.
  Show the original and current grade beside the form, state “Scores are out of
  100. A reason is required and will be visible to the learner.”, and offer
  “Save override” and “Cancel”. Open with empty fields so a new decision requires
  explicit input. Cancel closes the form without writes.
- **TA-03.2:** Blank score shows “Enter a replacement score.” A noninteger or
  score outside the override contract's range shows “Enter a whole number from
  0 to 100.” Blank/whitespace-only reason shows “Enter a reason.” An oversized
  reason shows “Reason exceeds the allowed length.” using the shared
  moderation-reason bound. Invalid input retains both fields, associates errors
  with inputs and saves nothing. The server applies the same validation.
- **TA-03.3:** While saving, show “Saving override…” and disable repeat submit.
  Success closes the form, shows “Grade override saved.” and updates “Current
  grade” from returned GradingView: effective score out of 100, “Passed” or “Not
  passed” using the shared pass mark, and source “TA override”. The saved reason
  appears in history. Original score, component points, comment credits, feedback,
  matching and hints remain unchanged. The Learner's effective grade reflects
  the same result under SYS-12.
- **TA-03.4:** “Override history” shows every entry oldest to newest by server
  auditOrder with “TA”, “Recorded”, “Replacement score” and “Reason”. Show verified
  actor ID, date/time/timezone and full inert reason. Identify the latest as
  “Current override”; timestamp ties follow server order. With none show “No TA
  overrides. The current grade is the original assessment.” Corrections use
  “Override grade” again and append; no edit/delete control is available. A
  replacement equal to the current score remains a valid attributable decision.
- **TA-03.5:** Pending, running or failed grading offers no enabled override
  form and states “A completed assessment is required before overriding a grade.”
  A direct/in-flight save rejected for grading state shows that same message
  and “Refresh submission”, preserves entered text for review, and creates no
  override. A TA cannot use an override to manufacture an original assessment.
- **TA-03.6:** A failed save shows “We couldn't save this override. Try again.”
  and retains input with “Try again”. Retrying an uncertain result follows the
  shared idempotency contract and cannot duplicate that action. Distinct
  concurrent overrides both remain visible; the latest server-ordered entry
  determines current grade, even if timestamps tie or response order differs.
  “Refresh submission” rereads current grade/history without replaying the save.
- **TA-03.7:** Saving an override does not resolve, delete or regenerate a flag,
  change the published key, regrade another attempt or alter category
  identification evidence. To resolve a flag the TA uses TA-02 separately.
  Historical completed submissions remain eligible after editing, unpublishing
  or archiving their challenge under SYS-12.
- **TA-03.8:** Missing submissions and read failures use TA-01. Session, role and
  record-access failures follow ACC-03; they create no override and never
  automatically replay after recovery. Client-supplied actor/time/order cannot
  change attribution under SYS-12. A failed save never shows success or changes
  the displayed grade to an unsaved input.

## Use cases

### UC-TA-03-1 — Correct an effective grade

**Actor:** TA

**Preconditions:** Usable signed-in TA account; a completed submission is in scope.

**Trigger:** After inspecting TA-01 evidence, activate “Override grade”.

1. The TA reads the original/current assessment and existing overrides.
2. The TA enters a replacement score and a reason.
3. “Save override” records an attributable append-only decision.
4. The detail shows the new effective grade and retained original/history.
5. The TA returns to the list or separately resolves a flag through TA-02.

**Alternate paths:** Cancel leaves the grade unchanged. A later correction or
same-score decision follows TA-03.4. Incomplete grading follows TA-03.5.

**Failure paths:** Invalid fields follow TA-03.2; failed/uncertain saving follows
TA-03.6; access recovery follows TA-03.8.

**Postconditions:** Success changes only effective grade and appends its audit
entry. Failure leaves committed grades and history intact.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Replacement is zero or the upper bound | Accepted under TA-03.2, displayed as a completed score. |
| Fractional score or whitespace-only reason | TA-03.2 rejects without an audit entry. |
| Two TAs save different replacements | TA-03.6 retains both and uses server ordering. |
| Override changes pass/fail | TA-03.3 uses the shared mark without rewriting original credits. |
| A response is lost after saving | TA-03.6 replay returns the existing action. |

## UI notes

Keep “Original assessment”, “Current grade” and “Override history” distinct. Use
numeric score guidance and labelled multiline plain-text reason input. Focus the
first invalid field, announce save state/result and return focus to “Current
grade” after success or “Override grade” after cancel. SYS-17 governs keyboard,
contrast and phone-width presentation; TA-01/SYS-04 own evidence display.
