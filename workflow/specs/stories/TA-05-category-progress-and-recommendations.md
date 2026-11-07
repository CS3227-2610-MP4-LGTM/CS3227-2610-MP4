# TA-05 — Category progress and recommendations

## Story

As a TA, I want progress per flaw category and rule-based challenge
recommendations so that I can guide each learner's next practice.

**Priority:** Should

**AI:** No

## Dependencies

- **Product:** [TA-05 allocation](../PRODUCT-SPEC.md#ta),
  [first-attempt evidence](../PRODUCT-SPEC.md#hints-and-attempts),
  [recommendations](../PRODUCT-SPEC.md#recommendations) and
  [category labels](../PRODUCT-SPEC.md#shared-vocabularies).
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code),
  [SYS-04](../TECHNICAL-SPEC.md#sys-04--shared-building-blocks),
  [SYS-08](../TECHNICAL-SPEC.md#sys-08--authorization-at-the-data-boundary),
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures),
  [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) and
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for protected historical
  evidence, shared views and accessible presentation.
- **Security:** None; category aggregation and recommendations are deterministic
  reads and make no AI request.
- **Contracts:** [Shared values](../INTEGRATION-SPEC.md#shared-values-and-bounds),
  [transport/errors](../INTEGRATION-SPEC.md#transport-concurrency-and-errors),
  [ChallengeCard](../INTEGRATION-SPEC.md#shared-response-types),
  [TA surface](../INTEGRATION-SPEC.md#ta-surface) and
  [category progress and recommendations](../INTEGRATION-SPEC.md#category-progress-and-recommendations).
- **Related stories:** [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns
  access recovery; [TA-04](TA-04-learner-performance-summary.md) owns the learner
  list/detail shell and separate AI summary; [TA-01](TA-01-inspect-submissions.md)
  owns supporting submissions. Challenge browsing/review remains allocated to
  the Learner stories in [PRODUCT-SPEC](../PRODUCT-SPEC.md#learner).

## Acceptance criteria

- **TA-05.1:** Given a permitted learner detail at `/ta/learners/:learnerId`,
  show “Category progress” with one row for each shared category in contract
  order. Columns are “Category”, “Identified flaws”, “Total flaws”,
  “Identification rate” and “Completed first attempts”. Counts and rates come
  from CategoryProgress. Display a nonnull rate as a percentage with two decimal
  places; null shows “Not observed”, never zero percent. Include “Progress uses
  completed first attempts. Retries and grade overrides do not change these
  identification counts.”
- **TA-05.2:** Progress includes completed first attempts across all retained
  history, including unpublished/archived challenges, using original matching
  evidence per the contract. Failed/pending/running grading and second attempts
  contribute no progress. Score-only overrides affect neither category counts
  nor rates. Zero identified flaws with positive total shows `0.00%`; zero total
  shows “Not observed”. If all categories are unobserved, retain the five rows
  and show “No completed first-attempt category evidence yet.”
- **TA-05.3:** “Recommended challenges” shows up to the shared default
  recommendation count using the contract's weakest-category selection,
  eligibility and deterministic ordering. Each item displays “Challenge”,
  “Language”, “Difficulty” and “Practice categories” from ChallengeCard and
  targetCategories. State “Rule-based recommendations from observed category
  progress.” Only categories actually targeted by that recommendation appear
  under “Practice categories”; the UI does not recalculate selection from
  display-rounded percentages or ask AI to rank candidates.
- **TA-05.4:** Any prior attempt on a challenge, regardless of attempt state or
  revision, excludes it from recommendations. Only live published candidates
  are eligible. A partial result shows the returned items without padding or
  duplicates. With no items show “No eligible recommendations right now.” and
  “View submissions”; unobserved categories are not labelled weaknesses. A
  recommendation is advice only: no practice is assigned, attempt created or
  challenge changed. Cards expose no Learner-only review action to the TA.
- **TA-05.5:** Both sections load on learner entry without a generation action.
  Show “Loading category progress…” and “Loading recommendations…” independently.
  “Refresh progress and recommendations” rereads both without generating an AI
  summary. On refresh, replace a section only with its successful response; a
  failed refresh retains previous content labelled “Previously loaded progress”
  or “Previously loaded recommendations”. While refreshing, disable that refresh
  control. Current eligibility and ordering are recomputed on each read, so
  later attempts, publications, unpublishing or archiving affect refreshed results.
- **TA-05.6:** Progress failure shows “We couldn't load category progress. Try
  again.” with a section-local “Try again”. Recommendation failure shows “We
  couldn't load recommendations. Try again.” with its own “Try again”. One
  section's failure does not hide the other's successful result or TA-04's
  summary. Failure never becomes zero progress, an unobserved category or an
  empty recommendation result. No partial/default data is labelled current.
- **TA-05.7:** “View submissions” opens TA-01's learner-filtered list, where
  supporting attempts can be inspected and “Back to learner” returns to this
  detail. “Back to learners” follows TA-04. Missing learner, session, role and
  forbidden-record outcomes use TA-04/ACC-03; no read reveals emails or another
  role's protected data, and no failed access starts an AI call or mutation.

## Use cases

### UC-TA-05-1 — Guide the next practice

**Actor:** TA

**Preconditions:** Usable signed-in TA account; a learner exists in scope.

**Trigger:** Open learner detail through TA-04.

1. The TA reads each category's counts, observed rate and eligible attempt count.
2. The TA reviews the rule-based recommendations and their practice categories.
3. The TA uses “View submissions” to inspect supporting attempts through TA-01.
4. The TA returns to learner detail and may refresh the deterministic guidance.
5. The TA uses the evidence and advice to guide the learner without assigning or
   starting a practice attempt in the app.

**Alternate paths:** No observations retain all category rows under TA-05.2;
no eligible challenges shows TA-05.4. AI advice remains TA-04's separate action.

**Failure paths:** Independent loading/read recovery follows TA-05.5–6;
learner/access and supporting-submission failures follow TA-05.7 and TA-01.

**Postconditions:** The TA sees evidence-based practice guidance; no grade,
submission, challenge or AI summary is changed by these reads.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Only second-attempt grading completes | TA-05.2 does not infer first-attempt progress. |
| Categories tie before display rounding | TA-05.3 follows contract tie-breaking, not UI percentages. |
| Weakest category has no live unattempted challenge | TA-05.3–4 follows the contract without inventing fallback categories. |
| Challenge was attempted on an older revision | TA-05.4 excludes every revision of that challenge. |
| Challenge is unpublished after a recommendation read | TA-05.5 removes it on refresh without creating an attempt. |
| AI summary fails or is stale | TA-05.5–6 retains independent deterministic guidance. |

## UI notes

Keep category progress and rule-based recommendations visually distinct from
TA-04's AI advice. Explain “Not observed” beside the table and use counts/text
rather than colour alone. Under SYS-17, use labelled sections, section-specific
loading/error announcements and keyboard-accessible recovery links. At phone
width, stack category rows and recommendation cards with their labels intact.
