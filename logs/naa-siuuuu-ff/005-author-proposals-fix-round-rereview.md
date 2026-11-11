# Author Proposals Fix Round and Rereview

## Goal
Resume T-21 (#82) from the G3 stop: add the approved REV-01 test, fix every round-1 review finding, rereview with one verifier subagent, and hand the Docs stage to a new session.

## Scope
About seven user-assistant exchanges on one focused task: the T-21 high-route feature loop from G3 through the rereview.

## Session metadata
Tool: Claude Code (VS Code extension). Model: Claude Opus 5.5 (`claude-opus-5-5`). Reasoning effort: unknown. Session ID: unknown. Token totals: unknown. Verifier subagent: 102,797 tokens, from its task notification.

## Key prompts
- "I choose (a). Continue" — Approved the REV-01 integration test for the private ledger and validator grants and the SQL revalidation branch, instead of accepting read-only psql evidence.
- "Add 3 key tests (Recommended)" — The answer to the rereview test-gap question. It approved pinning REV-03 focus, REV-07's 504 `AI_TIMEOUT` and REV-08 reload behaviour, and accepted the other P3 fixes without committed tests.
- "Is it possible to handoff from here to another agent? if it is too risky and too much context transferring, leave it, otherwise handoff please" — Asked for the Docs stage to move to a fresh session through the feature handoff.

## Decisions and corrections
- G3 (a): the agent added two "database boundary" tests. One checks grants on `private.author_proposal_requests` and `private.valid_injected_proposals`. The other intercepts the real `complete` call to send six tampered payloads, which must fail with `INVALID_AI_OUTPUT` and save nothing. The human committed them as 35b9ae2.
- Fix round 1 in the main session (generator), covering REV-02 to REV-07 and SEC-REV-01:
  - Proposals now render through the shared `CodeDiffView`, which gained `label`/`showPath` props and a `proposalDiff` helper.
  - Focus moves to the "Proposal preview" heading on arrival, and the arrival message is set after mount.
  - Other fixes: a preview conflict state, "Try again" with current versions, a consistent preview reread, a recorded `FORBIDDEN` failure (SQL `fail` now skips the role check), and SQL `AI_TIMEOUT` for an expired operation.
  - Checks: unit, integration, e2e (6/6), lint and typecheck all passed.
- The rereview used ONE fresh verifier subagent applying both review skills, as the earlier workflow decision requires. Tree digests before and after matched. All eight findings were resolved, and the verifier added a new P3, REV-08: a reload re-announced generation. The main session fixed REV-08 afterwards; that change was not rereviewed.
- The human approved three gap tests, committed as 22261b0. Mutation checks showed the REV-03 and REV-08 tests fail without their fixes. REV-07 was not mutation-tested.
- Docs had not started when the human asked for a handoff. The handoff's Next action now spells out Docs, close-out and the G4 commit order for a new session.

## Files created or modified
- tests/integration/author/proposals.test.ts
- tests/unit/author/proposal-preview.test.tsx
- tests/unit/author/proposals-route.test.tsx
- tests/unit/author/proposal-diff.test.ts
- src/components/code-diff.tsx
- src/components/author/proposal-preview.tsx
- src/components/author/generate-proposals.tsx
- src/components/author/author-routes.tsx
- src/lib/author/preview.ts
- src/server/author/proposals.ts
- src/app/globals.css
- supabase/migrations/20261112120000_author_proposals.sql
- src/lib/supabase/database.types.ts (regenerated)
- workflow/PLAN.md
- workflow/handoffs/82-author-proposals.md
