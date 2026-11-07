# AUT-04 — Preview and decide flaws

## Story

As an Author, I want to preview the code and diff and approve or reject each
flaw so that I control the final exercise.

**Priority:** Must

**AI:** Yes

## Dependencies

- **Product:** [AUT-04 allocation](../PRODUCT-SPEC.md#author),
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
  [AUT-03](AUT-03-generate-flaw-proposals.md),
  [AUT-05](AUT-05-publish-a-challenge.md),
  [AUT-06](AUT-06-maintain-challenges.md).

## Acceptance criteria

- **AUT-04.1:** Given an own draft with a current proposal set, “Proposal preview”
  lists every proposal with category, source range, original/replacement snippets,
  explanation, fix and “Pending”, “Approved” or “Rejected” decision. “Approve” and
  “Reject” act on one proposal. AI text/code is inert; viewing proposals makes no
  model request and changes no decision.
- **AUT-04.2:** A decision shows “Saving decision…” and prevents duplicate action
  on that proposal while pending. Success displays its saved state. The Author
  may switch an approved/rejected decision before publication; only active-set
  proposals can be decided. Decisions never edit the generated explanation or fix.
- **AUT-04.3:** Until every proposal is decided, show “Decide every proposal to
  preview the final challenge.” If all are rejected show “Approve at least one
  proposal to preview or publish.” Final-preview/publication actions remain
  unavailable in either state. “Back to configuration” and explicit regeneration
  under AUT-03 remain available; rejected proposals need not be replaced to meet
  the originally configured count.
- **AUT-04.4:** When every proposal is decided and at least one is approved,
  “Preview final challenge” shows the assembled flawed code, real working-to-flawed
  diff and retained answer material with final locations under the code contract.
  Rejected replacements are absent from the candidate and answer key. A saved
  decision change invalidates that preview and uncommitted hints; preview must
  reflect the latest saved decisions before “Publish challenge” (AUT-05).
- **AUT-04.5:** A decision failure shows “We couldn't save this decision. Try
  again.” with the last confirmed decision distinguished from an unsaved choice.
  An uncertain save shows “We couldn't confirm this decision. Refresh the draft.”
  with “Refresh draft”; publication waits for confirmed current state. A version
  conflict shows “This draft changed. Reload it before reviewing proposals.” with
  “Reload draft”, without overwriting the newer set or decision.
- **AUT-04.6:** If proposals were invalidated or do not exist, show “Generate
  proposals before reviewing flaws.” with “Back to configuration”. A final-preview
  read failure shows “We couldn't load the preview. Try again.” with “Try again”
  for the read. It never appears as an empty successful preview and cannot publish.
  Account/access failures follow ACC-03; archived drafts are read-only under AUT-06.

## Use cases

### UC-AUT-04-1 — Retain the intended flaws

**Actor:** Author

**Preconditions:** Own editable draft with a current validated proposal set.

**Trigger:** Generation succeeds or the Author reopens “Proposal preview”.

1. Read each AI proposal and its answer material.
2. Approve or reject each proposal and wait for saved decisions.
3. Choose “Preview final challenge” and inspect the retained code/diff and key.
4. Continue to “Publish challenge” under AUT-05 or revise decisions.

**Alternate paths:** All rejected/incomplete choices follow AUT-04.3. Return to
configuration or explicitly regenerate under AUT-03.

**Failure paths:** Decision failures/conflicts follow AUT-04.5; absent proposals
or read failure follow AUT-04.6; account/access recovery uses ACC-03.

**Postconditions:** Saved decisions define the candidate; no publication or
learner-facing hint has been created by previewing it.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| One of several configured flaws retained | AUT-04.3–4 allows the smaller approved count. |
| Rejected earlier edit would have shifted later lines | AUT-04.4 uses final locations derived only from retained edits. |
| Another tab regenerates proposals before a decision saves | AUT-04.5 rejects the stale decision; sets are never mixed. |
| Pending decision or preview read fails | AUT-04.5–6 blocks publication of uncertain/unread state. |
| Generated content includes script/remote-image markup | AUT-04.1 renders literal text without executing or fetching. |

## UI notes

Use SYS-04's shared code/diff view with clear labels for working and flawed code.
Keep per-proposal decisions adjacent to their evidence; indicate decisions with
text, not color alone. Distinguish source ranges from final candidate ranges.
Announce saved decisions and preview updates under SYS-17; keep keyboard focus
on the changed proposal, and focus the preview heading on explicit preview.

## AI behavior

- **Inputs:** This interaction reads AUT-03's saved
  [Proposal output](../INTEGRATION-SPEC.md#flaw-injection-operation-inject_flaws)
  and saves human decisions using the Author surface; it sends no new model input.
- **What the user sees:** AUT-04.1–4 displays generated proposal evidence and a
  server-derived real diff/key under the
  [code contract](../INTEGRATION-SPEC.md#code-proposals-and-locations).
  The Author's explicit saved decisions determine what can be published.
- **Failure and fallback:** AUT-04.5–6 requires refresh or explicit read retry;
  no guessed decisions or locally assembled substitute preview can publish.
- **Caching:** Reuse the current own proposal set and decisions under SYS-12;
  candidate freshness follows draft versions and lifecycle invalidation. Opening
  or refreshing preview never regenerates proposals or hints.
- **Limits:** Shared proposal/code/text bounds apply to rendering and preview.
  SEC-02 requires inert output; this story consumes no provider quota. Any explicit
  regeneration returns to AUT-03 with SEC-04/SEC-05 admission and retry controls.
