# AUT-05 — Publish a challenge

## Story

As an Author, I want to publish an approved challenge with its generated hints
ready so that Learners can practise it.

**Priority:** Must

**AI:** Yes

## Dependencies

- **Product:** [AUT-05 allocation](../PRODUCT-SPEC.md#author),
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
  [SYS-03](../TECHNICAL-SPEC.md#sys-03--llm-boundary) and
  [SYS-18](../TECHNICAL-SPEC.md#sys-18--resource-use) govern AI operations.
- **Security:** [SEC-01](../AI-SECURITY-SPEC.md#sec-01--authorize-and-minimize-model-access),
  [SEC-02](../AI-SECURITY-SPEC.md#sec-02--validate-model-output-before-use),
  [SEC-03](../AI-SECURITY-SPEC.md#sec-03--protect-learner-facing-hints-and-feedback),
  [SEC-04](../AI-SECURITY-SPEC.md#sec-04--bound-soc-requests-and-usage),
  [SEC-05](../AI-SECURITY-SPEC.md#sec-05--reserve-and-settle-usage-atomically),
  [SEC-06](../AI-SECURITY-SPEC.md#sec-06--contain-failures-and-keep-diagnostics-safe).
- **Contracts:** [shared bounds](../INTEGRATION-SPEC.md#shared-values-and-bounds),
  [code cap](../INTEGRATION-SPEC.md#pasted-code-cap),
  [publication lifecycle](../INTEGRATION-SPEC.md#sys-12-decision-immutable-published-revisions),
  [transport, concurrency and errors](../INTEGRATION-SPEC.md#transport-concurrency-and-errors)
  and [Author surface](../INTEGRATION-SPEC.md#author-surface).
  [Publication hint schema](../INTEGRATION-SPEC.md#publication-hints-operation-generate_hints).
- **Related stories:** [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns
  account, session and access-failure presentation. Author journey:
  [AUT-01](AUT-01-create-a-draft.md),
  [AUT-02](AUT-02-configure-flaws.md),
  [AUT-03](AUT-03-generate-flaw-proposals.md),
  [AUT-04](AUT-04-preview-and-decide-flaws.md),
  [AUT-06](AUT-06-maintain-challenges.md).

## Acceptance criteria

- **AUT-05.1:** Given an own editable draft with current proposals, all decisions
  saved and at least one approval, “Publish challenge” follows the final preview
  under AUT-04. Missing/stale proposals, pending decisions, no approvals or invalid
  assembled code/key prevent publication with “Review the current proposals and
  approve at least one flaw before publishing.” and “Back to proposal preview”.
- **AUT-05.2:** An eligible explicit publication shows “Preparing hints and
  publishing…” and prevents duplicate publication. Hints are generated for the
  complete approved candidate only, one per retained flaw. Every hint must pass
  the hint contract and SEC-03 checks before publication can succeed. Rejected
  flaws contribute no code change, key entry or hint.
- **AUT-05.3:** Success shows “Challenge published.” on “Publication result”, with
  revision number, publication time, “View published challenge” and “Back to
  challenges”. The new revision becomes discoverable to Learners only together
  with its complete key and hints under the atomic publication contract. The
  owning Author can inspect the published real diff, retained answers and hints;
  learner visibility remains governed by SYS-12, not by the Author preview.
- **AUT-05.4:** Invalid hint output after permitted retries shows “The AI returned
  invalid hints. The challenge wasn't published.” Timeout shows “Publication timed
  out. Check publication before trying again.” Provider/accounting unavailability
  shows “We couldn't publish the challenge right now.” Limit/admission failure
  shows “Publication is unavailable within the current AI limits. Try again later.”
  Oversized model input shows “This candidate is too large for AI publication.”
  None creates a partial revision or replaces the existing publication. Retain
  saved inputs/decisions and offer “Back to proposal preview”.
- **AUT-05.5:** An uncertain outcome offers “Check publication”, resolving the same
  operation under shared idempotency before another publication is attempted. A
  confirmed failure offers explicit “Try publishing again”, subject to current
  eligibility and shared new-attempt rules. Replaying a completed action returns
  the same publication; it does not generate hints or another revision again.
- **AUT-05.6:** If the draft, decisions or lifecycle state changes before completion,
  the stale candidate cannot publish. Show “This challenge changed. Reload it before
  publishing.” with “Reload draft”. Old live revisions and historical submissions
  remain intact. Account/access failures use ACC-03 without automatic replay.
- **AUT-05.7:** Publishing an edited or unpublished challenge creates a new immutable
  revision, with fresh complete hints for that candidate, and switches the live
  revision only on success. It does not alter past code, keys, hints, grades or
  attempt counts. Archived challenges cannot publish, under AUT-06.

## Use cases

### UC-AUT-05-1 — Make a complete exercise available

**Actor:** Author

**Preconditions:** Own current draft passes AUT-04's final-preview conditions.

**Trigger:** Choose “Publish challenge”.

1. Review the approved candidate and explicitly publish.
2. Wait while validated hints are prepared and publication completes.
3. Read the publication result and inspect the published revision or return to list.

**Alternate paths:** An edited/unpublished challenge follows AUT-05.7; return to
preview to revise decisions before starting publication.

**Failure paths:** Hint/provider/limit failures follow AUT-05.4; uncertain outcomes
use AUT-05.5; concurrent edits use AUT-05.6; account/access uses ACC-03.

**Postconditions:** Success exposes one complete immutable revision. Failure
preserves all committed publication/history data and creates no partial revision.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Hint has a foreign/missing/duplicate key | AUT-05.2/4 rejects the entire result. |
| Hint is schema-valid but reveals protected text or a line | SEC-03 rejects it before publication under AUT-05.2/4. |
| One required hint cannot be generated | No partial publication under AUT-05.4. |
| Response is lost after successful publication | AUT-05.5 resolves the existing revision without regenerating hints. |
| Draft changes or archive wins during generation | AUT-05.6 prevents the late publication. |
| A learner has an attempt pinned to an older revision | AUT-05.7 preserves its evidence and eligible hint cache. |

## UI notes

Keep a retained-flaw summary and a clear publication action beside the final
preview. Label publication as pending until committed, and distinguish pending
from failure and success. SYS-04 supplies the published code/diff view. Under
SYS-17 announce status and focus the publication-result heading on success;
recovery controls remain usable at phone width and by keyboard.

## AI behavior

- **Inputs:** Only the complete retained candidate in the
  [hint input contract](../INTEGRATION-SPEC.md#publication-hints-operation-generate_hints).
  SEC-01 restricts the snapshot and keeps all source/model text as untrusted data.
- **What the user sees:** The Author sees completion and authorized published
  hints under AUT-05.3. Learner hint release belongs to LRN-06 and SYS-12.
  Hint safety and validation belong to SEC-02/SEC-03; AI cannot publish by itself.
- **Failure and fallback:** AUT-05.4–6; SEC-05 permits only its bounded invalid-output
  retry. No placeholder hints, partial publication or fabricated fallback.
- **Caching:** Generate the whole publication cache once per new revision, never
  per Learner. Reads/replays reuse stored immutable hints with SYS-12 access rules.
  Changed decisions invalidate uncommitted hints; new publication follows the
  [revision lifecycle](../INTEGRATION-SPEC.md#sys-12-decision-immutable-published-revisions).
- **Limits:** Shared input/output bounds and SEC-04/SEC-05 govern admission,
  usage, deadlines, retries and concurrency; AUT-05.4 presents rejected operations.
  SEC-06 preserves committed data and excludes private diagnostics from errors.
