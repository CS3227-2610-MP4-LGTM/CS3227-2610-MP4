# LGTM foundation specifications

## Goal
Create LGTM's first spec conventions and technical foundation, then refine auth mechanisms, data ownership and reviewability without changing code, configuration or migrations.

## Scope
Four user-assistant exchanges covering one focused documentation task, its revisions and this session log.

## Session metadata
- Attribution: `shawnnygoh` (user-provided).
- Tool: Codex CLI `0.166.0-alpha.5.1`; originator: Codex Desktop.
- Model/effort/service tier: `gpt-6.1-sol` / `high` / `default`, 4 turns.
- Session ID: `01a1a54d-b1df-7731-858d-69f894bdc138`.
- Token totals as of writing:

```json
{
  "input_tokens": 3510381,
  "cached_input_tokens": 3415168,
  "cache_write_input_tokens": 0,
  "output_tokens": 33590,
  "reasoning_output_tokens": 12646,
  "total_tokens": 3543971
}
```

## Key prompts
- “Docs only: no code, config or migration changes.” This constrained delivery to reviewable specifications.
- “State what must hold and how it's checked, not which files to write.” This required observable requirements and acceptance criteria instead of implementation steps.
- “A submission's code, answer key and grade stay as they were when it was made, and a Learner can still view their past submissions after the challenge is unpublished or archived.” This established historical preservation while leaving versioning versus locking to the integration spec.
- “The SYS criteria marked "Removed" were never merged, so renumber each requirement's criteria consecutively and drop the stubs; update any references.” This corrected premature ID permanence during drafting.

## Decisions and corrections
- Checked repository guides, workflows, configuration and Supabase clients against installed Next.js 16.4.3 documentation and Supabase SSR 0.12.7 sources.
- Defined 20 SYS requirements covering architecture, atomic profile provisioning, immutable roles, server authorization, RLS, environments, delivery and non-functional checks. Account journeys remain in separate stories.
- Replaced grading-only privileged access with a deny-by-default register naming grading, usage accounting and post-submission cached hints, each with authorization preconditions. Future specs may extend it through merged spec PRs.
- Added ownership rules for review flags, TA resolutions, cached hints, performance summaries and usage records. Preserved original grades and historical submission access.
- Corrected Vercel target IDs to GitHub environment variables; deferred further SoC settings to the first AI feature spec.
- Cut framework boilerplate, duplicate criteria and provenance; then removed unmerged stubs, renumbered criteria, added merge-time ID permanence and wrapped technical prose at 90 characters except tables.
- Final counts: README 49 lines/424 words; technical spec 370 lines/2,959 words. Links, references, numbering, tables and formatting checks passed.
- Lint, type checking and all 16 existing tests passed. `bun run verify` failed during build because Turbopack port binding was denied, including escalated retries. Playwright and Supabase integration checks were not run. No commits or hosted service access occurred.

## Files created or modified
- [workflow/specs/README.md](../../workflow/specs/README.md)
- [workflow/specs/TECHNICAL-SPEC.md](../../workflow/specs/TECHNICAL-SPEC.md)
