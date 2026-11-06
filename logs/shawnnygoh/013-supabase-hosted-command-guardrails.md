# Supabase hosted command guardrails

## Goal
Close issue #20's hosted Supabase CLI guardrail gaps for Codex and Claude while preserving the repository's required local commands.

## Scope
3 user–assistant task exchanges, plus an inline scope approval; one focused task covering implementation, review fixes and session logging.

## Session metadata
- Tool: Codex CLI 0.167.0-alpha.3.2; originator: Codex Desktop.
- Model/settings: gpt-6.1-sol, high reasoning effort, default service tier — 3 turns.
- Session ID: `01a1b10a-af48-7ed1-8d6a-2c2b4d84ec67`.
- Token totals as of writing: input_tokens: 2048260; cached_input_tokens: 1958272; cache_write_input_tokens: 0; output_tokens: 18414; reasoning_output_tokens: 7663; total_tokens: 2066674.

## Key prompts
> Task: close the guardrail gap in issue #20.

This requested coverage beyond existing link, push, dump and hosted reset denials, including plain, bunx and npx invocations.

> Constraints: guardrail files only, plus the DG guardrails text if it lists the denied commands. No changes to scripts or workflows.

This limited the implementation to agent controls and their documentation.

> not_match is for commands agents may run; keep the gaps documented only in the rules comment and the DG.

This corrected the initial use of forbidden hosted forms as negative examples and kept policy limitations separate from permitted commands.

## Decisions and corrections
- Verified issue #20 was open and audited pinned Supabase CLI 3.0.0 help. Hosted administration defaults to linked projects where applicable; database, migration, type-generation and inspection commands default locally.
- The user approved broad denials, including optional local uses of hosted-capable commands. Preserved required local reset, lint, type generation, migration creation, function development and repository `db:*` scripts.
- Initial help inspection failed because telemetry writes were outside the sandbox; approved escalation allowed help reads. Existing guardrails rejected `link --help`, `db push --help` and `db dump --help`; their denials remained intact.
- Mirrored 174 literal Supabase prefixes in Claude settings, retaining wildcard coverage for trailing and attached hosted flags. Documented Codex gaps for attached values, reordered flags and preceding global options.
- Review fixes removed all 15 hosted-gap `not_match` examples and leftover blank lines, and shortened the DG to linked rule files, examples, local commands and residual limitations.
- Confirmed first-position runner alternatives with the installed policy engine, then merged nine bunx/npx pairs. Final count: 28 rules total, including 18 Supabase rules.
- Validation passed: 204 match and 281 not_match examples, 369 distinct native policy checks, unchanged prefix coverage, Claude prefix parity and `git diff --check`. An intentionally invalid inline example was rejected. App lint, typecheck, tests and build were not run. No scripts or workflows changed; the agent made no commits.

## Files created or modified
- `.codex/rules/guardrails.rules`
- `.claude/settings.json`
- `docs/DeveloperGuide.md`
