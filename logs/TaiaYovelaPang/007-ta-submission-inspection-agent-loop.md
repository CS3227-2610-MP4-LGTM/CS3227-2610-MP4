# T30 TA Submission Inspection

## Goal
Implement T-30: protected TA submission browsing and retained assessment inspection, then validate and review the feature through the high-route workflow.

## Scope
Nine user-assistant exchanges covering one feature, validation recovery, token-accounting correction and logging.

## Session metadata
- Tool: Codex, CLI `0.166.0-alpha.5.1`; originator: Codex Desktop.
- Model/settings: `gpt-6.1-sol`, medium effort, default service tier; 9 turns.
- Session ID: `01a1bb2a-5e27-7b81-8ba7-c85462e03a93`.
- Token totals as of writing (`2026-11-08T14:13:37.343Z`): input `24995248`; cached input `24768128`; cache-write input `0`; output `55230`; reasoning output `15516`; total `25050478`.
- Source: `bun --no-env-file workflow/scripts/rollout-summary.ts --id 01a1bb2a-5e27-7b81-8ba7-c85462e03a93`. These are cumulative main-thread totals, not a sum of agent totals.

## Key prompts
- “Implement T30” requested the existing planned feature, preserving its requirements, stage boundaries and human gates.
- “why is token usage unavailable?” challenged missing accounting and prompted recovery of verified rollout totals.
- “log” requested this numbered session record after implementation and recovery reviews.

## Decisions and corrections
- Verified open issue #53 and upstream base `27fd1b0`; created `feat/53-ta-inspection`. Used specialist test, implementation, review, security and docs agents.
- Implemented bounded/filter-bound pagination, pinned real diffs through the shared renderer, private answer/assessment evidence, original/effective grades, read recovery and validated return links. Inspection starts no grading or moderation mutation. Added no dependencies.
- Used local Supabase only. Applied the TA read function and the already-merged learner migration missing locally; regenerated database types without resetting data. Used cached Node 24.
- Human committed acceptance tests as `4c0b070`. Human approved correcting the unique embedded grade relationship from an array expectation to an object, committed as `0c05f41`.
- Initial checks passed: 209 targeted units, 15 TA and 75 adjacent integration cases, seven production browser journeys, lint and typecheck. Concurrent unit timeouts cleared with two workers.
- Human full browser validation then reported 25 passes and two failures. Restored the dropped TA signup notice and excluded its recognized parameter from API filters. Trace analysis showed the retry test counted an outstanding landing read; human approved a settled-list wait, committed as `0258d43`, preserving the exact two-read assertion.
- Recovery passed 107 units, both affected production browser journeys, lint and typecheck. Fresh correctness/security reviews found no findings; tree hashes matched. Docs remained accurate. Full human verify/browser rerun and feature/docs/log commits remain pending.
- Replaced unjustified “unavailable” token entries with script-reported totals and recorded cumulative snapshot caveats.

## Files created or modified
- `src/app/ta/submissions/`, `src/app/api/v1/ta/submissions/`.
- `src/components/ta/`, `src/lib/ta/`, `src/server/ta/`.
- `src/app/globals.css`, `src/lib/supabase/database.types.ts`.
- `supabase/migrations/20261108090000_ta_submission_page.sql`.
- `tests/unit/ta/inspection/`, `tests/integration/ta/inspection/`, `tests/e2e/ta/inspection/`.
- `vitest.integration.config.mts`.
- `README.md`, `docs/DeveloperGuide.md`.
- `workflow/PLAN.md`, `workflow/handoffs/53-ta-inspection.md`.
