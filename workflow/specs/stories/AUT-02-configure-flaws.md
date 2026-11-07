# AUT-02 — Configure flaws

## Story

As an Author, I want to configure flaw count, categories and difficulty so that
the exercise targets the intended skills.

**Priority:** Must

**AI:** No

## Dependencies

- **Product:** [AUT-02 allocation](../PRODUCT-SPEC.md#author),
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
  [AUT-01](AUT-01-create-a-draft.md),
  [AUT-03](AUT-03-generate-flaw-proposals.md),
  [AUT-04](AUT-04-preview-and-decide-flaws.md),
  [AUT-05](AUT-05-publish-a-challenge.md),
  [AUT-06](AUT-06-maintain-challenges.md).

## Acceptance criteria

- **AUT-02.1:** On “Flaw configuration”, and in AUT-01's new-draft form, the Author
  sees required “Flaw count”, “Flaw categories” and “Difficulty” controls. Count
  and category selections use shared bounds; labels use the product vocabulary.
  Difficulty is the same challenge field used in AUT-01, not a separate setting.
  An existing draft displays its saved choices, with “Save configuration”,
  “Generate proposals” (AUT-03) and “Back to challenges”.
- **AUT-02.2:** Saving rejects a missing, noninteger or out-of-range count with
  “Choose a whole-number flaw count within the allowed range.” It rejects no
  category, unsupported categories or duplicate submitted categories with “Choose
  supported flaw categories without duplicates.” Missing/invalid difficulty shows
  “Choose a difficulty.” No invalid configuration is saved or sent to AI; entered
  values remain available for correction. The UI displays the shared allowed
  count range and category choices without requiring every selected category to
  appear in the generated output.
- **AUT-02.3:** A valid “Save configuration” shows “Saving configuration…”, disables
  repeated saves, then shows “Configuration saved.” with the persisted choices.
  AUT-01 saves initial configuration with the whole new draft. Configuration saves
  do not request proposals; “Generate proposals” requires saved current input.
- **AUT-02.4:** Changing saved difficulty, count or categories invalidates the active
  proposal set and its decisions under the lifecycle contract. Before saving over
  proposals, show “Saving changes clears the current proposals and decisions.”
  with “Save configuration” and “Cancel”. After saving show “Generate new proposals
  to continue.” Existing published revisions and historical attempts are unaffected.
- **AUT-02.5:** A version conflict shows “This draft changed. Reload it before
  saving.” with “Reload draft”; it neither overwrites newer choices nor merges old
  proposals. A confirmed failure shows “We couldn't save the configuration. Try
  again.” and retains local inputs. An uncertain outcome offers “Refresh draft”
  with “We couldn't confirm the save. Refresh the draft before continuing.”
  Refresh rereads current state and makes no new mutation.
- **AUT-02.6:** Only the owning Author may configure an editable challenge.
  Archived challenges show read-only configuration and “Archived challenges can't
  be edited.” Account/access failures follow ACC-03; no save or generation is
  automatically replayed after recovery.

## Use cases

### UC-AUT-02-1 — Set the exercise's target skills

**Actor:** Author

**Preconditions:** AUT-01 form or an own editable draft is open.

**Trigger:** Enter the configuration section or open “Flaw configuration”.

1. Choose flaw count, categories and difficulty.
2. Save the new draft under AUT-01, or choose “Save configuration”.
3. Confirm clearing existing proposals if applicable.
4. Read saved choices and proceed to “Generate proposals” under AUT-03.

**Alternate paths:** Cancel clearing proposals under AUT-02.4 keeps the saved
configuration/set; validation corrections follow AUT-02.2.

**Failure paths:** Conflicts, save failures and uncertain outcomes follow
AUT-02.5. Account/access failures use ACC-03.

**Postconditions:** Valid saved choices determine subsequent generation. Old
proposals are invalidated when inputs change; no published revision changes.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Count at either inclusive shared boundary | Valid under AUT-02.2; adjacent out-of-range values fail. |
| More categories selected than requested flaws | AUT-02.2 allows it within shared bounds; categories are permitted choices. |
| Another tab saves before this tab | AUT-02.5 requires rereading rather than overwriting. |
| Configuration changes while AI is pending | AUT-03 rejects a stale result; AUT-02.4 clears previous decisions. |
| Archive occurs before save | AUT-02.6 prevents editing; refresh reveals the archived state. |

## UI notes

Group count, category choices and difficulty with their bounds and errors.
Announce save/invalidated-proposal states; focus invalid controls under SYS-17.
Keep the distinction between saved inputs and unsaved edits visible. SYS-04
supplies consistent controls and navigation; this screen makes no AI request
until the Author explicitly continues under AUT-03.
