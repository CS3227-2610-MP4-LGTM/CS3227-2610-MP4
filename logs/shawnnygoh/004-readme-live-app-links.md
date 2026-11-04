# README Live App Links

## Goal
Update the README with prominent production and development app links and an accurate repository layout, preserving its existing style and length.

## Scope
Two user-assistant exchanges covering one focused documentation task and its session log.

## Session metadata
- Tool: Codex, CLI version `0.166.0-alpha.5.1`, originator `Codex Desktop`.
- Session ID: `01a1a514-237c-7b00-a0e4-ea4f5a8e3875`.
- Model settings: `gpt-6.1-sol`, reasoning effort `low`, service tier `default` (2 turns).
- Token totals as of writing: input `164019`, cached input `150784`, cache-write input `0`, output `612`, reasoning output `8`, total `164631`.

## Key prompts
- “Update README.md only:” limited the implementation to the README.
- “Add the live app: production https://lgtm-cs3227.vercel.app (deployed from release tags) and development https://lgtm-cs3227-dev.vercel.app (deployed from master). Put them where a reader looks first.” specified both destinations, deployment sources and prominent placement.
- “Fix the Repository layout table: add workflow/ and logs/, and describe .github/workflows/ as CI and deployment. Describe only what exists in the repo today.” required checking the current directories before describing them.
- “Keep the README's existing style and length.” called for a small, consistent documentation edit.

## Decisions and corrections
- Added production and development links immediately after the introductory paragraph, with their deployment sources.
- Inspected the repository and described `workflow/` as scripts for parsing and summarizing agent rollouts, `logs/` as per-member session logs, and `.github/workflows/` as CI and deployment.
- `bun run verify` passed lint, typecheck, all 16 tests and the production build. `git diff --check` passed. End-to-end tests were not run.
- No corrections or rejected tool calls occurred. Used the explicitly supplied GitHub username `shawnnygoh` for this log; no commit was made.

## Files created or modified
- `README.md`
