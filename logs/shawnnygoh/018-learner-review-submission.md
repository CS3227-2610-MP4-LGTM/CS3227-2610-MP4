# T-11 Learner Review Submission

## Goal

Deliver issue #50 so a Learner can draft line comments, submit one immutable first attempt, and open the pending result with pinned code and read-only comments.

## Scope

16 recorded Codex turns focused on one feature, from planning through the merge and documentation.

## Session metadata

- Tool: Codex 0.167.0-alpha.3.2 (Codex Desktop)
- Model: gpt-6.1-sol, medium reasoning, default service tier (16 turns)
- Session ID: `01a1bad1-5fba-7643-9b28-52dd927a03ab`
- Token totals as of writing: input 132301792, cached input 131222784, cache-write input 0, output 88603, reasoning output 24528, total 132390395

## Key prompts

- “Use sdd-orchestrate for issue #50: PLAN task T-11, LRN-03 (manage line comments) and LRN-04 (submit a final review).” This started the high-route workflow at Plan.
- “The workspace-account header is optional on the POST, but when present it must be a UUID that matches the verified caller, or the route rejects the request before the RPC with no write.” This bound workspace submissions and replays to the loaded account while preserving headerless callers.
- “Rename supabase/migrations/20261108140000_learner_submissions.sql to 20261109120000_learner_submissions.sql (content unchanged) and update its references in the handoff.” This placed T-11 after the TA migrations already on hosted dev.
- “run it with --repeat-each=10 on the merged tree and on a clean upstream/master worktree (f5d57f9), production build each time.” This tested whether the TA keyboard flake predated T-11.

## Decisions and corrections

- Kept drafts in page memory behind one leave guard, with native reload warnings and bypasses for success and unrefreshable expiry. Used one user-scoped transaction and a private idempotency ledger. Submission creates no grading run.
- Preserved the approved tests through supplemental G2. Round 1 kept transient checks frozen, enforced line order, recorded invalid-line outcomes, normalized UUID comparisons, and fixed origin, account and validation handling. Both scoped rereviews passed.
- Preserved upstream role-denied recovery in the merge and regenerated types from LGTM's reset schema. Narrowed the accounting grant test with approval. Lint, typecheck, schema lint, 611 unit tests and 250 integration tests passed.
- Production Chromium passed 31/32. The TA keyboard journey passed 8/10 on merged and 4/10 on upstream, so TA code and tests were left intact. Docs and PLAN status were committed in `e6f9a5f`. Full G4 validation was unverified.

## Files created or modified

- `workflow/PLAN.md` and `workflow/handoffs/50-learner-review-submit.md`
- Learner workspace, result page, submission route, shared account UI and server contracts under `src/`
- `supabase/migrations/20261109120000_learner_submissions.sql` and `src/lib/supabase/database.types.ts`
- Learner unit, integration and browser tests, plus `tests/integration/llm/accounting.test.ts`
- `README.md` and `docs/DeveloperGuide.md`
