# LRN-06 — Feedback, hints and retry

## Story

As a Learner, I want feedback, eligible hints and one retry so that I can learn from
missed flaws without seeing answers.

**Priority:** Must

**AI:** Yes

## Dependencies

- **Product:** [LRN-06 allocation](../PRODUCT-SPEC.md#learner),
  [hints and attempts](../PRODUCT-SPEC.md#hints-and-attempts) and
  [learning presentation](../PRODUCT-SPEC.md#7-non-functional-requirements).
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code)
  for inert feedback;
  [SYS-04](../TECHNICAL-SPEC.md#sys-04--shared-building-blocks) for retry source;
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures)
  and [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) for eligibility
  and private material;
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for reveal controls;
  [SYS-18](../TECHNICAL-SPEC.md#sys-18--resource-use) for safe AI results.
- **Security:** [SEC-01](../AI-SECURITY-SPEC.md#sec-01--authorize-and-minimize-model-access)
  and [SEC-02](../AI-SECURITY-SPEC.md#sec-02--validate-model-output-before-use) for
  authorized, validated output;
  [SEC-03](../AI-SECURITY-SPEC.md#sec-03--protect-learner-facing-hints-and-feedback)
  for learner-safe text and scoped hints;
  [SEC-04](../AI-SECURITY-SPEC.md#sec-04--bound-soc-requests-and-usage),
  [SEC-05](../AI-SECURITY-SPEC.md#sec-05--reserve-and-settle-usage-atomically) and
  [SEC-06](../AI-SECURITY-SPEC.md#sec-06--contain-failures-and-keep-diagnostics-safe)
  for bounded generation, quota-free cache reads and safe failure handling.
- **Contracts:** [Immutable published revisions](../INTEGRATION-SPEC.md#sys-12-decision-immutable-published-revisions),
  [code, proposals and locations](../INTEGRATION-SPEC.md#code-proposals-and-locations),
  [transport, concurrency and errors](../INTEGRATION-SPEC.md#transport-concurrency-and-errors),
  [shared response types](../INTEGRATION-SPEC.md#shared-response-types),
  [Learner surface](../INTEGRATION-SPEC.md#learner-surface),
  [assess_review](../INTEGRATION-SPEC.md#matched-comment-assessment-operation-assess_review)
  and [matching and score](../INTEGRATION-SPEC.md#matching-and-score) own pinned
  retry input, hint eligibility/order, feedback and credit meanings.
- **Related stories:** [LRN-05](LRN-05-grade-a-submitted-review.md) owns the result
  page and grading failures; [LRN-03](LRN-03-manage-line-comments.md) owns editing
  and local-draft rules; [LRN-04](LRN-04-submit-a-final-review.md) owns confirmation
  and submission recovery; [LRN-08](LRN-08-review-history.md) owns moderation;
  [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns access recovery.

## Acceptance criteria

- **LRN-06.1:** A completed original result has separate “Earned credit”,
  “Missed criteria” and “Next actions” sections. LRN-05.4–5 own the single
  display of components, statuses and credits; “Earned credit” adds each matched
  comment's “Feedback” alongside LRN-05.5's display. Text renders inert under
  SEC-02–SEC-03. Unmatched and duplicate comments have no generated feedback
  substituted for their null fields. Moderation does not rewrite this original
  feedback; LRN-08 displays its separate outcome.
- **LRN-06.2:** “Missed criteria” lists matched comments whose explanation or fix
  credit is below full credit, identifying “Explanation” and/or “Actionable fix”
  as applicable, separately from earned credit. It also lists missed flaws by
  the category labels in eligibleHints, grouping by category in product
  vocabulary order and showing each category's missed count. It exposes neither
  private flaw identities nor missing locations, snippets, explanations or fixes.
  With no partial/missing criteria, show “No missed criteria in this assessment.”
- **LRN-06.3:** For a category with unrevealed eligible hints, “Show hint” reveals
  exactly the next single hint for that category in contract order. During its
  read, that control shows “Loading hint…” and is disabled; already revealed
  hints stay visible. Success displays the approved plain text under that
  category. Further activations reveal one more until all are visible, then
  replace the control with “All hints shown”. No hint is fetched before an
  explicit reveal. With no missed flaws, show “No hints needed for missed flaws.”
  Reveal state is local to the result view; reopening starts collapsed and may
  read the same cached text again.
- **LRN-06.4:** A hint read failure shows “We couldn't load this hint. Try again.”
  with “Try again” for that same hint; it neither advances the reveal order nor
  exposes another hint as fallback. A no-longer-eligible or missing hint shows
  “This hint isn't available for this review.” and “Refresh result”, which
  reloads this result's eligibility. ACC-03 owns account failures. Hint reads
  use the cache, not new generation or Learner AI quota; they remain available
  on eligible completed history after unpublish/archive.
- **LRN-06.5:** “Next actions” offers “Retry challenge” only after the first
  attempt's completed original grade, while the challenge is published and no
  second attempt exists. Passing does not remove eligibility, and an override
  does not replace the completed-original prerequisite. The link opens
  `/learner/history/:submissionId/retry` using the first attempt ID. Before
  completion, show “Retry is available after your first assessment completes.”;
  with a second attempt, show “You have used your retry.”; otherwise when not
  published, show “Retry is unavailable while this challenge is not published.”
  Evaluate those conditions in that order. Every result also offers “Browse
  challenges” to `/learner/challenges` through LRN-05's result navigation.
- **LRN-06.6:** The retry URL rechecks eligibility before opening “Retry review”
  with challenge title and “Attempt 2”. It pins the first attempt's revision,
  even when a newer revision is published, and starts with editable copies of
  that attempt's comments in their original order. Copies have independent draft
  identity and retain relative addition order for LRN-03 sorting; they cannot
  change the first attempt. Reload discards edits and initializes fresh copies,
  never recovers a saved draft. Editing, bounds, leaving warnings, submission
  ordering, confirmation, zero-comment warning and request recovery reuse
  LRN-03/LRN-04. The request names the first attempt and its pinned revision;
  it does not switch to a newer revision. Success opens the new result in LRN-05.
- **LRN-06.7:** Retry entry shows “Loading retry…” while checking source and
  eligibility. A read failure shows “We couldn't load your retry. Try again.”
  with “Try again” at the same URL. An owned but ineligible entry shows “Retry
  unavailable”, the applicable LRN-06.5 reason, and “Back to result” to that
  attempt's result; a URL naming a second attempt instead states “A second
  attempt cannot be retried.” A missing submission uses LRN-05.7; forbidden
  access uses ACC-03. Eligibility lost after entry follows LRN-04 submission
  failures and preserves local work as specified there.

## Use cases

### UC-LRN-06-1 — Learn and make a second attempt

**Actor:** Learner

**Preconditions:** Own attempt has a completed original grade.

**Trigger:** Read its result's learning sections.

1. The Learner distinguishes earned credit, missed criteria and next actions.
2. The Learner reads comment-specific feedback and reveals missed-category hints
   one at a time.
3. If eligible, “Retry challenge” opens the pinned review with copied comments.
4. The Learner edits under LRN-03 and submits under LRN-04 to a separate result.

**Alternate paths:** A passed first attempt can still retry. An ineligible result
offers the stated explanation and catalogue navigation; historical hints remain
available under LRN-06.4.

**Failure paths:** Hint failures follow LRN-06.4; retry entry follows LRN-06.7;
submission failures follow LRN-04. Grading failure recovery remains in LRN-05.

**Postconditions:** Reveals do not alter grades. A submitted retry preserves both
attempts independently; abandoning it leaves the first attempt unchanged.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Several missed flaws share a category | LRN-06.2–3 shows the count and reveals one hint per activation. |
| First attempt passes or receives a TA override | LRN-06.5 still uses the completed original and retry existence. |
| New revision published before retry opens | LRN-06.6 uses the first attempt's code and comments. |
| Another tab submits the retry | Entry or submission rechecks eligibility under LRN-06.7/LRN-04. |
| Zero copied comments, or all copies removed | LRN-04's distinct empty-review confirmation applies. |

## UI notes

Keep the three learning sections visibly separate under the result. Associate
each hint control with its category and announce only the newly revealed text.
Keep focus on reveal/retry controls during pending reads under SYS-17. Retry
source uses the shared Learner view; “Back to result” leaves through LRN-03's
warning when draft copies or edits are present.

## AI behavior — AI stories only

- **Inputs:** Feedback uses the authorized pinned matches in assess_review;
  hint reads use the exact completed submission and eligible cached hint in the
  Learner contract. Learner reveal actions supply no new model instructions.
- **What the user sees:** Only approved, learner-safe hint/feedback text under
  SEC-02–SEC-03 and the shared response projection, presented by LRN-06.1–3.
  Private rationale is never substituted for feedback.
- **Failure and fallback:** Failed assessment follows LRN-05; failed cached reads
  follow LRN-06.4. No click generates a replacement hint or exposes private
  answers. SEC-06 owns safe diagnostics and absence of partial AI success.
- **Caching:** Product hints-and-attempts and SEC-03/SEC-05 own published hint
  reuse and exact submission/revision access. Reads do not regenerate text;
  retry receives eligibility from its own completed grade, not its predecessor's.
- **Limits:** Contract text bounds and SEC-04–SEC-05 govern the underlying AI
  operations. Assessment usage failures use LRN-05.6; cached reveals consume no
  provider quota and do not bypass SYS-12 eligibility.
