# Learner Progress Agent Loop

## Goal
Implement T-32 / issue #55 on a separate feature branch: the TA learner directory/detail shell, original first-attempt category progress and deterministic recommendations.

## Scope
17 user–assistant exchanges covering one feature, its review and validation recovery, and this log.

## Session metadata
- Tool: Codex, CLI `0.166.0-alpha.5.1`; originator: Codex Desktop.
- Session ID: `01a1c091-374c-7eb3-a1cb-f9bed4b9edae`.
- Reported turn settings: `gpt-6.1-sol`, medium effort, default service tier (16 turns); same model/effort, unknown service tier (1 turn).
- Token totals as of writing: input `46368250`; cached input `46069248`; cache-write input `0`; output `91217`; reasoning output `35156`; total `46459467`.
- Metadata obtained using `bun --no-env-file workflow/scripts/rollout-summary.ts` immediately before writing.

## Key prompts
- “Implement T32 in another feat/ branch” requested the feature in an isolated branch.
- “Agents never commit, push, tag, rebase, open or merge PRs, or discard work.” retained Git delivery and acceptance-test commits with the human.
- “log” requested a numbered record of this session.

## Decisions and corrections
- Created `feat/55-learner-progress` from verified upstream master. Used the high route with separate test, implementation, correctness, security and documentation roles; human test commits preceded implementation and approved baseline changes.
- Used a checksum-verified temporary Node 24 runtime after Bun/jsdom worker failures. The human created missing local environment configuration; agents did not read/edit environment files. Applied local migrations without resetting data, repaired verified pagination history, and documented remaining pre-existing history gaps. No hosted database or live LLM calls.
- Human-approved test repairs corrected a nonexistent assessment join, mock callback typing, asynchronous readiness, hidden Next.js Activity DOM selection, and legacy wildcard profile reads.
- Independent reviews blocked shared card-category ordering, inherited timestamp SELECT access and disappearing `__proto__` query fields. Added committed regressions, fixed all three, and passed both rereviews. Documentation covers implemented behavior; summary generation remains T-33.
- Passed 192 TA units, 53 TA plus 31 auth integrations, nine production browser journeys, lint, typecheck and build. Review batches preserved tree digests.
- Human full validation later reported four unit timeouts and one stale account-directory expectation. The approved browser correction now checks the seeded learner and passes its production journey; the human committed it as `415e970`. The three timed-out files pass 48/48 under default and two-worker targeted runs. Full-suite retry with `VITEST_MAX_WORKERS=2` remains unreported; no timeout/config changes were made. Recovery review, final feature/docs commits and PR remain pending.

## Files created or modified
- `src/app/ta/learners/`, `src/app/api/v1/ta/learners/`.
- `src/components/ta/`: learner list/detail/routes, shared read transport, inspection route and submission links.
- `src/lib/ta/progress.ts`, `src/server/ta/progress.ts`, `src/lib/supabase/database.types.ts`.
- `supabase/migrations/20261109160000_ta_learner_progress.sql`.
- `tests/{unit,integration,e2e}/ta/progress/`, `tests/integration/auth/core.test.ts`, `tests/e2e/account/journeys.spec.ts`.
- `README.md`, `docs/DeveloperGuide.md`, `workflow/PLAN.md`, `workflow/handoffs/55-learner-progress.md`.
