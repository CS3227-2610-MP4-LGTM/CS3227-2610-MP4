# LRN-04 — Submit a final review

## Story

As a Learner, I want to submit a final review that locks its comments so that my
assessment is based on a fixed attempt.

**Priority:** Must

**AI:** No

## Dependencies

- **Product:** [LRN-04 allocation](../PRODUCT-SPEC.md#learner) and
  [hints and attempts](../PRODUCT-SPEC.md#hints-and-attempts).
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code)
  for validation;
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures)
  for access failures;
  [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) for immutable own
  submissions;
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for confirmation.
- **Security:** No SEC dependency; creating the fixed submission is separate from
  LRN-05's AI grading operation.
- **Contracts:** [Shared values and bounds](../INTEGRATION-SPEC.md#shared-values-and-bounds)
  and [pasted-code cap](../INTEGRATION-SPEC.md#pasted-code-cap) for comments and
  the request body limit;
  [immutable published revisions](../INTEGRATION-SPEC.md#sys-12-decision-immutable-published-revisions)
  for attempt eligibility and races;
  [transport, concurrency and errors](../INTEGRATION-SPEC.md#transport-concurrency-and-errors)
  for idempotency and failure categories;
  [shared response types](../INTEGRATION-SPEC.md#shared-response-types) and
  [Learner surface](../INTEGRATION-SPEC.md#learner-surface) for submission creation.
- **Related stories:** [LRN-03](LRN-03-manage-line-comments.md) owns the draft,
  validation and ordering; [LRN-05](LRN-05-grade-a-submitted-review.md) owns the
  destination and grading; [LRN-06](LRN-06-feedback-hints-and-retry.md) owns retry
  eligibility and its pinned input; [LRN-08](LRN-08-review-history.md) owns history;
  [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns account recovery.

## Acceptance criteria

- **LRN-04.1:** With no open comment editor, “Submit review” opens confirmation
  headed “Submit review?” showing the comment count and “Submitted comments
  cannot be changed.” Actions are “Keep reviewing” and “Confirm submission”.
  Zero comments is valid but adds the distinct warning “You haven't added any
  comments. Submit an empty review?”. “Keep reviewing” closes confirmation with
  the draft intact. Opening or cancelling confirmation creates no attempt.
- **LRN-04.2:** “Confirm submission” fixes the opened revision and
  LRN-03-ordered comment payload for this request, changes to “Submitting
  review…” and disables repeat confirmation, “Keep reviewing” and draft editing
  while pending. Retry submissions use LRN-06's previous-attempt reference and
  revision. No submitted actor, grade or client-assigned comment identities are
  accepted in place of the contract.
- **LRN-04.3:** Confirmed creation makes the submitted comments read-only and
  opens `/learner/history/:submissionId` for the returned submission. This
  transition does not show the unsaved-draft warning; the work is now submitted.
  Submission success is not grading success: LRN-05 displays the returned state
  and starts grading. Repeated activations/replays create no extra attempt under
  the transport contract.
- **LRN-04.4:** An interrupted connection or otherwise unknown creation outcome
  shows “We couldn't confirm submission. Check submission again before changing
  your review.” with “Check submission” and “Review history” to `/learner/history`.
  Keep the exact submitted snapshot visible and read-only while uncertain.
  “Check submission” safely replays the same request with the same idempotency
  key and payload; it shows “Checking submission…” while pending. An in-progress
  replay shows “Submission is still being confirmed. Check again.” and restores
  “Check submission”. A recorded success follows LRN-04.3; a definitive rejection
  follows the applicable failure below. Do not generate a new key, change the
  payload or claim failure while this outcome remains unknown. Leaving
  follows LRN-03's local-draft rules; history remains the recovery after
  page memory is lost.
- **LRN-04.5:** Definitive creation failures leave the draft visible, restore
  draft editing, create no new attempt and close confirmation. The following
  outcomes apply.

  | Condition | Message / recovery |
  | --- | --- |
  | First-attempt revision is no longer the live revision | “This challenge changed since you opened it. Your review has not been submitted.” Keep the opened code and editable draft; disable submission for that stale revision. “Back to challenges” opens `/learner/challenges` through LRN-03's leaving warning. Never switch code or transfer comments automatically. |
  | Challenge is no longer published or is archived | “This challenge is no longer available for submission.” Keep the draft visible; disable submission and offer “Back to challenges”. |
  | Attempt allowance is exhausted or this attempt is no longer eligible | “You can't submit another attempt for this challenge.” Keep the draft visible; disable submission and offer “Review history”. |
  | Review exceeds the shared UTF-8 JSON request body limit | “This review is too large to submit. Shorten or remove comments and try again.” Restore editing and “Submit review”; keep all text without truncation. |
  | Invalid comment input | Apply LRN-03's field validation; retain text and restore editing. |

- **LRN-04.6:** Other definitive service failures show “We couldn't submit your
  review. Try again.”; throttling shows “Too many requests. Try again later.”
  Retain the editable draft and re-enable “Submit review”. An explicit attempt
  after a recorded failure uses the transport contract's new-key rule. An
  idempotency conflict keeps the snapshot read-only and shows “This submission
  request couldn't be reused. Open Review history to check your attempts.” with
  “Review history”, without an automatic replacement request. Account failures
  follow ACC-03, including loss of local drafts on unrefreshable expiry.

## Use cases

### UC-LRN-04-1 — Finalize an attempt

**Actor:** Learner

**Preconditions:** Editable review prepared under LRN-03, with an eligible first
attempt or LRN-06 retry; all comment editors closed.

**Trigger:** Activate “Submit review”.

1. The Learner inspects the count, immutability notice and any empty-review warning.
2. “Confirm submission” locks the request while it is pending.
3. Confirmed creation opens the returned attempt's result page for LRN-05.

**Alternate paths:** “Keep reviewing” preserves editing. An uncertain outcome uses
LRN-04.4's same-request check rather than another attempt.

**Failure paths:** Revision, lifecycle, eligibility, size and validation failures
follow LRN-04.5; other failures follow LRN-04.6. ACC-03 owns session recovery.

**Postconditions:** Success leaves one immutable submission with its pinned code;
failure retains local work where the session permits. Unknown outcome remains
explicitly uncertain until a safe replay or history read establishes it.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Empty review confirmed | LRN-04.1 warning; normal submission and grading, not a fabricated score. |
| Double confirmation or lost success response | LRN-04.2–4 and contract idempotency return one submission. |
| Publish/unpublish races with confirmation | Contract serialization determines success or LRN-04.5; no silent revision change. |
| Individually valid comments exceed the serialized body cap | LRN-04.5 size recovery preserves every comment. |
| Another tab consumes the remaining attempt | LRN-04.5 eligibility failure offers history. |

## UI notes

Focus confirmation on entry and return focus to “Submit review” on cancellation.
Associate the zero-comment warning with confirmation. Announce pending, uncertain
and failed outcomes under SYS-17; never relabel an uncertain outcome as “Not
submitted”. Keep the frozen snapshot readable during checking. All draft
departures use LRN-03; all result destinations use LRN-05.
