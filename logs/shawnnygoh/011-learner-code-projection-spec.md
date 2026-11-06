# Learner Code Projection Specification

## Goal
Amend the integration specification for issue #33 so Learner-facing challenge code does not reveal flaw locations or working code. Record the completed session for `shawnnygoh`.

## Scope
Two user-assistant exchanges covering one focused spec amendment and its session log.

## Session metadata
- Tool: Codex, CLI `0.167.0-alpha.3.2`; originator: Codex Desktop.
- Model: `gpt-6.1-sol`; reasoning effort: `high`; service tier: `default`; 2 turns.
- Session ID: `01a1b07a-b856-7480-848b-8559f870617a`.
- Token totals as of writing: `input_tokens: 485942`, `cached_input_tokens: 443136`, `cache_write_input_tokens: 0`, `output_tokens: 4964`, `reasoning_output_tokens: 1351`, `total_tokens: 490906`.

## Key prompts
> Task: amend workflow/specs/INTEGRATION-SPEC.md so Learner-facing code never reveals flaw locations or the working code. Spec-only change for issue #33.

This defined the security problem and limited the work to a specification amendment.

> Decision (made by the team; record it as a decision, not an option):

This required documenting the team's chosen projection and storage rules without reopening the decision.

> Follow workflow/specs/README.md: one home per fact, link rather than restate, no owners, statuses or open questions. Keep the change as small as the decision allows.

This constrained the amendment to authoritative contracts and cross-references.

## Decisions and corrections
- Learners receive an empty-before, single-hunk new-file diff for live challenges, their own submissions, pinned history and retries. Authors and TAs retain the real working-to-flawed diff.
- Kept shared DTO shapes; nested challenge code follows the authenticated recipient's projection rather than introducing role-local duplicate DTOs.
- Moved published working code and the real diff into a separate private `revision_answers` logical record. Learners cannot read this answer material through server entry points or direct user-scoped database access.
- Updated sections 2, 3, 6 and 7, including atomic publication, fixture expectations and verification of leakage prevention and exact flawed-code reconstruction. Comment locations, matching and scoring remain unchanged.
- Found no contradictions in the requested PRODUCT, TECHNICAL and AI-SECURITY sections. The amendment added 275 words and removed 25, using whitespace-delimited Git word counts.
- `git diff --check` and scope/link assertions passed. Runtime tests, lint and typecheck were not run for the spec-only change. No agent commits were made.

## Files created or modified
- `workflow/specs/INTEGRATION-SPEC.md`
