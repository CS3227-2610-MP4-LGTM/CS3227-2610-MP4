# LRN-05 — Grade a submitted review

## Story

As a Learner, I want my submitted review graded using location matching and AI
assessment so that I can measure my review quality.

**Priority:** Must

**AI:** Yes

## Dependencies

- **Product:** [LRN-05 allocation](../PRODUCT-SPEC.md#learner),
  [grading](../PRODUCT-SPEC.md#grading) and
  [learning presentation](../PRODUCT-SPEC.md#7-non-functional-requirements).
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code)
  for inert text;
  [SYS-04](../TECHNICAL-SPEC.md#sys-04--shared-building-blocks) for code;
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures)
  and [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) for own results;
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for state announcements;
  [SYS-18](../TECHNICAL-SPEC.md#sys-18--resource-use) for grading integrity.
- **Security:** [SEC-01](../AI-SECURITY-SPEC.md#sec-01--authorize-and-minimize-model-access)
  for authorized inputs;
  [SEC-02](../AI-SECURITY-SPEC.md#sec-02--validate-model-output-before-use) for output;
  [SEC-03](../AI-SECURITY-SPEC.md#sec-03--protect-learner-facing-hints-and-feedback)
  for safe feedback;
  [SEC-04](../AI-SECURITY-SPEC.md#sec-04--bound-soc-requests-and-usage),
  [SEC-05](../AI-SECURITY-SPEC.md#sec-05--reserve-and-settle-usage-atomically) and
  [SEC-06](../AI-SECURITY-SPEC.md#sec-06--contain-failures-and-keep-diagnostics-safe)
  for usage, retries and safe failures.
- **Contracts:** [Transport, concurrency and errors](../INTEGRATION-SPEC.md#transport-concurrency-and-errors),
  [shared response types](../INTEGRATION-SPEC.md#shared-response-types),
  [Learner surface](../INTEGRATION-SPEC.md#learner-surface),
  [assess_review](../INTEGRATION-SPEC.md#matched-comment-assessment-operation-assess_review)
  and [matching and score](../INTEGRATION-SPEC.md#matching-and-score) own request,
  grade, matching, credit, formula, rounding and pass-mark definitions.
- **Related stories:** [LRN-04](LRN-04-submit-a-final-review.md) owns submission;
  [LRN-06](LRN-06-feedback-hints-and-retry.md) owns learning actions;
  [LRN-07](LRN-07-report-an-unmatched-comment.md) owns reporting;
  [LRN-08](LRN-08-review-history.md) owns all moderation display;
  [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns access recovery.

## Acceptance criteria

- **LRN-05.1:** `/learner/history/:submissionId` opens only the Learner's own
  attempt. It shows “Review result”, challenge title, “Attempt” with its number,
  “Submitted” with its time, read-only submitted comments and the pinned
  Learner-projected code/diff. “Review history” leads to `/learner/history` and
  “Browse challenges” to `/learner/challenges`. Historical source uses the shared
  view and projection linked by LRN-02, not the current live revision.
- **LRN-05.2:** Opening a submission with grading pending automatically starts
  its grading operation and shows “Grading pending”; running shows “Grading your
  review…”. The page refreshes grading state without a manual reload until a
  completed or failed state is observed. Reopening a running submission observes
  that operation rather than starting another; reopening a completed submission
  displays its existing result. Pending/running states show no score, pass/fail
  or zero placeholder and keep submitted evidence read-only.
- **LRN-05.3:** A failed grade shows “Grading failed. Your review is still
  saved.” and LRN-05.6's message, with “Retry grading” unless excluded there.
  Reopening a failed result never retries automatically. “Retry grading” shows
  “Retrying grading…” and is disabled while pending; it grades the same
  submission, not another Learner attempt. Success displays the completed
  result; another failure keeps the submission and applicable recovery. Check
  uncertain outcomes on the same submission under the transport replay rule
  before a new explicit grading operation.
- **LRN-05.4:** Completed original grading shows “Original assessment” with
  “Score” as `<score> / 100`, “Pass mark”, and “Passed” or “Not passed”.
  “Component points” lists “Identification”, “Explanation” and “Actionable fix”
  using the contract's display rounding; “Matched flaws” and “Missed flaws” show
  the returned counts. Values follow the grading contract. Display components,
  statuses and credits once. LRN-08 owns the effective-grade presentation and
  any distinction from this preserved original assessment.
- **LRN-05.5:** Every submitted comment has exactly one visible status:
  “Matched”, “Unmatched” or “Duplicate”, using the contract's selection and ID
  lists. Matched comments show “Explanation credit” and “Fix credit” with their
  returned values. Unmatched and duplicate comments show “No credit” and a dash
  for each null credit, never a fabricated AI assessment. A duplicate states
  “Another comment already counts for this flaw.” An unmatched comment states
  “No flaw matched this comment's location.” No private flaw location, ID,
  explanation or fix appears. LRN-06 owns feedback text and learning actions.
- **LRN-05.6:** Grading failures use these messages and retain submissions
  without invented scores. AI input-limit failures offer no “Retry grading”;
  other failures use LRN-05.3 recovery.

  | Outcome | Message |
  | --- | --- |
  | Usage or concurrency capacity exhausted | “Grading usage limit reached. Try grading again later.” |
  | Input exceeds the effective AI input limit | “This review is too large for grading. Your submitted review is saved.” |
  | Invalid output after permitted provider retries | “We couldn't produce a valid assessment. Try grading again.” |
  | Provider unavailable | “AI grading is unavailable. Try grading again.” |
  | Timeout | “Grading timed out. Try grading again.” |
  | Other grading-service/accounting failure | “Grading is unavailable. Try grading again later.” |

- **LRN-05.7:** Loading result data shows “Loading review result…”. A result-read
  failure shows “We couldn't load this review result. Try again.” with “Try
  again”, which rechecks the same submission without blindly starting grading.
  A state-update read failure keeps the last known state with “We couldn't
  update grading status.” and “Check status”; checking resumes state observation.
  It is not a failed grade. A missing submission shows “Review not found” and
  “We couldn't find this review.” with “Review history”. Forbidden records and
  account failures follow ACC-03 without displaying submission content.

## Use cases

### UC-LRN-05-1 — Receive and recover an assessment

**Actor:** Learner

**Preconditions:** Own immutable submission exists.

**Trigger:** Arrive from LRN-04 or open an attempt result.

1. The page loads the attempt and observes its grading state.
2. Pending grading starts automatically; running grading updates on the page.
3. A completed grade shows the original score, components and comment statuses.
4. The Learner continues to LRN-06 learning actions or LRN-08 history.

**Alternate paths:** Existing completion is reused. Eligible failed grades offer
an explicit “Retry grading” on the same evidence under LRN-05.3.

**Failure paths:** Usage/provider failures follow LRN-05.6; read failures follow
LRN-05.7. Authentication and record denial follow ACC-03.

**Postconditions:** Completion preserves one original grade; failure leaves no
successful or partial original grade and does not consume another challenge attempt.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| No matches, including an empty review | Contract grading completes without a provider call; show its actual result under LRN-05.4. |
| Multiple comments eligible for one flaw | LRN-05.5 distinguishes selected, duplicate and unmatched comments by contract. |
| Grade completes while another result tab is open | LRN-05.2 observes the same original, without duplicate grading. |
| Status cannot be read after a grade request | LRN-05.7 preserves uncertainty, not a zero or failed-grade assertion. |
| Challenge later unpublished or archived | LRN-08 preserves historical access; the result uses pinned evidence. |

## UI notes

Announce state transitions under SYS-17 without repeatedly moving focus during
updates. Keep submitted evidence available beside the assessment. Score and
pass/fail use text, not colour alone. LRN-06 adds feedback alongside LRN-05's
single credit display; LRN-08's current grade and moderation have separate
headings. All returned text is inert.

## AI behavior — AI stories only

- **Inputs:** The server selects only the authorized pinned matches in
  [assess_review](../INTEGRATION-SPEC.md#matched-comment-assessment-operation-assess_review)
  under SEC-01; the Learner cannot choose the model, matching or private context.
- **What the user sees:** Validated credits and safe feedback feed the original
  assessment under SEC-02–SEC-03; the server's matching/score contract controls
  the grade. Feedback presentation belongs to LRN-06.
- **Failure and fallback:** LRN-05.2–3 and LRN-05.6 distinguish pending, failure
  and completion. SEC-05 owns permitted automatic output retries; SEC-06 forbids
  partial success or raw provider diagnostics. No fallback assessment is invented.
- **Caching:** Reuse the persisted original for this submission under SYS-12 and
  the Learner grading contract; no grade is shared across Learners or attempts.
  Grading retry cannot replace an existing original.
- **Limits:** SEC-04–SEC-05 own input/output, usage, concurrency, deadlines and
  provider retry ceilings; shared contract bounds still apply. LRN-05.6 displays
  denial categories without promising a reset time absent from the response.
