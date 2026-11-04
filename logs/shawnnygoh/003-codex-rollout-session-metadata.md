# Codex Rollout Session Metadata

## Goal
Replace guessed session-log metadata with a privacy-preserving Codex rollout parser and CLI. Backfill the two existing logs after confirming their rollout matches.

## Scope
Three task exchanges, plus a rollout-match confirmation, covering one focused task and its review corrections.

## Session metadata
Tool: Codex Desktop, CLI `0.166.0-alpha.5.1`. Model: `gpt-6.1-sol`. Reasoning effort: `medium` (3 turns). Service tier: `default` (3 turns). Session ID: `01a1a4fb-ff25-7af3-8c19-10af7759b124`. GitHub attribution: `shawnnygoh` (user-provided).

Token totals as of writing: input 1,533,937; cached input 1,475,712; cache-write input 0; output 23,011; reasoning output 5,275; total 1,556,948.

## Key prompts
- “Read them from Codex's rollout files instead.” This replaced reliance on the model's own knowledge with recorded session evidence.
- “keep parsing (pure, typed) separate from file discovery and the CLI.” This made the parser reusable for later aggregation without mixing filesystem access into parsing.
- “Never cat, head, grep, print or copy a rollout; inspect them only through the parser.” This restricted inspection and output because rollouts contain transcripts and account details.
- “attribute each thread_settings_applied to the turn it belongs to, and make the fixture match the real order.” This corrected service-tier attribution using real record tags and synthetic regression fixtures.

## Decisions and corrections
- Built against the supplied schema using Node APIs and no new dependencies. Kept separate threads visible even when they share a session ID; preferred environment-provided thread identity over repository fallback.
- The user confirmed log 001's five-turn `docs/github-pages` rollout and log 002's four-turn `ci/vercel-deploy` rollout before metadata edits. Changed only those sections and labeled their tokens as backfilled full-session totals.
- Review exposed first-turn service-tier misattribution. Record tags showed settings after the first context and between subsequent turns. Fixed active/next-turn attribution; both logs now show `default` throughout.
- Preserved the last usable token records and last valid end timestamp across missing or malformed data. Omitted Thread ID when equal to Session ID.
- Both finished sessions' token sources agreed in all six fields. This session's checked gap matched the latest per-response usage in every field. Kept thread usage preferred.
- Fixed environment typing errors caught by verification. Used Node 24 for checks. Final targeted tests (10), lint, typecheck, skill validation and diff checks passed. Full verification remained blocked by Turbopack's local port restriction, including escalation retries; it was not rerun after review fixes. No commits were made by the agent.

## Files created or modified
- `workflow/scripts/rollout-parser.ts`
- `workflow/scripts/rollout-files.ts`
- `workflow/scripts/rollout-summary.ts`
- `tests/unit/workflow/rollout.test.ts`
- `.agents/skills/session-log/SKILL.md`
- `logs/shawnnygoh/001-github-pages-product-site.md`
- `logs/shawnnygoh/002-vercel-github-actions-deployment.md`
