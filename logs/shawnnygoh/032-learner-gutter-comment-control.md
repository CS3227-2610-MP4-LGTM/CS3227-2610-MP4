# Learner gutter comment control

## Goal
Fix #112 by replacing per-line full-width comment buttons with compact gutter controls, preserving accessibility and comment behavior. Update the User Guide and validate the change without committing.

## Scope
Two task-focused user-assistant exchanges: implement and verify the fix, then record this session for `shawnnygoh`.

## Session metadata
Tool: Codex, CLI `0.167.0-alpha.3.2`, originator Codex Desktop.
Model: `gpt-6.1-sol`; reasoning effort: medium; service tier: default; 2 turns.
Session ID: `01a1d0df-7140-78e2-9d89-1f268d030d1d`.

Token totals as of writing:
- Input: 1200075
- Cached input: 1142400
- Cache-write input: 0
- Output: 4674
- Reasoning output: 822
- Total: 1204749

## Key prompts
- “Fix #112: on the Learner review page, replace the full-width "Add comment" button under every code line with a compact gutter control, GitHub-style.” This scoped the work to control placement and visibility within the existing review flow.
- “Hide it with opacity or similar, never display:none or visibility:hidden, so it stays in the tab order.” This required hover-based styling that preserves keyboard access.
- “CodeDiffView is shared by Author, TA and other Learner pages.” This required an optional extension that preserves other callers' rendering and an explicit shared-component report.
- “Checks: run the affected unit tests, lint and typecheck.” The accompanying conditional e2e requirement called for review and retry tests repeated three times when local Supabase was available.

## Decisions and corrections
- Verified #112 was open and used the low workflow route for placement and styling. Kept the checked-out branch and made no commits.
- Added an optional `gutterControl` slot to `CodeDiffView`. The Learner review supplies one 24×24 px plus button per commentable line; comments and editors remain below their line.
- Preserved accessible names, disabled conditions, focus-return logic and existing test locators. Hover-capable devices reveal controls on row hover or focus; devices without hover keep them visible. Existing focus-ring styling applies.
- Clarified the User Guide wording to say “devices without hover”; its whitespace-delimited word count increased by 34, from 5,619 to 5,653.
- Initial checks used the host's Node 25; reran unit tests, lint and typecheck with the available Node 24 installation. All passed: 40 unit tests across four files.
- Sandbox restrictions initially prevented GitHub and local Supabase access. Approved reruns confirmed the stack was available; both requested e2e files passed with `--repeat-each 3` (18 runs). Full verify and the full e2e suite were not run.

## Files created or modified
- `src/components/learner/review-draft.tsx`
- `src/components/code-diff.tsx`
- `src/app/globals.css`
- `docs/UserGuide.md`
