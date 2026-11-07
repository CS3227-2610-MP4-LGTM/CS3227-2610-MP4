# AI persistence provenance specification

## Goal

Record the team's decision for issue #44 on how the server persists AI-generated proposals, publication hints, and TA performance summaries.

## Scope

Three user–assistant exchanges on one focused spec task, including a wording follow-up and this log.

## Session metadata

- Tool — Codex Desktop, CLI `0.167.0-alpha.3.2`
- Model — `gpt-6.1-sol`, high reasoning effort, default service tier, 3 turns
- Session ID — `01a1b6ab-27e8-7df2-b6cd-4fb125151b39`
- Token totals as of writing
  - Input — 530771
  - Cached input — 482048
  - Cache-write input — 0
  - Output — 6901
  - Reasoning output — 1929
  - Total — 537672

## Key prompts

> Spec-only change for issue #44: settle how AI-generated output is persisted with server-generation provenance. This is spec work, not a loop run.

The user limited the work to recording an agreed decision in the specs.

> One home per fact, no owners, statuses or open questions.

The named-use register owns privileged access, and the integration spec points to it for provenance.

> Reword the added sentence so the schema checks verify that SYS-10.3 rule by reference, without restating it.

This kept the access rule in SYS-10.3 and its schema check in SYS-10.1.

> In the SYS-10.3 Proposal generation row, the precondition should say the result passes SEC-02 validation against the captured draft snapshot. Link SEC-02 the way the Publication row does.

The follow-up made model-output validation explicit and linked to its owning requirement.

## Decisions and corrections

- SYS-10.3 registers proposal generation, publication, and TA performance summaries. Each use defines its authorization and permitted writes. Author edits and proposal decisions stay user-scoped.
- Every registered admin use goes through a dedicated server-only database function. Only the admin role may execute it, and the role has zero direct table or column privileges. Each function writes atomically. A call that creates a parent also creates all its children. Submission grading also covers run creation and transitions and rule-based flags.
- Integration section 2 previously assigned generated output to user-scoped persistence. It now links to SYS-10.3 and preserves the prohibition on direct user writes impersonating server generation.
- An initial scope check treated new cross-references as new IDs. Comparing requirement definitions confirmed the IDs were preserved. After the wording fixes, `git diff --check` passed and all 26 relative links in the technical spec resolved, including 23 heading anchors.

## Files created or modified

- [TECHNICAL-SPEC.md](../../workflow/specs/TECHNICAL-SPEC.md) — SYS-10.1 and SYS-10.3
- [INTEGRATION-SPEC.md](../../workflow/specs/INTEGRATION-SPEC.md) — section 2 provenance paragraph
