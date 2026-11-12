# Author Lifecycle CI Fix and Merge

## Goal
Get T-23 PR #98 merged: diagnose its failing `integration` CI job, fix the cause, and close out with a PLAN update, this log and a handoff for the next agent.

## Scope
Ten user-assistant exchanges on one focused task, continuing from log 008: PR #98 from CI failure to merge.

## Session metadata
Tool: Claude Code (VS Code extension). Model: Claude Opus 5.5 (`claude-opus-5-5`). Reasoning effort: unknown. Session ID: unknown. Token totals: unknown.

## Key prompts
- "It has been merged (except for the chore commit), continue" — The user believed PR #98 was partly merged; the agent checked the commit ancestry and showed the screenshot was PR #99's merge, then watched PR #98's CI.
- "Done, continue please" — Confirmed the diagnostic test commit was pushed, so CI could show the failing response body.
- "I want to handoff to another agent from here. Push your session log, and give me intstructions for the next agent" — Asked for close-out. Agents never push, so the agent prepared the log and PLAN change for the human to commit and push.

## Decisions and corrections
- PR #98 `integration` failed on all three CI runs: the setup publish in late lifecycle tests returned 409. The agent ruled out #99 (the first failing run predated it), AI limits (429, not 409) and unawaited settlement. Local runs passed until the agent forced CI's file order (publication → proposals → schema → lifecycle) with a temporary Vitest sequencer config.
- The human committed a285e49 so `ok()` shows the response body; CI then showed `VERSION_CONFLICT`. Temporary logging showed the cause: `authorCapture` in `src/server/llm/boundary.ts` read `proposal_decisions` without `order`, the post-dispatch recapture returned the rows reversed, and the fingerprint changed while stored versions stayed 4/4. This is a real T-22 publish bug, not a test flaw.
- G3: the human chose to fix it in PR #98. The agent wrote a test whose client proxy alternates unordered decision row order (c98d9db); it failed 2/2 without the fix and passed with it. Fix 5102194 adds `.order("proposal_id")`. Checks: unit 1297, integration 578, CI-order repro 5/5, lint and typecheck clean.
- A fresh verifier found no findings and confirmed SEC-02.2 staleness detection is intact. The agent withdrew its proposed TA issue after checking that every other fingerprinted read is ordered or order-insensitive.
- CI went green; the human merged PR #98 (`f6f2e15`), closing #84. The T-23 feat commit had not set PLAN status to done, so this close-out does.
- The agent reset the local database twice after test runs hung creating fixture accounts (running the lifecycle file twice in a row triggers this). It flagged an uncommitted `.claude/settings.json` change that loosens agent git denies; it remains uncommitted.

## Files created or modified
- tests/integration/author/lifecycle.test.ts (diagnostic `ok()` message)
- tests/integration/author/publication.test.ts
- src/server/llm/boundary.ts
- workflow/PLAN.md (T-23 status)
- workflow/handoffs/84-author-lifecycle.md (uncommitted)
