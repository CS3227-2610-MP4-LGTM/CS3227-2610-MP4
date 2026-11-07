# TA-04 — Learner performance summary

## Story

As a TA, I want an AI learner performance summary of recurring strengths and blind
spots so that I can focus my support.

**Priority:** Must

**AI:** Yes

## Dependencies

- **Product:** [TA-04 allocation](../PRODUCT-SPEC.md#ta),
  [TA navigation](../PRODUCT-SPEC.md#5-navigation-and-ui) and
  [shared categories](../PRODUCT-SPEC.md#shared-vocabularies).
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code)
  for inert text; [SYS-03](../TECHNICAL-SPEC.md#sys-03--llm-boundary)
  for validated server-only generation;
  [SYS-08](../TECHNICAL-SPEC.md#sys-08--authorization-at-the-data-boundary),
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures)
  and [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit)
  for TA-only scope and permitted learner identity;
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) and
  [SYS-18](../TECHNICAL-SPEC.md#sys-18--resource-use) for UI and bounded operations.
- **Security:** Future `AI-SECURITY-SPEC.md` sections “Authorize and minimize model
  access”, “Validate model output before use”, “Bound SoC requests and usage”,
  “Reserve and settle usage atomically” and “Contain failures and keep diagnostics
  safe”. That spec does not exist on this branch's base; it must define the shared
  AI controls and limits before live summary generation is enabled. This story
  allocates no SEC identifiers or replacement limits.
- **Contracts:** [Shared bounds](../INTEGRATION-SPEC.md#shared-values-and-bounds),
  [transport and idempotency](../INTEGRATION-SPEC.md#transport-concurrency-and-errors),
  [TA surface and SummaryRecord](../INTEGRATION-SPEC.md#ta-surface),
  [LLM envelope](../INTEGRATION-SPEC.md#4-server-only-llm-contracts),
  [summary input/output and freshness](../INTEGRATION-SPEC.md#ta-performance-summary-operation-summarize_learner)
  and [progress evidence](../INTEGRATION-SPEC.md#category-progress-and-recommendations).
- **Related stories:** [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns
  account navigation/access recovery; [TA-01](TA-01-inspect-submissions.md) owns
  supporting submission evidence; [TA-05](TA-05-category-progress-and-recommendations.md)
  adds deterministic progress/recommendations to this learner detail. TA-04 owns
  the learner list and shared detail entry; its summary does not require TA-05's UI.

## Acceptance criteria

- **TA-04.1:** Opening `/ta/learners` shows “Learners” with ACC-03 navigation.
  Each row shows “Learner”, “Learner ID” and “View learner”; identity consists
  only of display name and ID, never email or Auth records. “View learner” opens
  `/ta/learners/:learnerId`, headed “Learner performance” with that identity,
  “Performance summary”, “View submissions” and “Back to learners”. “View
  submissions” opens `/ta/submissions?learnerId=:learnerId` using TA-01. No
  learners uses ACC-03's “No learners yet.” Duplicate display names remain
  distinguishable by ID.
- **TA-04.2:** The learner list follows shared bounds and ordering, with “Next
  page” only for nonnull nextCursor and “First page” on cursor pages. Cursor is
  retained in the URL for back/reload. During reads show “Loading learners…” and
  disable page controls. Failure shows “We couldn't load learners. Try again.”
  with “Try again” for that page. Invalid cursor shows “This learners page isn't
  valid.” with “First page”. Detail loading shows “Loading learner performance…”.
  An absent learner shows “Learner not found.” with “Back to learners”; access
  failures follow ACC-03 and reveal no protected identity or summary.
- **TA-04.3:** On entry, read the stored summary without starting generation.
  A null summary shows “No performance summary yet.” with “Generate summary”.
  A stored summary shows “AI-generated summary — review the supporting
  submissions.”, “Generated” with date/time/timezone, and sections “Strengths”,
  “Blind spots” and “Suggested next steps”. Each item shows its category label,
  full inert text and “View supporting submission” for each evidence ID, opening
  TA-01 detail. Empty sections show respectively “No strengths identified in this
  summary.”, “No blind spots identified in this summary.” or “No next steps
  suggested in this summary.” Empty arrays never imply missing data or a failed
  request. A successful summary has at least one item overall per contract.
- **TA-04.4:** Freshness comes from the summary contract. A stale summary remains
  readable with “This summary is out of date. Generate a new summary to include
  current evidence.” and “Regenerate summary”. A current stored summary offers
  “Regenerate summary” without a stale notice. Opening, refreshing or navigating
  the page never automatically regenerates. Refresh rereads freshness against
  current evidence, including effective overrides and eligible progress; an old
  generated time alone does not determine staleness.
- **TA-04.5:** “Generate summary” or “Regenerate summary” explicitly requests a
  summary for the selected learner using authorized server-selected evidence.
  While pending show “Generating performance summary…” and disable both
  generation actions for this learner. Keep the previous summary visible, if
  any, labelled “Previous summary” until success. Success shows “Performance
  summary generated.” and the validated returned result. Generation edits no
  grade, flag, category progress, recommendation or learner record and requires
  no human approval to display; its advice requires TA judgement.
- **TA-04.6:** With no completed submissions, a rejected generation shows “A
  completed submission is required to generate a summary.” and “View submissions”.
  An oversized input shows “There is too much evidence to generate this summary.”
  without silently truncating beyond the contracted evidence selection. A usage
  or concurrency rejection shows “Summary generation is temporarily limited.
  Try again later.” A timeout shows “Summary generation timed out. Try again.”
  Invalid output shows “We couldn't generate a valid summary. Try again.” Provider
  or accounting/service failure shows “Summary generation is unavailable. Try
  again.” No failure replaces a previous summary, shows a partial result or
  claims success. No prompts, raw provider output or private diagnostics appear.
- **TA-04.7:** Generation failures offer “Try again”, except that no-completed-
  submission failure offers the evidence link and oversized input offers
  “Refresh learner performance”. Only explicit action retries; permitted
  automatic provider retries and usage admission belong to the future AI
  security spec. An uncertain result offers “Refresh learner performance” to
  reread the stored summary. Replaying the same action follows shared idempotency;
  a new explicit attempt after a confirmed failure follows its new-attempt rule.
  Account/access failures follow ACC-03 without automatically replaying generation.
- **TA-04.8:** A summary read failure shows “We couldn't load the performance
  summary. Try again.” with “Try again” for the read and “Back to learners”. It
  never appears as “No performance summary yet.” or starts generation. If the
  page has an already loaded summary, retain it labelled “Previously loaded
  summary; freshness unavailable.” until a successful refresh. Supporting-link
  failures use TA-01; the summary remains available when returning to the learner.

## Use cases

### UC-TA-04-1 — Review or refresh a learner summary

**Actor:** TA

**Preconditions:** Usable signed-in TA account; a learner exists in scope.

**Trigger:** Open “Learners” and choose “View learner”.

1. The TA sees the stored summary or its empty state and freshness.
2. The TA reads strengths, blind spots and suggested next steps.
3. If needed, the TA explicitly generates/regenerates a summary.
4. The TA follows supporting submissions to verify the advice against evidence.
5. The TA returns to learner detail or the learner list.

**Alternate paths:** A stale stored summary remains readable under TA-04.4;
empty result sections follow TA-04.3. TA-05 adds non-AI practice guidance.

**Failure paths:** List/detail access follows TA-04.2; generation limits, invalid
output and retry follow TA-04.6–7; summary read failure follows TA-04.8.

**Postconditions:** Reading/generation changes no assessment or moderation
decision. Successful generation stores a validated, attributable evidence snapshot;
failure preserves the previous result.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Learner has submissions but none completed | TA-04.6 shows the eligibility message, not an invented summary. |
| A completed retry is in the latest evidence | Summary input follows its contract; progress still uses eligible first attempts. |
| An override or new eligible submission changes the fingerprint | TA-04.4 marks retained output stale on refresh. |
| Summary includes a foreign evidence ID or category absent from its evidence | Contract validation rejects the whole result under TA-04.6. |
| Stored comments contain instructions or markup | TA-04.3 and AI behavior keep text inert and bounded to permitted evidence. |
| Duplicate click or lost response | TA-04.5–7 uses pending controls and shared idempotency. |

## UI notes

Keep identity, summary freshness and AI provenance visible. Separate generated
advice from TA-05's deterministic progress/recommendations. Group evidence links
with their item; do not turn arbitrary generated text into links. Under SYS-17,
announce loading/success/failure, focus the summary heading after generation and
retain keyboard-accessible navigation and readable sections at phone width.

## AI behavior

- **Inputs:** Use only the authorized snapshot in the
  [summary input contract](../INTEGRATION-SPEC.md#ta-performance-summary-operation-summarize_learner):
  selected completed attempts, effective/original scores, category counts,
  comments/feedback and eligible progress. Identity and private answer exclusion
  belong to that contract and SYS-12. Stored text is data, never model instructions.
- **What the user sees:** Present validated SummaryOutput under TA-04.3, with
  categories and evidence links. The TA evaluates its advice; output cannot
  assign scores, resolve flags or change permissions.
- **Failure and fallback:** TA-04.5–8 defines pending, timeout, invalid-output,
  unavailable and explicit-retry presentation. Preserve committed summary data;
  no partial or fabricated fallback. Shared provider retry/admission controls
  remain owned by the future AI security spec named in Dependencies.
- **Caching:** Read the learner-scoped SummaryRecord under
  [TA access rules](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit).
  [Fingerprint freshness](../INTEGRATION-SPEC.md#ta-performance-summary-operation-summarize_learner)
  controls the stale notice, not a UI expiry timer. Reads reuse the stored result;
  refresh is explicit. Other TAs may read within the same moderation scope;
  Learners and Authors cannot read these summaries.
- **Limits:** Input/output bounds and evidence selection are in the summary
  contract and [shared text bounds](../INTEGRATION-SPEC.md#shared-values-and-bounds).
  Usage, retries, concurrency and live admission depend on future
  `AI-SECURITY-SPEC.md` sections named above and SYS-18. TA-04.6–7 defines the
  visible rejected-operation outcomes without inventing shared limit values.
