# Author drafts fix round and close-out

## Goal
Take T-20 (#81, Author challenge drafts) from review fix round 1 through re-review, docs, close-out and the rebase onto `upstream/master`.

## Scope
Eight user exchanges on one focused task: resume, fix round, close-out, then e2e triage and the rebase.

## Session metadata
Claude Code (VS Code extension), model Claude Opus 5.5 (`claude-opus-5-5`), reasoning effort unknown, session ID `bbded11a-1d8f-4ea4-b2d8-f3d7f59c59a8`.

## Key prompts
- "Continue the other agents work from here" (with the prior agent's handoff summary pasted) — resumed T-20 at fix round 1 using `workflow/handoffs/81-author-drafts.md` as the source of truth.
- "You can run git log yourself and check it next time too. Carry on" — after the supplemental test commit, told the agent to verify gate commits itself instead of asking for IDs.
- "Leave REV-06 as a minor issue. Go ahead and write the log, and make the PR. … create a handoff document for another agent" — accepted the last finding and asked for the log, PR and a handoff.
- "Dont hand off until your code changes are rebased and the pr is created" — kept the session going through upstream integration.

## Decisions and corrections
- Supplemental tests went into three new files; G2 files stayed untouched. REV-01, REV-03, REV-04 and REV-05 tests failed first; the REV-02/SEC-REV-01 and SEC-REV-02 surface tests already passed, as planned. The human committed them as 479b7a8.
- Fixes: reject U+0000; order categories by vocabulary; compare trimmed text for edits; accept expected versions up to 2,147,483,647 in the migration. Targeted checks passed.
- Fresh reviewer and security-reviewer subagents re-reviewed with only prior finding IDs. The tree digest matched before and after. All six findings were resolved, and one new P3 was raised (REV-06: a bigint cast shares an OR chain with its regex guard). A local probe could not reproduce it. The human accepted it as a minor issue.
- The docs stage added an “Author challenge drafts” section to the DeveloperGuide. The PLAN T-20 status was set to done, and the human committed 9cec6c9 (feat) and c2a1af1 (docs).
- The agent kept rebase, push and PR creation with the human, per AGENTS.md. The human ran the rebase; the agent resolved `src/server/learner/submissions.ts` (upstream's new functions kept, moved helpers re-exported), regenerated types and renamed the migration to `20261111120000_author_drafts.sql` to avoid upstream's same-version `learner_grading` migration.
- E2E: the human's first run failed because Docker was off; the agent started it. A second failure came from the agent running Playwright concurrently, which deleted artifacts; the spec passed alone. On the rebased tree: unit 1054/1054, integration 404/404, e2e 62/63, with one TA sign-in hang that passed on rerun.
- Gate commits are now checked with `git log` directly.

## Files created or modified
- tests/unit/author/review-fixes-requests.test.ts
- tests/unit/author/review-fixes-forms.test.tsx
- tests/integration/author/review-fixes.test.ts
- src/lib/author/drafts.ts
- src/components/author/draft-fields.tsx
- supabase/migrations/20261111120000_author_drafts.sql (renamed)
- src/server/learner/submissions.ts
- src/lib/supabase/database.types.ts
- docs/DeveloperGuide.md
- workflow/PLAN.md
- workflow/handoffs/81-author-drafts.md
