# Shared Role Integration Specification

## Goal
Define shared integration contracts so Learner, Author and TA features can be built in parallel, then record the session.

## Scope
Two task-bearing user-assistant exchanges: one focused specification task followed by session logging.

## Session metadata
- Tool: Codex, CLI version `0.162.0-alpha.17.2`, originator Codex Desktop.
- Session ID: `01a1a759-0197-7473-be6e-7c7098efc05b`.
- Model/settings: `gpt-6.1-sol`, medium reasoning effort, service tier unknown (1 turn); `gpt-6.1-sol`, medium reasoning effort, service tier default (1 turn).
- Token totals as of writing: `input_tokens: 585944`, `cached_input_tokens: 513920`, `cache_write_input_tokens: 0`, `output_tokens: 14241`, `reasoning_output_tokens: 1457`, `total_tokens: 600185`.

## Key prompts
- “Add INTEGRATION-SPEC.md: domain data model, API contracts, LLM input and output schemas, and shared seed challenges and submissions so the three roles can be built in parallel.” This requested a common contract rather than separate role-specific assumptions.
- “Includes the pasted-code size cap and the choice between versioning and locking published challenges (SYS-12)” This required concrete input limits and a historical-preservation decision.

## Decisions and corrections
- Created a specification only; no domain tables, endpoints or seeds were implemented.
- Selected immutable published revisions for SYS-12. New publications retain earlier code, answers, hints and submission evidence.
- Set the pasted-code cap to 20,000 UTF-8 bytes after newline normalization, with a separate 128 KiB JSON request-body cap.
- Defined role DTOs/endpoints, strict LLM schemas, deterministic matching/scoring, flags, category progress and recommendation ordering.
- Specified shared local/fake-provider challenges, attempts, grades, hints and TA audit fixtures. Corrected the Python fixture's final flaw range to account for an inserted line and clarified private matching/assessment shapes.
- Document checks passed for local links, whitespace, fixture source locations, expected scores and unique fixture IDs.
- `bun run verify` stopped at lint because `eslint` was unavailable. Typecheck, tests and build did not run.
- GitHub username lookup initially failed to connect; the network-enabled retry succeeded and identified `TaiaYovelaPang` for log attribution. No commits or pushes were made.

## Files created or modified
- `workflow/specs/INTEGRATION-SPEC.md`
