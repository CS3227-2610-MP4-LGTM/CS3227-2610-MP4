# AUT-03 — Generate flaw proposals

## Story

As an Author, I want AI to propose flaws and their answer key together so that
the exercise and assessment agree.

**Priority:** Must

**AI:** Yes

## Dependencies

- **Product:** [AUT-03 allocation](../PRODUCT-SPEC.md#author),
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
  [Injection schema](../INTEGRATION-SPEC.md#flaw-injection-operation-inject_flaws)
  and [code/proposal locations](../INTEGRATION-SPEC.md#code-proposals-and-locations).
- **Related stories:** [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns
  account, session and access-failure presentation. Author journey:
  [AUT-01](AUT-01-create-a-draft.md),
  [AUT-02](AUT-02-configure-flaws.md),
  [AUT-04](AUT-04-preview-and-decide-flaws.md),
  [AUT-05](AUT-05-publish-a-challenge.md),
  [AUT-06](AUT-06-maintain-challenges.md).

## Acceptance criteria

- **AUT-03.1:** Given an own editable draft with valid saved metadata, working code
  and AUT-02 configuration, “Generate proposals” explicitly starts generation.
  Unsaved edits show “Save your changes before generating proposals.” No provider
  request occurs for unauthorized, archived or otherwise ineligible input.
- **AUT-03.2:** While pending, show “Generating proposals…” and disable duplicate
  generation/publication actions. A validated result replaces the active proposal
  set as a whole, resets every decision to pending and opens “Proposal preview”
  (AUT-04) with “Proposals generated. Review every proposal before publishing.”
  Each proposal contains the category, original/replacement snippets, source range,
  explanation and fix in the injection contract. The count equals the saved count;
  categories belong to the saved selection. Generation never publishes anything.
- **AUT-03.3:** The proposed code changes and answer material come from the same
  validated output. Invalid snippets, overlapping/out-of-range locations, wrong
  counts/categories or any other contract failure reject the entire result.
  Show “The AI returned invalid proposals. Try again.” after permitted retries;
  do not display or save a partial proposal set as usable output.
- **AUT-03.4:** If a prior set exists, requesting regeneration first shows
  “New proposals replace the current proposals and reset their decisions.” with
  “Generate new proposals” and “Cancel”. A failed replacement retains the prior
  saved set/decisions; success requires deciding every new proposal again. Sets
  cannot be combined. Existing publications and historical attempts remain intact.
- **AUT-03.5:** A changed draft/version or archived challenge before completion
  prevents the result becoming active. Show “This draft changed. Reload it before
  generating proposals.” with “Reload draft”. A late result after operation expiry
  is never shown as successful. Account/access recovery uses ACC-03 without replay.
- **AUT-03.6:** Limit/admission failure shows “AI generation is unavailable within
  the current limits. Try again later.” Oversized model input shows “This draft
  is too large for AI generation. Reduce it before trying again.” Timeout shows
  “Proposal generation timed out. Try again.” Provider/accounting unavailability
  shows “We couldn't generate proposals right now. Try again.” Retain saved draft
  data and any prior set. Offer explicit “Try again” for retryable failures and
  “Back to configuration”; automatic retries follow SEC-05 only.
- **AUT-03.7:** A lost response shows “We couldn't confirm proposal generation.”
  with “Check generation”, resolving the same operation under shared idempotency.
  Repeated clicks/replays never generate multiple sets for the same action. After
  a confirmed failure an explicit retry is a new attempt under the shared contract.

## Use cases

### UC-AUT-03-1 — Generate a coherent proposal set

**Actor:** Author

**Preconditions:** Own editable draft with saved valid configuration and code.

**Trigger:** Choose “Generate proposals”, confirming replacement if applicable.

1. The Author sees pending generation.
2. A complete validated set is saved against the unchanged draft snapshot.
3. The Author reaches “Proposal preview” and reviews the new pending decisions.

**Alternate paths:** Cancel replacement under AUT-03.4; AUT-04 owns decisions.

**Failure paths:** Invalid output uses AUT-03.3; stale state uses AUT-03.5;
provider, limits and uncertainty use AUT-03.6–7; account/access uses ACC-03.

**Postconditions:** Success leaves one active, wholly validated proposal set and
no publication. Failure leaves committed draft/publication data intact.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| One invalid proposal in otherwise valid output | AUT-03.3 rejects the whole set. |
| Instructions embedded in working code | SEC-01 keeps them as data; AUT-03.2 cannot grant model capabilities. |
| Old operation finishes after a draft edit | AUT-03.5 rejects its stale snapshot. |
| Duplicate requests or uncertain dispatch | AUT-03.7 and SEC-05 prevent duplicate work for a replay. |
| Generated candidate exceeds the pasted-code cap | Invalid output under AUT-03.3, not a truncated candidate. |

## UI notes

Show saved count/categories/difficulty above the generation action, with a route
back to configuration. Announce progress, errors and arrival at the preview under
SYS-17. SYS-04 code rendering keeps snippets inert and readable. Clearly label
proposals as AI-generated and awaiting the Author's decisions.

## AI behavior

- **Inputs:** Only the saved authorized snapshot in the
  [injection input contract](../INTEGRATION-SPEC.md#flaw-injection-operation-inject_flaws).
  Code and stored text are untrusted data under SEC-01; no execution or tools.
- **What the user sees:** The complete validated contract output under AUT-03.2,
  including private answer material accessible to the owning Author under SYS-12.
  AUT-04 decisions and AUT-05 publication are required before learner availability.
- **Failure and fallback:** AUT-03.3–7; no fabricated or partial fallback. SEC-02,
  SEC-05 and SEC-06 govern validation, bounded retry and retained committed data.
- **Caching:** Reopening the draft reuses its active saved set without another
  provider call. Explicit regeneration replaces it only on success; input edits
  invalidate it under the publication lifecycle. Never reuse another Author's set.
- **Limits:** Shared code bounds and SEC-04/SEC-05 own input/output, usage,
  deadlines, retries and concurrency. AUT-03.6 presents rejected admission;
  no silent input truncation or unbounded retry is allowed.
