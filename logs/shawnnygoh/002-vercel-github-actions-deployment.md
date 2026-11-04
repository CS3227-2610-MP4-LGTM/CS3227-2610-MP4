# Vercel Deployment through GitHub Actions

## Goal
Add development and production deployment workflows, a minimal LGTM landing page, and deployment documentation. Leave reviewable changes without committing or running hosted deployment commands.

## Scope
Four task exchanges covering one deployment task, two revisions, and session logging.

## Session metadata
Tool: Codex. Exact model: unknown. Reasoning effort: unknown. Session ID: unknown. GitHub attribution: `shawnnygoh` (user-provided).

## Key prompts
- “Task: add Vercel deployment via GitHub Actions. Leave a reviewable diff; don't commit.” This established the deployment work and required human control over commits.
- “Rewrite the DG Deployment section to be much shorter.” This requested a compact operational reference instead of a YAML walkthrough, while preserving the approved workflows and page.
- “VERCEL_TOKEN will be a project-scoped token.” This identified an account-resolution limitation and required replacing CLI alias assignment with the REST API.
- “Write a session log for this session using the session-log skill.” This requested a numbered record attributed to `shawnnygoh`.

## Decisions and corrections
- Added development deployment on pushes to `master` and manual dispatch, using Preview configuration, migrations first, and a stable development alias. Production deploys `v*` tags only after checking that the tagged commit is reachable from `master`.
- Matched CI's pinned setup actions, Bun version check, and Node version file. Pinned Vercel CLI to `65.11.0` after reviewing release notes. Kept deployment jobs separate from CI verification.
- Scoped credentials to individual steps. Migration commands use the pinned Supabase CLI v3 through Bun and skip when no SQL migrations exist. No hosted database or Vercel commands were run.
- Configured Singapore (`sin1`), disabled Git-triggered Vercel deployments, and configured no crons. Replaced starter content and metadata; removed five unused SVG assets.
- Shortened documentation following user feedback. Recorded production approval, releases through GitHub releases targeting `master`, development's master-only environment restriction, and GitHub/Vercel configuration names. Removed the selected-ref claim and CLI version narration.
- Replaced only the development alias step with the v2 deployment aliases POST. Authorization passes through stdin; the deployment hostname comes from the captured URL with its scheme stripped; JSON remains literal. HTTP failures fail the step. Updated the token description to specify project scope.
- `bun run verify` passed after each revision. YAML, shell syntax, mocked alias behavior, and diff checks passed. `actionlint` was unavailable; live deployment and migration behavior remain unverified. No commits were made by the agent.

## Files created or modified
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-prod.yml`
- `vercel.json`
- `docs/DeveloperGuide.md`
- `src/app/page.tsx`
- `src/app/layout.tsx`
- Removed `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, and `public/window.svg`.
