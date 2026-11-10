# #51 — Learner grading

- **Route:** high
- **PLAN task:** T-12 (Learner)
- **Branch:** `feat/51-learner-grading`
- **Base commit:** `1e2b666122bc3090e091dcb3db15a2cdaab2193e`
- **Status:** done

## Goal

Grade the Learner's own pinned submission and support grading retry under LRN-05.1–05.7 and SYS-10.3 Submission grading. T-13 owns feedback display, hints, challenge retry, reports and history.

## Stages

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | Main / medium | Complete | [Issue #51](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/issues/51) verified open. Branch started clean at local `upstream/master`, the merge of #78. Verified LRN-05.1–05.7, the cited SYS and SEC sections and the integration grading contracts at base. T-04, T-05 and T-11 are done at base. | See Main sessions |
| Plan / G1 | Planner / high, then Main | Complete | Verified `6b509563253ccecc7c9db3c2f6b33e5f5db0311f` as the first commit above the recorded base. It changes only `workflow/PLAN.md`, and `git show --check` passed. T12-G3-01 and T12-G1-01 are resolved. | 1066416 (planner), see Main sessions |
| Tests / G2 | Test-writer / medium, then Main | Complete | Main verified test-only scope and criterion-prefixed titles. The two approved changes in `boundary.test.ts` only create and bind a running run. Original assertions and other tests are unchanged. Targeted lint, typecheck, production build and whitespace checks passed on Node 24.22.2. Unit, local Supabase integration and Chromium produced the expected baseline failures below. Verified setup commit `0edb365422a12e565b22f5e0ca3dded23210e854` and acceptance commit `81a30ef14443636b20be19ecb0d82c5769ed2e1c` in order directly after G1. Both pass `git show --check`. All eight blobs match the reviewed baseline in HEAD, index and worktree. | 4068238 (test writer), see Main sessions |
| Implement | Implementer / medium, then Main | Complete | All eight G2 blobs and the two-file G3 scope verified. Migration `20261110120000_learner_grading.sql` applied locally without a reset and generated types matched. On Node 24, lint, typecheck, 508 scoped unit cases, 77 targeted local integration cases, and the CI-style production build and all 18 Chromium cases passed (15 account, 3 grading). | 4636411 (implementer cumulative), see Main sessions |
| Review | Reviewer / medium and security-reviewer / high | Findings open | Both independent reviews completed. The before and after status/diff SHA-256 matched `5db07fc6a286e7eafb71be9f31ab516d033592552e48dbf59941b90610a86820`, and the untracked-content SHA-256 matched `ac444f62b025383ea37eb20532f022fca7e0ea302981a6b78083b5882eaec401`. Correctness review passed 88 targeted unit cases. Security review reproduced a private flaw UUID passing feedback validation. Main reproduced REV-04 in the CI-style T-11 browser suite. All three cases reached their assertions, but worker teardown failed to delete a fixture identity. Main removed the orphaned rows and identity created by that run only. No fix round has started. | 3422160 (correctness), 2217607 (security) |
| Supplementary Tests / G2 | Test-writer / medium, then Main | Complete | Verified Shawn's `c8bd6155cbb4de9446ed776011a87fdac6cf36dc` directly after the original G2 commit. It contains only the four reviewed test paths below. All reviewed G2 blobs match HEAD, index and worktree. `git show --check` passed. The new cases have criterion-prefixed titles. Node 24 lint, isolated typecheck and whitespace checks passed before the commit. Unit and local Supabase failures match the missing behavior and interfaces below. | 3931570 (test-writer), see Main sessions |
| Implement / fix round 1 | Implementer / medium, then Main | Complete | Verified G2 blobs and fix scope. Applied updated RPCs to the local stack in one transaction and verified generated types. On Node 24.22.2, lint, typecheck, whitespace checks and 454 scoped unit cases passed. Local Supabase passed 137 of 138 cases, including all supplementary grading cases. The existing provider-admission race missed its wait in the combined run. All 46 boundary cases passed on the isolated rerun. The CI-style production build and all six learner Chromium cases passed, including shared fixture teardown. | 1826279 (implementer), see Main sessions |
| Rereview / G3 | Reviewer / medium and security-reviewer / high | Blocking findings | Before and after status/diff SHA-256 matched `fbb8145c9e06f4ed0440baabf669ac7eaa80678aaa9550c654d4ad0feafd48b6` and untracked-content SHA-256 matched `2d92f3b92c892113896f25c4cfacbf01f6db6b080cfb5f205fb31abba7af96ea`. Both reviewers verified approved coverage for privileged surfaces. Security reproduced alternate UUID spellings reaching validated feedback. Rereview found residual replay and fixture teardown paths and a new intent conflict. See Findings. | 942216 (correctness), 1187722 (security) |
| Supplementary Tests / G2 for fix round 2 | Test-writer / medium, then Main | Complete | Main verified Shawn’s test-only commit `2c05277203acd51714da25f7ff0759b8bb4b53e3` directly after `c8bd615`. All 12 reviewed G2 blobs match HEAD, index and worktree, and `git show --check` passed. Main verified the prior G2 commit and all 11 reviewed blobs in HEAD, index and worktree. The stage added one new integration test file. The tracked diff and pre-existing untracked files matched the checkpoint, excluding the handoff. On Node 24.22.2, the 13 existing grading review tests passed and all nine new cases failed at the expected assertions on local Supabase. Targeted lint, isolated typecheck and whitespace checks passed. See the final supplementary G2 evidence. | 1104796 (test-writer), see Main sessions |
| Implement / fix round 2 | Implementer / medium, then Main | Complete | Main verified all 12 G2 blobs, scoped changes and whitespace. Applied the private ledger and RPC delta locally in one transaction without resetting data. Generated types match. On Node 24.22.2, lint, isolated Next typegen and typecheck, 454 scoped unit cases and 53 local integration cases passed, including the nine supplementary cases. The CI-style production build and six learner Chromium cases passed with shared fixture teardown. | 1945095 (implementer), see Main sessions |
| Rereview / fix round 2 / G3 | Reviewer / medium and security-reviewer / high | Blocking findings | Scoped to REV-03 / SEC-REV-01, SEC-REV-05, SEC-REV-04 and REV-04. Before and after status/diff SHA-256 matched `11a09c96f3972b6df4425dc4d32c7daabd4b53dec1ab41ebd8109ba056ca8d7b` and untracked-content SHA-256 matched `813940ea0f6c09c6322ac31948e9cb3d1674ba28f30a490d2bf94a7c92d6ca9e`. SEC-REV-05 resolved. Main reproduced the deadline replay mismatch and persisted UUID echoes with default-ignorable characters in isolated local probes. Correctness found the fixture lock-order inversion in source. No permitted fix rounds remain. | 876385 (correctness), 1166213 (security) |
| G3 recovery / supplementary G2 | Main | Complete | Verified `2c05277` and all 12 approved test blobs in HEAD, index and worktree. The checkpoint matched outside the new test file and handoff. Node 24.22.2 targeted lint, isolated typecheck and whitespace checks passed. Local Supabase passed all 22 existing review and replay cases. The four new cases failed at their intended assertions. On resume, Main verified the test-only commit `7b6310091329f2bc34e23784637ef0c60a2552b1` directly after `2c05277`, confirmed all 13 approved blobs in HEAD, index and worktree, and ran `git show --check`. | See Main sessions |
| G3 recovery fixes | Main and Shawn | Complete | Shawn approved the recovery fixes after diff review. Main verified feature commit `60f1b85` and separate launcher and fixture commits `bb8ddba` and `8c41e34`. Before merge, lint, isolated typecheck, whitespace checks, 454 scoped unit cases, 122 local integration cases and six learner Chromium cases passed. The local teardown overlap and Unicode case-fold probes passed. | See Main sessions |
| Upstream merge validation | Main | Complete | Verified `91cffee` merges `4087e3c` (T-32 #79 and reflections #85) with only the regenerated database types resolved. T-12's migration sorts after T-32's. Session 10 recorded passing Node 24.22.2 lint, typecheck, 646 scoped unit cases, 319 local integration cases, the production build and 48 local Chromium cases. Verified `0fb31bc` follows the merge and adds only `tests/integration/ta/progress/learner-grading.test.ts`, which checks that T-32 counts a match and a miss written by T-12 completion. All 13 approved G2 blobs match HEAD, index and worktree. | See Main sessions |
| Docs | Docs / low, then Main | Complete | `README.md` and `docs/DeveloperGuide.md` document the shipped grading flow, link INTEGRATION §3 for API contracts and specify live SoC for hosted development and fake for local, test and CI. The guide describes multi-match smoke output. Main verified the guide-only diff, Markdown link targets and anchors, UI copy and whitespace. App checks were not rerun at Docs. | 600979 (docs), see Main sessions |
| Close-out / G4 | Main and Shawn | Awaiting human validation | Main completed the agent stages and set T-12 to `done`. Full verify, full e2e, live multi-match smoke and the hosted development switch are unverified. | See Main sessions |

## Main sessions

| Session | Stages | Thread ID | Measured total | Resume gaps |
| --- | --- | --- | --- | --- |
| 1 | Ready, Plan draft, G3 | `01a1c12c-d8d1-7da1-81a2-b6fe7bebf833` | 1,652,538 | Initial session |
| 2 | Plan revision, G1 | `01a1c133-8876-75e2-b847-ee7a6bf25d7e` | 766204 | None. G3 was resolved by decision without a commit. |
| 3 | Tests / G2 | `01a1c13b-bb60-7eb1-9d87-f94ac1049712` | 7912643 | None. G1 was verified before dispatch. |
| 4 | Implement, G3, Review, G3, supplementary G2 | `01a1c14d-738a-76e1-8671-b422dd023bec` | 17468976 | Both G2 commits and all reviewed test blobs were verified before dispatch. The implementer returned its completed summary after Shawn resumed the same chat. The first G3 decision added exactly the two shared harness paths without a commit. The second G3 decision approved the supplementary G2 scope before dispatch. |
| 5 | Supplementary G2 verification, fix round 1, rereview, G3 | `01a1c394-97b7-7481-8bf1-53b9425b7d67` | 6686389 | None. The supplementary G2 commit and reviewed blobs were verified before the fix round. |
| 6 | G3 decisions, supplementary G2 for fix round 2 | `01a1c3a2-9f73-7031-92d2-1c82ddbdf723` | 1,771,044 | None. Shawn resolved G3 without a gate commit. Main verified the existing G2 baseline before dispatch. |
| 7 | Supplementary G2 verification, fix round 2, scoped rereview, G3 | `01a1c3a8-91f1-7d82-ac8b-c1865d90d079` | 6,034,840 | None. Shawn supplied `2c05277`. Main verified the commit and all 12 G2 blobs before dispatch. |
| 8 | G3 decision, recovery tests / G2 | `01a1c3b4-75ba-7571-a974-98a80a010b50` | 1,381,148 | Shawn authorized recovery without a G3 commit. Main verified `2c05277` and all 12 approved test blobs. |
| 9 | Recovery test commit verification, bounded fixes, G3 | `01a1c3ba-3107-7fa0-a269-dbbdc1ed6831` | 2495919 | None. Shawn supplied `7b63100` and Session 8's final total. Main verified both before the recovery. |
| 10 | Upstream merge validation | `01a1c3ca-4e8b-77f1-ab24-8efdef0b4fc4` | 4605577 | Shawn reported approval of the recovery fixes, the three commits, and Session 9's final total. Main verified the commits and the total. |
| 11 | Docs, close-out / G4 | `01a1c3d3-7e8c-7b93-a235-06f35ba491fd` | 1,351,801 | None. Main verified both commits and Session 10's final total before recording close-out. |

End each main session after updating this handoff at G1, G2, G3 or G4. A resumed session first verifies the gate commit named in the resume prompt in Git, copies the prior session's `tokens.total_tokens` verbatim from `bun workflow/scripts/rollout-summary.ts --id <thread-id>` (or records `unavailable`), and records any resume gaps or `none`.

## Decisions

| Date | Who decided | Decision and reason |
| --- | --- | --- |
| 2026-11-10 | Shawn | High route. T-12 owns the `assess_review` boundary change. The start function creates the running run before dispatch and passes its ID through the server-only selection argument. The pre-dispatch capture and the capture after a successful response each require that exact run to be running for this submission. No run, a different active run, or a run that is no longer running yields `INVALID_STATE`. The completion write repeats its own checks. |
| 2026-11-10 | Shawn | T-05 remains unchanged. Add `src/server/llm/boundary.ts` and the new boundary test path to T-12's Config paths, and add the bound-run behaviour to its acceptance criteria. Put new coverage in new files. This decision resolves T12-G3-01 without a commit. |
| 2026-11-10 | Shawn | New migrations sort after `20261109160000_ta_learner_progress.sql`. [Open PR #79](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/pull/79) reads the completed first attempt's `ai_grades` row and requires one `ai_grade_assessments` row per pinned revision flaw. Include the null `comment_id` for missed flaws and cover the shape in a test. |
| 2026-11-10 | Shawn | At G2, T-12 may edit only the success and forged-pair setups in `tests/integration/llm/boundary.test.ts` to create a running run and bind its ID. Keep their assertions and all other approved tests unchanged. Add the file to Config paths for this purpose only and land the setup edits in a separate `test(llm)` commit. This resolves T12-G1-01. |
| 2026-11-10 | Shawn | T-12 owns “Retry grading” under LRN-05.3 and LRN-05.6. After a retryable failure, the grade POST uses the same start function to create the next `run_number` on the same submission. The page omits retry and the server rejects it after an AI input-limit failure. T-13 owns feedback display, hints, challenge retry, reports and history. |
| 2026-11-10 | Shawn | A running run expires at `created_at + 60 seconds` on the database clock. Reject completion once the deadline is reached. The reader reports failure with `AI_TIMEOUT` without writing, so polling stops. On the next grade POST, the start function atomically records the expired run as failed with `AI_TIMEOUT` and a database-clock `finished_at` before creating the next run. |
| 2026-11-10 | Shawn | Failed and completed are terminal. Freeze their state, `finished_at` and `failure_code`. No run means pending. New runs start in `running`. No operation creates or transitions stored `pending` rows. An existing `pending` row counts as active and fails closed. |
| 2026-11-10 | Shawn | Approved T12-G3-02. The shared Playwright server inherits the loopback Supabase secret in memory and forces a supported non-hosted environment and fake provider for build and start. Strip the live SoC key from both child processes. Change only `tests/integration/auth/local.ts` and `tests/e2e/account/server.ts`. Record this shared-component decision in the PR and commit the two files separately as `test(e2e)` at G4. |
| 2026-11-10 | Shawn | REV-01. Keep the grade POST body empty and send initial-start or explicit-retry intent in a request header. Enforce the intent under the submission lock. Initial starts require no run. Explicit retries require a retryable latest failure. Ineligible requests return the current state without new provider work. May change the start RPC signature. In `learner-grading.test.ts`, change only call sites and the grants signature list. In `grading-result.test.tsx`, change only setups. Preserve all assertions in both files and report each edit. |
| 2026-11-10 | Shawn | REV-03 / SEC-REV-01. Replay returns the key's own recorded outcome before considering current state, without a grading context read or provider work. |
| 2026-11-10 | Shawn | SEC-REV-02. The first grading context read and both assessment captures require the bound run to be running and before its 60-second deadline on the database clock. Completion retains its independent compare-and-set. |
| 2026-11-10 | Shawn | REV-02 / SEC-REV-03. Add tests for RLS, grants and denied direct access to the private grading ledger and the lock helper's execute revoke. |
| 2026-11-10 | Shawn | SEC-REV-04. Reject UUID-shaped assessment feedback using the existing output retry and failure path. `src/server/llm/contracts.ts` joins Config paths for this change only. |
| 2026-11-10 | Shawn | REV-04. The existing learner browser post-submit assertion accepts pending or a later grading state. Shared fixture teardown deletes only fixture-owned grading descendants. |
| 2026-11-10 | Shawn | Run a supplementary G2 with new focused failing tests in new files and only the approved existing test edits. Shawn commits the tests before one fix round and a rereview scoped to the blocking IDs. Keep the original two launcher/harness edits in a separate close-out `test(e2e)` commit. |
| 2026-11-10 | Shawn | Make the approved REV-04 teardown change in `tests/integration/domain/learner-browse-fixture.ts` during fix round 1. Stage that file separately for its own `test(learner)` commit at G4 and exclude it from the feature commit. |
| 2026-11-10 | Shawn | REV-03 / SEC-REV-01. Under INTEGRATION §3 Transport, record the response for every validated grade key, including a key that starts no run because it observes an active, failed or completed state or because retry is rejected. Replay that response unchanged. In-progress duplicates keep `409 INVALID_STATE`. |
| 2026-11-10 | Shawn | SEC-REV-05. Include validated intent in the canonical idempotency input. Reusing a key with different intent returns `409 IDEMPOTENCY_CONFLICT` before any grading context read or provider work. |
| 2026-11-10 | Shawn | SEC-REV-04. Apply NFKC and case folding and ignore separators between hex digits before checking feedback for private keys. Fullwidth and compact UUID spellings follow the same rejection and retry path as ASCII. |
| 2026-11-10 | Shawn | REV-04. Lock fixture-owned submissions through deletion so an in-flight grading request cannot add rows between the child sweep and parent deletion. Limit this change to the fixture and keep it in the separate G4 `test(learner)` commit. |
| 2026-11-10 | Shawn | G3 is resolved by decision without a gate commit. Run a focused supplementary G2 for decisions 1–3 in new test files. After Shawn commits the tests, run the final permitted fix round and scope rereview to the remaining findings covered by these decisions. |
| 2026-11-10 | Shawn | G3 authorizes one bounded recovery cycle beyond the two fix rounds. Main handles it directly without a G3 gate commit, subagent reruns, or a third rereview. Add one new failing test file for the deadline and Unicode cases and preserve every approved test file. Shawn commits the new test before fixes begin. Run the new and existing grading tests after the fixes, then stop at G3 for Shawn's diff review before the feature commit. |
| 2026-11-10 | Shawn | REV-03 / SEC-REV-01. The response first returned for a key is the recorded response returned on replay. If the run's completion is rejected at the 60-second deadline, record and return `504 AI_TIMEOUT`. |
| 2026-11-10 | Shawn | SEC-REV-04. For private-ID detection only, remove default-ignorable code points and combining marks after NFKC and case folding and before matching hex sequences. Accepted feedback is stored unchanged. |
| 2026-11-10 | Shawn | REV-04. Acquire fixture teardown locks in the same order as submission creation. Keep the fixture in its separate `test(learner)` commit. |

## Findings

| ID | From | Priority | Criterion | Status | Resolution |
| --- | --- | --- | --- | --- | --- |
| T12-G3-01 | Ready/Plan source check | Blocking | LRN-05.2, SYS-10.3 | Resolved | Shawn assigned the change to T-12. Its plan requires the two captures to accept only the bound running run for the submission. |
| T12-G1-01 | Plan source check | Blocking | LRN-05.2, SYS-10.3, SEC-01.1–01.2 | Resolved | Shawn approved adding a bound running run to the two existing test setups at G2. Their assertions still verify assessment success and forged-pair rejection. |
| T12-G3-02 | Implement gate | Blocking | SYS-19.2, LRN-05.2 | Resolved | Before the fix the CI-style grade POST returned HTTP 503. The approved launcher and local harness edits now pass the local service key in memory, force `APP_ENV=ci` and `AI_PROVIDER=fake`, and strip the inherited SoC key. The CI-style run with an inert parent key and no external grading settings passed all 18 Chromium cases. |
| REV-01 | Correctness | P1 | LRN-05.2–05.3 | Resolved | The client sends explicit intent and the locked start checks it. The stale initial POST cannot create another run. `learner-grading-review.test.ts:135` and `:153` passed. |
| REV-02 | Correctness | P2 blocking | SYS-10.1, SYS-10.3 | Resolved | `learner-grading-review.test.ts:195` verifies ledger RLS, role privileges and direct denial for the ledger and lock helper. Same issue as SEC-REV-03. |
| REV-03 | Correctness | P2 blocking | LRN-05.3, transport replay | Resolved | Completion rejection goes through the failure RPC for the bound run. If another request already finalized it, the route replays the same key's recorded outcome. The recovery test confirms the first response and replay are both `504 AI_TIMEOUT`, with the failed run stored before replay. |
| REV-04 | Correctness | P2 blocking | SYS-19.2, LRN-05.2 | Resolved | Teardown locks fixture challenges before Learner profiles, then locks owned submissions through cleanup. A local overlap probe held the challenge lock while teardown started, committed a real submission, then verified teardown removed the new submission and its creation key. The fixture is in `8c41e34`. |
| SEC-REV-01 | Security | P2 blocking | LRN-05.3, SEC-05.1 | Resolved | Same deadline recovery as REV-03. The owning POST records and returns the timeout. The existing replay suite verifies that an in-progress duplicate still returns `409 INVALID_STATE`. |
| SEC-REV-02 | Security | P2 blocking | LRN-05.2, SEC-01.1, SYS-10.3 | Resolved | Matching and both captures require the exact unexpired run. Completion independently checks the database deadline. The retained two-argument overload fails closed in source. Its ACL is covered and direct service-role rejection with an otherwise eligible run remains unverified by an approved test. |
| SEC-REV-03 | Security | P3 blocking | SYS-10.1, SYS-10.3 | Resolved | Approved ledger and lock helper checks passed. Same issue as REV-02. |
| SEC-REV-04 | Security | P2 blocking | LRN-05.5, SEC-03, SYS-12 | Resolved | The UUID check strips default-ignorable code points and combining marks from its normalized copy only. The three committed Unicode cases take the existing retry and rejection path and store no grade. |
| SEC-REV-05 | Security | P3 blocking | LRN-05.3, transport idempotency | Resolved | Validated intent is checked before replay or new work at the migration’s `:69`. The started, observed and rejected-retry cases at `learner-grading-replay.test.ts:164` and `:182` passed locally, including the no-private-work checks. |

## G2 evidence

The pre-edit boundary and grading history regressions passed all 50 cases. The existing Chromium keyboard submission journey passed against the production build. Independent targeted checks on the final test files used an isolated, environment-file-free checkout for Next.js commands.

| Criteria | Test evidence | Observed against `6b50956` |
| --- | --- | --- |
| LRN-05.2, LRN-05.4–05.5, SYS-02, SYS-09, SYS-11–12, SEC-03, SEC-05 | `grading.test.ts` checks matching, score and flags, safe DTO shape, strict transport, role, account and Origin checks. | 29 expected failures on missing scoring and route modules and the pending-only DTO. |
| LRN-05.1–05.7, SYS-02, SYS-04, SYS-17 | `grading-result.test.tsx` checks pinned code, read-only comments, status and score, all failure messages, explicit retry, and read and uncertain-POST recovery. | Collection stops at the missing `GradingResult` module. |
| LRN-05.1–05.6, SYS-08–12, SYS-18.2, SEC-01, SEC-03, SEC-05–06 | `learner-grading.test.ts` checks owner and role access, grants, concurrency and replay, the 60-second deadline, same-submission retry, all per-flaw children and atomicity, no-match bypass, provider rejection, and terminal history. | 14 expected failures on missing route handlers and grading RPCs. Local fixtures set up and cleaned up. |
| LRN-05.2, SYS-10.3, SEC-01 | `assess-review-bound-run.test.ts` verifies the pre-dispatch and post-response checks, run-ID isolation and no privileged context read, reservation or dispatch on preflight rejection. `boundary.test.ts` and `grading-run-history.test.ts` cover regressions. | Combined integration suite had 50 passes and 27 expected failures, including 11 bound-run cases and both setup-only cases. The current selection rejects `gradingRunId` and still permits assessment without a run. |
| SYS-19.4, SEC-02, SEC-05 | `soc-smoke-multi-match.test.ts` uses injected transport for paired labels, rejection diagnostics and retry limits. Existing single-match smoke tests are preserved. | One pass and three expected failures on missing fixture and unsupported pair labels. Targeted unit total was 72 passes, 32 expected assertion or runtime-import failures and the result suite blocked on its missing component. |
| LRN-05.1–05.4, LRN-05.6–05.7, SYS-19.2 | `grading.spec.ts` covers automatic grading, one original assessment, running and failed reopen, read recovery, explicit retry and input-limit suppression with the fake provider. | Production build and startup succeeded. All three Chromium cases reached the seeded submission page. The baseline lacks the “Review result” heading and shows “Grading pending” for both the running and input-limit-failed fixtures. |

### Interfaces defined by tests

- `src/server/learner/grading.ts` exports `matchReview(comments, flaws)` with `matches`, `missedFlawIds`, `duplicateCommentIds` and `unmatchedCommentIds`, and `scoreReview({ flawCount, matching, assessments, providerOutputRetried })` with the original score fields and `ruleFlags`.
- `src/app/api/v1/submissions/[id]/route.ts` exports `GET` and `src/app/api/v1/submissions/[id]/grade/route.ts` exports `POST`. Both take `(request, { params: Promise<{ id: string }> })`. `src/components/learner/grading-result.tsx` exports `GradingResult({ submissionId, initialSubmission? })`.
- The assessment selection argument to `createLlmBoundary().execute` carries `{ gradingRunId, matches: [{ key, commentId }] }`. `gradingRunId` stays out of the public operation request and provider payload.
- The three new service-role-only RPCs are `public.start_learner_grading(p_account_id uuid, p_submission_id uuid, p_idempotency_key uuid)`, `public.complete_learner_grading(p_account_id uuid, p_submission_id uuid, p_grading_run_id uuid, p_payload jsonb)` and `public.fail_learner_grading(p_account_id uuid, p_submission_id uuid, p_grading_run_id uuid, p_failure_code text)`. Completion accepts `original`, `matching`, `assessments`, `ruleFlags` and `providerOutputRetried` in its payload. The tests also cover the authenticated result read and existing service-role grading context.
- The new smoke fixture uses `assessment_labels` keyed by `{ key, commentId }`. CSV reports each attempt, `duplicate_pair` rejection, paired labels and exact agreement. Existing single-match labels remain covered by regression tests.

### Verified G2 test blobs

| Commit | Path | Git blob |
| --- | --- | --- |
| Setup only | `tests/integration/llm/boundary.test.ts` | `ba70cbb340ef7d9bcec1eab268778ce564159730` |
| Acceptance | `tests/e2e/learner/grading.spec.ts` | `469d2197bef26a072ceffa657ba513e20c41e17f` |
| Acceptance | `tests/integration/domain/learner-grading.test.ts` | `02a383bcc4305b2dc4711f605eba149e109f80be` |
| Acceptance | `tests/integration/llm/assess-review-bound-run.test.ts` | `c8a6ff1393af46ac83844f526f7fd964a515777a` |
| Acceptance | `tests/unit/learner/grading-fixture.ts` | `43b4777377884536321608f5aa068defef3bb3e9` |
| Acceptance | `tests/unit/learner/grading-result.test.tsx` | `bb1b9fed13cddb4b8af144fb607e1088b0f905da` |
| Acceptance | `tests/unit/learner/grading.test.ts` | `5f37d36f1cdf33a779b350ebcd8e9d0c2e8f8c76` |
| Acceptance | `tests/unit/server/llm/soc-smoke-multi-match.test.ts` | `17a2afebcf8c570f6c10b429d5d7fccf634cf821` |

## Supplementary G2 evidence

- The two new test files define `X-LGTM-Grading-Intent: initial | retry` with an empty JSON object, `start_learner_grading(uuid,uuid,uuid,text)` with `p_intent`, and the service-only `llm_grading_context(uuid,uuid,uuid)` overload with `grading_run_id`. The two-argument context grant and denial checks remain in the original suite.
- Main's targeted unit run passed 14 existing cases. The new result case failed on the two missing intent headers after observing a competing failure and clicking Retry grading.
- Main's targeted local Supabase run passed 11 cases and failed 16 as expected. The private ledger RLS and lock-helper access checks passed. Twelve new cases failed on missing intent enforcement, failed-key replay, the absent bound-context overload, missing initial run binding, expiry at both captures, or UUID-shaped feedback acceptance. Four adapted existing cases failed because the new start RPC signature is absent. Fixtures set up and cleaned up. The earlier Chromium run already reproduced the shared fixture teardown failure after all three assertions passed. Rerun it after the fix.
- In `learner-grading.test.ts`, the request and grade helpers pass the intent header, the start helper passes `p_intent`, and the grants signature list and denied/forged RPC calls use the fourth argument. The explicit retry success, input-limit rejection and terminal-history HTTP calls now pass retry intent. Both timeout restart RPC calls pass retry intent. Every original assertion is preserved. `grading-result.test.tsx` is unchanged.
- In `review.spec.ts`, the only edit makes the post-submit locator accept pending, running, failed or completed. Shared fixture teardown is reserved for the fix round.

| Supplementary test commit path | Reviewed Git blob |
| --- | --- |
| `tests/integration/domain/learner-grading.test.ts` | `449c6c5faa1634aa04430b54071bb5fc0409d17d` |
| `tests/e2e/learner/review.spec.ts` | `35ae4a4ce80ad039e2b36c6880c4bf39bdee9b72` |
| `tests/integration/llm/learner-grading-review.test.ts` | `627a9b5393380bb51ceefc5dfd2d2ab6395d1768` |
| `tests/unit/learner/grading-intent.test.tsx` | `d9774cb03a56fcd1db60b72ccf31c5e95cc4d35c` |

## Final supplementary G2 evidence

`tests/integration/llm/learner-grading-replay.test.ts` has reviewed Git blob `513e749930a27a0b4c2044ee402abe51acf95d30`, verified in Shawn’s commit `2c05277`. It exercises the existing grade POST and fake-provider boundary without defining new exports or privileged database interfaces.

| Findings | Cases | Observed before fix round 2 |
| --- | --- | --- |
| REV-03 / SEC-REV-01 | Same-key in-flight duplicate, active observer replay, failed observer replay, and pending retry replay | The duplicate returned `409 INVALID_STATE`. All three observer replays returned the later completed grade in place of the recorded response. |
| SEC-REV-05 | Changed intent on a key that completed grading, a key that observed completion, and a key that received a rejected input-limit retry | The completed cases returned 200 and the rejected-retry case returned 413. Each expected `409 IDEMPOTENCY_CONFLICT` before private context, accounting or provider work. |
| SEC-REV-04 | Security | P2 blocking | LRN-05.5, SEC-03, SYS-12 | Fixed pending G3 review | The UUID check strips default-ignorable code points and combining marks from its normalized copy only. The three committed Unicode cases take the existing retry and rejection path and store no grade. |

Full verify, build, browser tests and live smoke were unrun at this test gate. REV-04 remains a fixture-only change for fix round 2.

## G3 recovery test evidence

`tests/integration/llm/learner-grading-recovery.test.ts` has reviewed Git blob `06487f14e5f4dcee2e727fd87db04e52c5a690b8`. It uses the existing grade POST, fake provider and local database RPCs without defining new interfaces.

| Findings | Evidence on local Supabase before recovery fixes |
| --- | --- |
| REV-03 / SEC-REV-01 | The test expires the exact running fixture immediately before the real completion RPC. The RPC rejected completion with `INVALID_STATE`. The original POST returned `409 INVALID_STATE` and its same-key replay returned `504 AI_TIMEOUT`. The test requires the same status and body and checks that the run is recorded as failed with `AI_TIMEOUT` before replay. |
| SEC-REV-04 | Security | P2 blocking | LRN-05.5, SEC-03, SYS-12 | Fixed pending G3 review | The UUID check strips default-ignorable code points and combining marks from its normalized copy only. The three committed Unicode cases take the existing retry and rejection path and store no grade. |

Full lint, verify, build, browser tests and live smoke were unrun at this test gate.

## Open questions

None. Shawn authorized the bounded recovery at G3.

## Next action

Stopped at G4. Shawn reviews the Docs diff, runs `bun run verify` and `bun run test:e2e`, runs the live multi-match smoke and records repeated-pair rejections and retries, and switches hosted development to live SoC and records the settings evidence. Then commit the guide and close-out updates, write the session log and open the feature PR.
