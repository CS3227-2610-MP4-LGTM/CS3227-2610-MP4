# Author proposals: plan to first review

## Goal
Take T-21 (#82, generate, preview and decide flaw proposals) from Ready through Plan, Tests, Implement and the first review on the high route.

## Scope
Six user exchanges on one focused task. The session stopped at G3 after review round 1 and handed the remaining work to a new session.

## Session metadata
Claude Code (VS Code extension), model Claude Opus 5.5 (`claude-opus-5-5`), reasoning effort unknown, session ID `8b309868-fc90-4ff5-b9b0-bb18d9882d8e`. Subagent token totals: reviewer 147,546 and security reviewer 102,278. The session's own token total is unknown.

## Key prompts
- "You are the orchestrator for T-21 (#82) … Stop at G1" (pasted brief): plan in the main session, never commit, check gate commits with `git log`, review with fresh subagents.
- "Carry on" / "Continue": moved the work through G1, Tests and Implement.
- "that agent should switch to … just 1 subagent as a verifier, generator and verifier architecture (more token efficient)": changes the review workflow for the remaining stages.
- "log this session into a log file using the log skill".

## Decisions and corrections
- Plan: the T-21 entry adds `GET /preview`. A successful generation and each decision increment both versions. The page lives at `/proposals`. The `inject_flaws` cap is unchanged. The human committed c3cfbff.
- Tests: `next build` type-checks `tests/`, so two component tests switched to `import.meta.glob`. The e2e denial test was strengthened.
- The agent refused to implement before the G2 commit existed. The human then committed 15cdad9, and its hashes matched.
- Implement: added an admin-only `persist_author_proposals`, a user-scoped `decide_author_proposal`, a private replay ledger and an SQL validator. Also added routes, the service, a final-preview and diff builder, and UI. A 320px overflow was fixed with CSS. Results: unit 1,150, integration 464 and Author e2e 6/6, all passing.
- Review round 1: the digest matched, and there were no P0 or P1 findings. REV-01 (= SEC-REV-02, private surfaces untested) needs G3. REV-02 and REV-03 also block. Five P3 findings were recorded, and T-21 is `blocked`.
- The user switched to a generator plus one-verifier workflow and a new-session handoff, recorded in the handoff and in memory.

## Files created or modified
- workflow/PLAN.md
- workflow/handoffs/82-author-proposals.md
- tests/unit/author/final-preview.test.ts
- tests/unit/author/proposal-requests.test.ts
- tests/unit/author/proposal-client.test.ts
- tests/unit/author/generate-proposals.test.tsx
- tests/unit/author/proposal-preview.test.tsx
- tests/unit/author/configuration-generation.test.tsx
- tests/integration/author/proposals.test.ts
- tests/e2e/author/proposals.spec.ts
- supabase/migrations/20261112120000_author_proposals.sql
- src/lib/supabase/database.types.ts
- src/lib/author/preview.ts
- src/lib/author/drafts.ts
- src/server/author/proposals.ts
- src/server/author/drafts.ts
- src/server/author/responses.ts
- src/app/api/v1/author/challenges/[id]/proposals/route.ts
- src/app/api/v1/author/challenges/[id]/proposals/[proposalId]/route.ts
- src/app/api/v1/author/challenges/[id]/preview/route.ts
- src/app/author/challenges/[id]/proposals/page.tsx
- src/app/author/challenges/[id]/page.tsx
- src/app/globals.css
- src/components/author/generate-proposals.tsx
- src/components/author/proposal-preview.tsx
- src/components/author/flaw-configuration.tsx
- src/components/author/use-draft-editor.ts
- src/components/author/challenge-detail.tsx
- src/components/author/author-routes.tsx
- src/components/author/client.ts
- src/components/author/notices.ts
