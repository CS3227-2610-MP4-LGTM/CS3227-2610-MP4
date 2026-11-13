# #84 — author-lifecycle

- **Route:** high
- **PLAN task(s):** T-23 (committed at G1 in ae3e7db)
- **Branch:** feat/84-author-lifecycle (created from `upstream/master` by the agent, local only)
- **Base commit:** 115d49c8767e0584b3da8474c7c045349e92441e (`upstream/master`, after T-22 merged as PR #95)
- **Status:** done

Keep at `workflow/handoffs/<issue>-<slug>.md`. Only the orchestrator updates it.
Record the current state, not a transcript. Omit command output, stack traces
and attempt history unless the next stage needs them to continue, such as a
test that still fails.

## Goal

Let an Author unpublish and archive their own challenges (AUT-06.4–06.7), with
lifecycle transitions serialized with publication and attempt creation.

## Stages

After each stage, the orchestrator records each agent's `tokens.total_tokens`
from `bun workflow/scripts/rollout-summary.ts --id <thread-id>` when that
thread has a readable rollout and a known total; otherwise record `unavailable`.
At close-out, record the orchestrator's own session total using the same rule.

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | main (Claude Code) / default | done | 2026-11-11: #84 OPEN (labels `feat`, `role: author`). Dependency T-22 done (PR #95 merged at 115d49c, 14:20 UTC). PR #95 CI: one e2e failure in `tests/e2e/learner/account-switch.spec.ts:25` (not in the T-22 diff; passed 5/5 locally with `--repeat-each=5`); the human reran it and merged. Specs unchanged between a91e5e2 and 115d49c (`git diff --stat` on `workflow/specs` empty). AUT-06.4–06.7 present in the story file at 115d49c. PLAN capacity before T-23: 16 of 17, Author 3 of 4. Route high: migration, RLS/grants and a new database function; no AI call, no SYS-10.3 admin use. | unavailable |
| Plan / G1 | main (Claude Code) / default, sdd-plan | done | 2026-11-11: only `workflow/PLAN.md` changed (105 added lines, none removed): T-23 after T-22, before `## TA`. Capacity after T-23: 17 of 17, Author 4 of 4 (the plan is full). All fields filled; Reads use exact headings (SYS-12 rows “Learner-facing challenge material” and “Submissions” checked). Foundations found: `create_learner_submission` already locks the challenge row `for update` and requires `published`; generation and publication refuse archived; T-20 detail shows the archived notice but no lifecycle actions or revision link; no lifecycle route or function exists. G1: human committed ae3e7db `docs(plan)` (PLAN.md only, `Agent: Claude` trailer) and accepted the five plan choices below. | unavailable |
| Tests / G2 | main (Claude Code) / default, sdd-test | done | 2026-11-11: five new files, all under `tests/`; nothing else changed. Unit (`bun run test tests/unit/author`): 71 fail, 321 pass (all 317 earlier Author tests pass). Every failure is a missing T-23 Route Handler, client export or lifecycle button. Four new tests pass already (no revision link before publication, archived detail read-only, unpublished detail keeps “Edit draft”, archived offers no lifecycle action). Integration (`bun run test:integration tests/integration/author/lifecycle.test.ts`, local Supabase): 28 fail (27 “Missing T-23 Route Handler”, 1 missing `private.author_lifecycle_requests`), 1 passes (direct user writes to lifecycle fields are already denied); all arrangement code runs, including T-21/T-22 publication through the fake provider, Learner submissions and seeded completed grades. E2E (`bun run test:e2e tests/e2e/author/lifecycle.spec.ts`, production build): 2 fail waiting for the “Unpublish”/“Archive” button after the Learner pre-check passes; 1 passes (archived read-only detail). `bun run lint` and `bun run typecheck`: clean. SHA-256 before G2: lifecycle-requests.test.ts 2970f7d6…7de3f3d7, lifecycle-client.test.ts 7e35093e…ac070798, lifecycle-actions.test.tsx 317c7a40…be7433de, integration lifecycle.test.ts ef02c7e9…d3675b5c, e2e lifecycle.spec.ts 5d6e5eab…0d65d357. G2: human committed 2f1bcd4 `test(author)` (these five files only, `Agent: Claude` trailer); hashes match. | unavailable |
| Implement | main (Claude Code) / default, sdd-implement | done | 2026-11-11: committed tests unchanged since 2f1bcd4. Added migration `supabase/migrations/20261114120000_author_lifecycle.sql` (ledger `private.author_lifecycle_requests`, RLS on, no grants; `public.change_author_challenge_lifecycle(uuid, text, uuid, jsonb)`, SECURITY DEFINER, `search_path=""`, `authenticated` only; checks role, existence, ownership, replay, row lock `for update`, version, allowed transition; increments rowVersion only), `db:reset` + `db:types`; `src/lib/author/lifecycle.ts` (messages, types); `src/server/author/lifecycle.ts`; `lifecycleErrorResponse` in `responses.ts`; both Route Handlers; client `unpublishChallenge`/`archiveChallenge`; `src/components/author/lifecycle-actions.tsx`; `AuthorChallengeDetail` lifecycle props and “View published challenge” link; `ChallengeDetailRoute` wiring; one-time list notice via `notices.ts` and `AuthorListRoute`. Checks: `bun run test` 91 files, 1297 pass; `bun run test:integration tests/integration/author/` 195 pass, 2 fail (see Findings G3-01); `bun run test:e2e tests/e2e/author/` 9 pass, 2 fail (G3-02); lint and typecheck clean. Both failures are in committed test arrangement, proven by temporary copies (deleted; `git status tests/` clean): with the fixes, integration lifecycle 29/29 and the unpublish e2e pass. 2026-11-12: G3 test commit 314f052 (`test(author)`, the two test files only, `Agent: Claude` trailer), arrangement-only changes, SHA-256 match (8061d1c5…0e858ff1, b86dc2e1…25745784); tests unchanged since. After `db:reset` + `db:types` (no type drift): `bun run test` 91 files, 1297 pass; `bun run test:integration tests/integration/author/` 5 files, 197 pass; `bun run test:e2e tests/e2e/author/` 11 pass; lint and typecheck clean. Status → done. | unavailable |
| Review | ONE fresh verifier subagent (sdd-review + sdd-security-review) | done | 2026-11-12: one fresh verifier (sdd-review + sdd-security-review, no handoff, diff excluding `workflow/handoffs/` and `.claude/settings.json`): Status completed, every T-23 criterion met (SYS-17 keyboard/320 px e2e not run by it; the orchestrator's run passed 11/11). Checks it ran: unit Author 392 pass, integration Author 197 pass, lint, typecheck clean. No P0/P1/P2. Findings R-01, R-02, S-01 (all P3, below); S-01 carries a decision. Digests before = after: tree=85f5124923beb811 untracked=d3748d5572e65b9b. | 122101 (harness subagent total; no rollout) 2026-11-12 re-review (ONE fresh verifier, same scope): Status completed; S-01, R-01, R-02 resolved; no regression; every T-23 criterion met (e2e not run by it). Checks: unit Author 392 pass; integration Author 218 pass in 2 of 3 runs (REV-03); lint, typecheck clean. Digests before = after 959fe1c33cb525e1. |
| Docs | main (Claude Code) / default, sdd-docs | done | 2026-11-12: `docs/DeveloperGuide.md` only (+87): new “Author unpublish and archive” section (UI text quoted from `src/lib/author/lifecycle.ts` and `lifecycle-actions.tsx`), “Author lifecycle contracts” (routes, transitions, function, ledger recording failures) and “Author lifecycle checks”. Full upstream blob links to the migration and `src/server/author/lifecycle.ts` (both exist). No Jekyll raw blocks needed. README unchanged (no Author paragraph to extend). | unavailable |
| Close-out / G4 | main (Claude Code) / default | done | 2026-11-12: human ran `bun run verify` and `bun run test:e2e tests/e2e/author/` (both passed, reported by the human); commits 13e21c9 `feat(author)` and bcc20e1 `docs(author)`; PR #98 open to upstream `master`. `.claude/settings.json` left uncommitted. REV-03 (P3) open. | unavailable |

## Decisions

| Date | Who decided | Decision and one-line reason |
| --- | --- | --- |
| 2026-11-10 | Human | Author work is T-20–T-23 (#81–#84), all high route and chained. |
| 2026-11-10 | Human | Agents may run `gh issue create` and Docker commands. Commit, push, rebase and PR creation stay with the human. |
| 2026-11-11 | Human | The agent checks gate commits itself with `git log`/`git show`. |
| 2026-11-11 | Human (G3, Implement) | Apply the G3-01 and G3-02 test-arrangement fixes (no assertion changes) and commit them before Review. |
| 2026-11-12 | Human (G3, REV-03) | Fix the unordered `proposal_decisions` capture read in PR #98 (failing integration test first, then `.order("proposal_id")` in `src/server/llm/boundary.ts`). Draft a TA issue for the same pattern — withdrawn after checking: every other fingerprinted capture read is ordered or order-insensitive. |
| 2026-11-12 | Human (G3, Review) | S-01 Option A: record failed lifecycle outcomes in the ledger and return them on replay (INTEGRATION-SPEC §3). R-01 and R-02 tests added now in the same G3 test commit. |
| 2026-11-11 | Human | Generator–verifier workflow: the main session runs Plan, Tests, Implement, fixes and Docs with the stage skills; each review uses ONE fresh verifier subagent applying sdd-review and sdd-security-review. |

Carried over from T-22 (#83), to respect in T-23:

- After publication the draft and its decided set stay in place, and a successful publication
  increments `rowVersion` only (T-22 G1).
- Republishing an unchanged candidate is allowed for now and creates a new identical revision
  (T-22 G3, REV-03). T-23 may revisit this only through a human decision.
- AUT-05.7's archived denial was tested against archived states inserted by tests; T-23 adds the
  real “Unpublish” and “Archive” actions. Publication (`persist_author_publication`), generation
  and decisions already refuse an archived challenge under the challenge-row lock.
- Author reads of `revision_answers`, `revision_flaws` and `flaw_hints` are owner-only; TAs keep
  access (migration `20261113120000_author_publication.sql`).

## Interfaces defined by tests

- Route Handlers `src/app/api/v1/author/challenges/[id]/unpublish/route.ts` and `.../[id]/archive/route.ts`
  (`POST`): body exactly `{ expectedRowVersion }` (positive integer; `expectedDraftVersion`, `status`,
  pointer or actor fields are 400), required `Idempotency-Key` UUID, 128 KiB cap (413), `Origin` and
  workspace-account checks, `no-store`. Success 200 `{ data: { id, status, rowVersion } }`. Disallowed
  transition 409 `INVALID_STATE`; stale version 409 `VERSION_CONFLICT`; reused key with another body 409
  `IDEMPOTENCY_CONFLICT`; in-progress duplicate 409 `INVALID_STATE`; other Author/Learner/TA 403,
  anonymous 401, absent 404. Never the admin client or the LLM boundary.
- `src/components/author/client.ts`: `unpublishChallenge(id, { expectedRowVersion }, key, accountId?)`
  and `archiveChallenge(...)` → `{ status: "ok", challenge }` or `conflict` (VERSION_CONFLICT, or
  INVALID_STATE other than the in-progress message), `failed` (503 with the unavailable message, 400,
  404), `uncertain` (in-progress INVALID_STATE, 503 with the uncertain message, lost or unreadable
  reply), or account failures.
- `AuthorChallengeDetail` gains optional `unpublish(body, key)`, `archive(body, key)` and
  `onLifecycleChanged(challenge)`. “Unpublish” only when published; “Archive” for draft, published and
  unpublished; neither when archived; no restore/delete. “View published challenge” link to
  `/author/challenges/:id/revisions/:publishedRevisionId` when a pointer exists. Dialogs use the exact
  AUT-06.4/06.5 text with confirm and “Cancel” (focus returns to the trigger). Pending “Unpublishing…” /
  “Archiving…” in a live region, both triggers disabled, one call. Conflict: AUT-06.6 message with
  “Reload challenge” (rereads). Failed: the action's AUT-06.6 message in an alert; a new attempt uses
  a new key. Uncertain: AUT-06.6 message with “Refresh challenge”, which replays the same key and body;
  triggers stay disabled meanwhile.
- After success the route returns to “My challenges” (any query allowed) and shows “Challenge
  unpublished.” / “Challenge archived.” in a `role="status"` region (e2e).
- Database: lifecycle functions called through the user-scoped client are `SECURITY DEFINER` with
  `search_path=""`, executable only by `authenticated` (not `service_role`, `anon`, `PUBLIC`); calling one
  directly as another Author, a Learner or a TA leaves the challenge unchanged. Ledger
  `private.author_lifecycle_requests`: RLS on, no privileges for API roles, an `actor_id` column (the
  fixture cleanup finds it). Success increments `row_version` only, keeping `published_revision_id`,
  draft, proposal sets, revisions and submissions. After the change, Learner detail is not 200 and
  first attempts and retries return 409 `INVALID_STATE`; committed attempts stay readable by their
  Learner and TAs; Authors still cannot read submissions.

## Findings

| ID | From | Priority | Criterion | Status | Resolution |
| --- | --- | --- | --- | --- | --- |
| G3-01 | orchestrator (Implement) | blocking | AUT-06.7 | resolved (test fix, commit pending) | `tests/integration/author/lifecycle.test.ts` `completeGrade` seeds `grading_runs`, `ai_grades` and `ai_grade_evidence` only. The TA read (`src/server/ta/submissions.ts` `readSubmission`) requires `ai_grade_comment_results` per comment and `ai_grade_assessments` per flaw for a completed grade, so `submissionRead("taA", …, true)` is 503 regardless of the lifecycle change (the two “after unpublish/archive no attempt starts” tests fail at line 443). Fix: also insert one `unmatched` comment result per submission comment and one `(comment_id, distance) = (null, null)` assessment per revision flaw, and delete `ai_grade_assessments`, `ai_grade_comment_results`, `ai_grade_eligible_hints` in `removeCreatedAttempts`. Verified in a temporary copy: 29/29 pass. |
| G3-02 | orchestrator (Implement) | blocking | AUT-06.4, AUT-06.5, AUT-06.7 | resolved (test fix, commit pending) | `tests/e2e/author/lifecycle.spec.ts` `learnerSees` waits for `networkidle`, which never settles on the Learner “Access denied” page after the change (the same 17 requests load before and after; no polling), so both journeys hit the 30 s test timeout after the Author flow has already shown “Challenge unpublished.”. Fix: replace `waitForLoadState("networkidle")` with waiting for the page's level-1 heading (`await expect(learner.getByRole("heading", { level: 1 })).toBeVisible()`) before checking its name. Verified in a temporary copy with a fixed wait: the unpublish journey passes in 13.4 s. A Learner-side observation, not in T-23 scope: something on that page keeps a request open. |
| R-01 | verifier (Review) | P3 | SYS-10.2 | resolved (tests 0a63144; re-review confirmed) | No integration test calls `change_author_challenge_lifecycle` directly with invalid payloads (extra keys, bad `expectedRowVersion`, unknown action, nulls); the migration's checks (:44-55) read correct. Fix: direct-RPC cases expecting `invalid` and no row change. Needs a G3 test change. Test: “the owning Author calling the lifecycle function directly with an invalid payload changes nothing” (14 cases); passes already against the current code. |
| R-02 | verifier (Review) | P3 | PLAN T-23 Tests | resolved (tests 0a63144; re-review confirmed) | PLAN asks for integration 400/413 cases on both Route Handlers; only unit tests (mocked client) cover them. Fix: integration 400 (unknown field, missing key) and 413 cases. Needs a G3 test change. Test: describe “request validation” (9 cases × 2 actions, 400/413); passes already against the current code. |
| S-01 | verifier (Review) | P3 | INTEGRATION-SPEC §3 “failed operations record failure” | resolved (tests 0a63144; re-review confirmed) | `version_conflict`/`invalid_state` outcomes (migration :87-96) are not written to `private.author_lifecycle_requests`, so a replayed key is re-evaluated. A replay can never succeed after a failure (every change bumps rowVersion), but its code can change (INVALID_STATE → VERSION_CONFLICT; both show the same UI conflict). Fix: record failed outcomes and return them on replay, or record a decision accepting it. Worse than reported: a replay can wrongly succeed. An archive with `expectedRowVersion` one ahead fails VERSION_CONFLICT unrecorded; after a separate unpublish reaches that version, replaying the key archives (inferred from migration :87-96). Tests: `lifecycle.test.ts` “a replayed INVALID_STATE stays…” and “a replayed VERSION_CONFLICT never applies…” (both fail first: no ledger row after failure). Fix: migration records `version_conflict`/`invalid_state` with null rowVersion (check ties success ⇔ rowVersion) and returns them on replay. |
| REV-03 | verifier (re-review) | P3 | SYS-19 | resolved (test c98d9db, fix 5102194; CI green) | Full `tests/integration/author/` run: 1 of 3 runs failed in `livePublished()` setup (`lifecycle.test.ts:231`, T-22 publish returned 409, surfaced in the AUT-06.7 test); 2 reruns and the file alone passed. Cause unconfirmed, likely state shared with another Author test file. Fix direction: log the 409 code in setup, check leftover generation/publication/accounting state. No T-23 assertion failed. 2026-11-12 CI: PR #98 runs 43196594222 (bcc20e1) and 43201180000 (1f61431) both fail `integration` only: publish in setup returns 409 in late lifecycle tests (3+ then 1). Master CI green. Not reproduced locally: fresh `db:reset` full suite 577/577 (cache cleared, CI order), Author dir 5/5, `TZ=UTC` file run. Ruled out: #99 (first run predates its merge), AI limits (429 not 409), unawaited settlement. Diagnostic: `ok()` now puts the response body in the failure message (uncommitted test change) so CI shows the 409 code. Separate local issue: running the file twice back to back hangs fixture provisioning. ROOT CAUSE (confirmed locally, CI file order publication → proposals → schema → lifecycle via a temporary sequencer config, 2 of 8 runs): CI a285e49 showed publish 409 `VERSION_CONFLICT`. Source is `src/server/llm/boundary.ts:155` `authorCapture`: the `proposal_decisions` read `.in("proposal_id", …)` has no `order`; the post-dispatch recapture (:288-292) returned the same two decisions in the opposite order, so the fingerprint changed and the boundary raised VERSION_CONFLICT while stored versions stayed 4/4. Product bug (T-22 publication can spuriously show “This challenge changed. Reload it before publishing.”), not a test bug. Fix direction: `.order("proposal_id")` on that read. Possibly the same pattern: `summary-snapshot.ts:37` (TA owner). All instrumentation reverted. Test: `tests/integration/author/publication.test.ts` “AUT-05.2 AUT-05.6 an unchanged draft publishes even when the database returns its decisions in another order” (client proxy alternates unordered `proposal_decisions` row order). Fails 2/2 with 409 without the fix; passes with `.order("proposal_id")` applied temporarily (reverted). Fix: `.order("proposal_id")` in `src/server/llm/boundary.ts:156`. Checks after: lint, typecheck clean; unit 91 files 1297 pass; full integration (fresh `db:reset`) 28 files 578 pass; CI-order repro 5/5 pass (213 each). Verifier (ONE fresh, sdd-review + sdd-security-review): completed, no findings; AUT-05.2, AUT-05.6, SEC-02.2 met; every other fingerprinted read ordered or order-insensitive; T-21 inject_flaws unaffected; author+llm integration 333 pass, unit 1297 pass, lint, typecheck clean; digests 2d6d3c7361ad13b3 before = after. PR #98 CI run 43241103877 on 5102194: checks, migrations, integration, e2e, verify all pass. |

## Open questions

Test choices the specs do not settle (for G2; say if any should change):

1. “Refresh challenge” (uncertain outcome) replays the same lifecycle request and key, resolving
   the operation, rather than only rereading the challenge. AUT-06.6 says lifecycle actions
   “resolve the same operation under shared idempotency”.
2. A disallowed transition caused by another tab (for example archived elsewhere) shows the
   conflict state with “Reload challenge”, like a version conflict.
3. The success notice travels to “My challenges” by any means (query or session storage); only the
   URL path and the `role="status"` text are asserted.
4. E2E uses the fixture's Author A challenges “Category filter control” (unpublish) and “Difficulty
   filter control” (archive) instead of publishing through the UI again.

## Next action

Done. PR #98 merged as f6f2e15 (2026-11-12 15:14 UTC); #84 closed. Close-out PR (branch `chore/84-author-lifecycle-close-out`): PLAN T-23 → done and log 009.
