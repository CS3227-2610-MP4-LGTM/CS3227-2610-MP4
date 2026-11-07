# AUT-01 — Create a draft

## Story

As an Author, I want to create a draft with title, description, language,
difficulty and pasted working code so that I can prepare a challenge.

**Priority:** Must

**AI:** No

## Dependencies

- **Product:** [AUT-01 allocation](../PRODUCT-SPEC.md#author),
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
- **Security:** None: this story makes no AI request; SYS-02 and SYS-12 govern
  inert code and record access.
- **Contracts:** [shared bounds](../INTEGRATION-SPEC.md#shared-values-and-bounds),
  [code cap](../INTEGRATION-SPEC.md#pasted-code-cap),
  [publication lifecycle](../INTEGRATION-SPEC.md#sys-12-decision-immutable-published-revisions),
  [transport, concurrency and errors](../INTEGRATION-SPEC.md#transport-concurrency-and-errors)
  and [Author surface](../INTEGRATION-SPEC.md#author-surface).
- **Related stories:** [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns
  account, session and access-failure presentation. Author journey:
  [AUT-02](AUT-02-configure-flaws.md),
  [AUT-03](AUT-03-generate-flaw-proposals.md),
  [AUT-04](AUT-04-preview-and-decide-flaws.md),
  [AUT-05](AUT-05-publish-a-challenge.md),
  [AUT-06](AUT-06-maintain-challenges.md).

## Acceptance criteria

- **AUT-01.1:** Given a usable Author account, “My challenges” offers “Create
  challenge”, opening `/author/challenges/new` headed “Create challenge”. A new
  account sees “No challenges yet.” and the same action. The form contains required
  “Title”, “Description”, “Language”, “Difficulty” and “Working code” fields, plus
  the required flaw configuration defined by AUT-02. Language and difficulty choices
  use the product vocabularies; there is no upload, repository URL or run control.
- **AUT-01.2:** “Save draft” validates all fields against the shared bounds and
  pasted-code cap. Missing text shows “Enter a title.”, “Enter a description.” or
  “Paste working code.” beside its field. Missing/invalid selections show “Choose
  a supported language.” or “Choose a difficulty.” Text beyond its bound shows
  “Title is too long.” or “Description is too long.” Oversized code shows
  “Working code exceeds the size limit.” Ill-formed code text shows “Working code
  contains invalid characters.” Validation retains entered values and creates no
  draft. Flaw-configuration errors follow AUT-02.2.
- **AUT-01.3:** Given valid complete input, saving shows “Saving draft…” and
  prevents repeat submission until resolved. Success creates one own private draft,
  shows “Draft saved.” and opens its “Flaw configuration” screen (AUT-02). Saving
  neither requests AI proposals nor publishes the challenge. Replaying the same
  save follows shared idempotency and cannot create a second challenge.
- **AUT-01.4:** “Cancel” returns to “My challenges” without creating a draft.
  “Back to challenges” remains available after saving. A draft read by another
  Author or a non-Author is denied under SYS-12; account/access failures use ACC-03
  without automatically replaying a save after authentication.
- **AUT-01.5:** A confirmed save failure shows “We couldn't save the draft. Try
  again.” and retains form values for an explicit retry. An uncertain response shows
  “We couldn't confirm whether the draft was saved.” with “Check save”, which
  resolves the same save under shared idempotency before allowing a new creation.
  No failure is presented as “Draft saved.”

## Use cases

### UC-AUT-01-1 — Prepare a private draft

**Actor:** Author

**Preconditions:** Usable signed-in Author account.

**Trigger:** Choose “Create challenge” from “My challenges”.

1. Enter the challenge metadata and paste working code.
2. Complete flaw configuration under AUT-02.
3. Choose “Save draft”; wait for confirmation.
4. Continue at the saved draft's “Flaw configuration” screen.

**Alternate paths:** Cancel under AUT-01.4; correct field errors under AUT-01.2.

**Failure paths:** Save failure/uncertainty follows AUT-01.5; session, role and
account recovery follows ACC-03.

**Postconditions:** A successful save leaves one private draft owned by the Author.
No proposal, published revision or learner attempt is created.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Whitespace-only required text/code | AUT-01.2 rejects it using the shared text/code rules. |
| Multibyte source or CRLF near the cap | AUT-01.2 uses the normalized UTF-8 cap, not character count. |
| Code includes HTML or instructions | Code remains inert under SYS-02; saving does not run it. |
| Double click or response lost after creation | AUT-01.3/5 resolves the same save without duplicate drafts. |
| Session expires while entering data | ACC-03 recovery applies; no promise of unsaved-text recovery. |

## UI notes

Keep metadata, working-code input and AUT-02 configuration visibly grouped. Show
supported choices and shared size bounds near the inputs. Associate each error
with its field, focus the first invalid field, and announce save progress/outcome
under SYS-17. Code input can scroll without moving the form controls off screen.
SYS-04 supplies shared presentation. LGTM displays code; it does not verify that
the Author's supplied code works by executing it.
