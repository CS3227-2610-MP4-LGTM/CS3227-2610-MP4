# Author Lifecycle Review to Close-out

## Goal
Resume T-23 (#84, unpublish and archive) at the G3 stop after Review, resolve the verifier's findings S-01, R-01 and R-02, re-review, write Docs and reach Close-out with a PR.

## Scope
Six user-assistant exchanges on one focused task: the T-23 high-route loop from the G3 decision to the open PR, plus this log.

## Session metadata
Tool: Claude Code (VS Code extension). Model: Claude Opus 5.5 (`claude-opus-5-5`). Reasoning effort: unknown. Session ID: unknown. Token totals: unknown.

## Key prompts
- "Continue on from here, let me know what else you need" — Pasted the previous session's Review summary, the Learner flake investigation and the creation of issues #96 and #97, so the agent resumed at the pending G3 decision.
- "continue, i am done witht hat" — Confirmed the G3 test commit, so the agent checked it with `git log` and then implemented the S-01 fix.
- "Everything passed (verify and e2e). I have run your commands. continue from here, with whatever is left. Also, how can I manually access the website?" — Reported G4 checks and commits, and asked the agent to finish the remaining close-out work and explain local access.

## Decisions and corrections
- G3: the human chose Option A for S-01 (record failed lifecycle outcomes in the ledger and replay them, per INTEGRATION-SPEC §3) and to add the R-01/R-02 tests now.
- The agent found S-01 was worse than the Review said. A failed archive with `expectedRowVersion` one version ahead was not recorded, so replaying its key after a separate unpublish reached that version would archive the challenge. One new test covers this.
- Tests (commit 0a63144): two S-01 replay tests failed first (no ledger row after a failure); the 14 direct-RPC invalid-payload cases (R-01) and the 18 route 400/413 cases (R-02) already passed.
- The first Edit attempt was rejected because the test file had not been read in this session; the agent read it and re-applied the same edits.
- Fix: the migration now records `version_conflict`/`invalid_state` with a null row version and returns them on replay. After `db:reset` + `db:types`: Author integration 218 pass, Author unit 392 pass, lint and typecheck clean.
- The verifier subagent was interrupted when the session ended; the agent checked that the tree fingerprint had not changed (959fe1c33cb525e1) and resumed it. Re-review: all criteria met, no regression, fingerprints matched. New P3 REV-03: a flaky `livePublished()` setup (publish returned 409 in 1 of 3 full Author integration runs).
- Docs: a new "Author unpublish and archive" Developer Guide section. The agent corrected its own claim that the e2e checks the Learner catalogue (it checks the challenge page).
- The agent flagged an uncommitted `.claude/settings.json` change that removes commit/tag/rebase/PR-create denies and advised not committing it.
- G4 (human): verify and Author e2e passed; commits 13e21c9 `feat(author)` and bcc20e1 `docs(author)`; PR #98 opened.

## Files created or modified
- tests/integration/author/lifecycle.test.ts
- supabase/migrations/20261114120000_author_lifecycle.sql
- docs/DeveloperGuide.md
- workflow/handoffs/84-author-lifecycle.md (uncommitted)
