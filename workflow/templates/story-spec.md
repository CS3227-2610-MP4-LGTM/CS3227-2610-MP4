# <ID> — <Story title>

## Story

As a <role>, I want <capability> so that <outcome>.

**Priority:** <Must | Should>

**AI:** <Yes | No>

## Dependencies

- **Product:** <Link to this ID's allocation in PRODUCT-SPEC and relevant decisions.>
- **System:** <Links to the exact SYS requirements this story depends on.>
- **Security:** <Links to applicable SEC requirements, or None with a brief reason.>
- **Contracts:** <Links to applicable contract sections, or None with a brief reason.>

Name future specs and sections without links until they exist. Do not invent SYS,
SEC or contract definitions here. Reference shared facts rather than repeating them.

## Acceptance criteria

- **<ID>.1:** Given <specific precondition>, when <user action or event>, then
  <observable result, including destination or exact message where relevant>.
- **<ID>.2:** <Validation, alternate outcomes and failure behavior with measurable
  conditions; refer to shared bounds rather than defining competing values.>

Each criterion must be independently checkable without choosing unspecified
behavior. Specify field labels, requiredness, validation messages, pending states
and successful outcomes as relevant. Mechanisms stay in the technical spec.

## Use cases

### UC-<ID>-1 — <Main outcome>

**Actor:** <Role>

**Preconditions:** <Starting state>

**Trigger:** <Entry action>

1. <User-visible step.>
2. <System response visible to the user.>
3. <Completion and destination.>

**Alternate paths:** <Named branches and their outcomes, with criterion references.>

**Failure paths:** <Validation, unavailable dependency and interrupted-session
outcomes, including recovery action.>

**Postconditions:** <What the completed or failed journey leaves true.>

<Add other use cases as needed, each with UC-<ID>-n.>

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| <Boundary, empty state, repeated action, stale state or concurrent change> | <Expected outcome or exact criterion reference> |

## UI notes

<Screens, labelled controls, navigation, field/error associations and focus behavior
needed for this story. Reference SYS-04 and SYS-17 where applicable. No mockups or
implementation steps.>

## AI behavior — AI stories only

Omit this section for stories marked AI: No. Reference the relevant product
decisions, SYS, SEC and contract sections rather than duplicating shared rules.

- **Inputs:** <Permitted source data and user choices; exact input-contract link.>
- **What the user sees:** <Generated result, its presentation and any human decision
  required before it takes effect; exact output-contract link.>
- **Failure and fallback:** <Pending, timeout, invalid-output and unavailable states;
  allowed retry and recovery outcome, including whether work is retained.>
- **Caching:** <What is reused, scope, freshness and invalidation; link shared
  ownership/access rules and cache contract.>
- **Limits:** <Links to applicable input/output, usage, retry and concurrency limits;
  visible behavior when a limit is reached.>
