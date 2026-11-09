# Per-turn token records

## Goal

Add per-response usage to the rollout summary CLI for issue #68 so the team can study prompt-cache misses after idle periods.

## Scope

Two user–assistant exchanges on one workflow chore, including this log.

## Session metadata

- Tool — Codex Desktop, CLI `0.167.0-alpha.3.2`
- Model — `gpt-6.1-sol`, medium reasoning effort, default service tier, 2 turns
- Session ID — `01a1bfc6-21c7-77a2-8fe4-e31d9bca23b5`
- Token totals as of writing — input 1186164, cached input 1115904, cache-write input 0, output 12131, reasoning output 3499, total 1198295

## Key prompts

> `--per-turn` uses the same selection flags as today (--id, --path, latest) and outputs one record per model response, in order:

This kept file selection consistent with the session summary and made rollout order the basis for measuring response gaps.

> The token counts are per response, not cumulative: if the rollout only records running totals, derive the differences. Mark compaction events if the rollout records them. Use allowlisted fields only and never output message content.

This required the parser to distinguish response usage from running totals, retain compaction context, and project only measurement fields.

> Default output follows the script's current style; `--format csv` prints a header row plus one line per response. Reuse rollout-parser and rollout-files, with no new dependencies.

This set pretty-printed JSON as the default and added CSV for analysis using the existing modules.

> Extend tests/unit/workflow/rollout.test.ts with synthetic rollouts covering ordering, gaps, cumulative-to-delta conversion, missing or partial usage, and split threads. Add one line to the DG's token-measurement section linking the option, without restating it. Report the word-count change for the DG.

This kept fixtures synthetic and limited the Developer Guide change to a link.

## Decisions and corrections

- The sandboxed GitHub lookup could not connect. The read-only retry confirmed issue #68 was open.
- Preferred response usage records when present and used legacy token-count snapshots otherwise. Linked compactions by response ID when available and marked unlinked events on the next response.
- Kept the existing single-file selection for split threads. A detected continuation starts with an unknown cumulative baseline. An explicit path treats the file as standalone and starts at zero.
- All four new synthetic scenarios failed before implementation. All 23 rollout tests, lint, typecheck, and the diff check passed afterward. Full verification and end-to-end tests were unrun. The Developer Guide grew from 6,472 to 6,474 words by `wc -w`.

## Files created or modified

- `workflow/scripts/rollout-summary.ts`
- `workflow/scripts/rollout-parser.ts`
- `workflow/scripts/rollout-files.ts`
- `tests/unit/workflow/rollout.test.ts`
- `docs/DeveloperGuide.md`
