# #52 — Learner feedback, hints and Retry challenge

- **Route:** high
- **PLAN task:** T-13 (Learner)
- **Branch:** `feat/52-learner-feedback-retry`
- **Base commit:** `b297ab68af6e81ccb1829fa36300629f6d8be377`
- **Status:** done

## Goal

Show the Learner their original assessment feedback, reveal eligible cached hints and support one pinned second attempt under LRN-06.1–06.7 and SEC-03.2.

## Stages

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | Main | Complete | [Issue #52](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/issues/52) verified open. The feature branch started clean at `upstream/master`, the merge of #87. Verified the LRN-06 criteria, cited SYS and SEC criteria and Learner contracts at base. T-10, T-11 and T-12 are done at base. | See Main sessions |
| Plan / G1 | Planner / high, then Main | Complete | Verified Shawn's `cc4ff60670b4b88ff18c7eaa41a214ef5e50418c` is the first feature commit, has the recorded base as its parent and only adds the approved T-13 to [PLAN](../PLAN.md#t-13-feedback-hints-and-retry-challenge). `git show --check` passed. | 1764515 (planner) |
| Tests / G2 | Test-writer / medium, then Main | Complete | Verified compatibility commit `19fdb02cabac8e4f55a69415e96d713aaecb408a` follows G1 and matches the three approved edits. Acceptance commit `544cdf9f2768269d7ba3f53e33b6dd2b1bb0dd66` adds the six T-13 files. Both passed `git show --check`. Targeted runs below reached the expected failures. | 5459131 (test-writer) |
| Implement | Implementer / medium, then Main | Two fix rounds complete | G2 tests unchanged in index and working tree. Fix 2 touched the result component and supplementary adapter unit tests. Applied the migration locally without a reset and regenerated types. Node 24.22.2: 193 Learner unit tests, 93 local Supabase integration tests, nine committed and five focused production Chromium cases, lint and typecheck passed. Vitest used `--no-fs-module-cache` to refresh G2 route globs. | 6803077 (initial), 1443554 (fix 1), 1967157 (fix 2) |
| Review / G3 | Reviewer / medium and security-reviewer / high | Complete | Security passed with two nonblocking findings. Both initial reviews covered all three privileged database surfaces against approved tests. Initial before/after matched: status/diff `cc44157850c411abc6f5f4d94018479a11998463fd5abb44c2be1059a8754bc7`, untracked `8890d88e02c3ed83e37ecbab3cd7690b78b9cf57fe069a2f53dfd0041a285c6b`. Rereview 1 before/after matched: status/diff `c770232a751eac05cd5cb54af675117cdcdc7ab613092c8f739de6b4d946d286`, untracked `e2957ccc296b3bff6c5b025e69a0224f9df61f399e7078ff4663a17a4ececd2d`. Rereview 2 before/after matched: status/diff `845c0f82d9b325c3b4d3ec86b721e2a87a81c22252670771e4e84d02dba7c000`, untracked `38048901c0978f1dff2ae2d04173dfcfd6ffe4ea95b60797d8e82288a3738868`. | 1423287 (initial correctness), 2381439 (security), 154061 (interrupted rereview), 1144349 (rereview 1), 1213522 (rereview 2) |
| Supplementary Tests / G2 | Main | Complete | Verified Shawn's `9707a983df10cf19888cb754b2ea0229bb96d4b7` follows `544cdf9` and adds only the two approved files. Both blobs match the supplementary checkpoint. The original and supplementary G2 tests match the index and working tree. Failing-first evidence below. | See Main sessions |
| Implement / REV-04 recovery | Main | Complete | Verified the prior rereview's tracked checkpoint and the supplementary checkpoint's product blobs. The recovery changes only the workspace history tracker and its root layout mounting. Restored retry URLs show “Loading retry…” and reload through the existing caller-scoped page. Node 24.22.2: 193 Learner unit tests, 93 local Supabase integration tests, 11 committed Chromium cases, lint, typecheck and whitespace checks passed. | See Main sessions |
| Review / REV-04 recovery | Reviewer / medium, then Main | Complete | Reviewer resolved REV-04, confirmed the three privileged database surfaces have approved test coverage, and found no server authorization or database surface change. Prior security pass stands. Targeted Chromium probes verified the pending screen with no editor and the leave dialog on a second Back. Browser BFCache events were reviewed statically. Before/after matched: status/diff `8fd85a53bd724dbdf88fc7aa9fc5c301da8df7abb137bd22d129b075e45c3990`, untracked `384d680a715d2dc5fc9b010e522a561c5b97502efced4677fce21feb53a550a8`. | 689523 |
| Docs | Docs / low, then Main | Complete | README and Developer Guide cover feedback, cached hints and retry entry, recovery and contracts. Checked guide scope, on-screen wording, repository link targets and whitespace. | 652913 |
| Close-out / G4 | Main and Shawn | Awaiting human validation | The full e2e run failed when document navigation made the 201 response body unavailable. The approved test fix now waits for the result URL and reads the second attempt ID there. The edited blob is `bbe6a08d6b04433b98da1bb5b37df3243eedf9ed`. Removed six stale fixture accounts and their related records from local Supabase before rerunning. Node 24.22.2: both T-13 Chromium files passed with `--repeat-each 5` (25 cases), all 193 Learner unit tests passed with `--no-fs-module-cache`, and lint and typecheck passed. The repeated run left zero submission fixture accounts. Full verify, a fresh full e2e run and the Jekyll build remain pending. | See Main sessions |

## Main sessions

| Session | Stages | Thread ID | Measured total | Resume gaps |
| --- | --- | --- | --- | --- |
| 1 | Ready, Plan / G1 | `01a1c407-38e9-73e3-8ee3-41f45204dc21` | 2274853 | Initial session |
| 2 | Plan revision / G1 | `01a1c413-28ea-74b3-bfa6-23c731ae69f6` | 396924 | None |
| 3 | Tests / G2 | `01a1c415-6ecc-7092-ae6a-f236d7074ede` | 8736064 | None |
| 4 | Implement, Review / G3 | `01a1c424-84a6-7871-92ca-23623d7fe00d` | 17182602 | Continued in the same chat after the first rereview hit the usage limit. Review tree hashes matched. |
| 5 | G3 decision, supplementary Tests / G2 | `01a1c57f-0afd-7e33-bece-52c5d2a87221` | 2390342 | None |
| 6 | REV-04 recovery, correctness rereview, Docs and G4 | `01a1c585-7759-73a0-a647-ab77a320e423` | 8727286 | None |
| 7 | G4 test fix and targeted validation | `01a1c59d-8709-75e2-bb88-80271b0993d4` | 1678239 | None |

End each main session after updating this handoff at G1, G2, G3 or G4. On resume, first verify the gate commit named in the resume prompt and its scope in Git. Copy the previous session's `tokens.total_tokens` verbatim from `bun workflow/scripts/rollout-summary.ts --id <thread-id>` or record `unavailable`. Record any resume gaps or `none`.

## Decisions

| Date | Who decided | Decision and reason |
| --- | --- | --- |
| 2026-11-10 | Shawn | T-13 covers all of LRN-06 on the high route. LRN-07 and LRN-08 belong to T-14 on #52. T-12 owns “Retry grading”. T-13 owns “Retry challenge”. |
| 2026-11-10 | Shawn | Reuse T-12's stored feedback and the existing result reader. Read cached hints for the exact owned submission and completed original grade through a user-callable function. Use the existing §6 cache fixture. |
| 2026-11-10 | Shawn | Reuse T-11's create function, ledger, Origin and account checks, review draft and workspace draft guard. Serialize second-attempt creation under the challenge lock and pin the first attempt's revision. |
| 2026-11-10 | Shawn | Approve T13-G1-01 as proposed for a separate compatibility test commit at G2. Keep both RPC signatures and their call-site and grant-list tests. In `tests/unit/learner/submission-contract.test.ts` and `tests/integration/domain/learner-submissions.test.ts`, change one input each to a malformed previous ID and retain their validation assertions. Add well-formed foreign-ID denial coverage in the new T-13 access tests. In `tests/unit/learner/grading-result.test.tsx`, remove only the stored matched-feedback absence assertion and cover feedback appearing once in new LRN-06.1 tests. |
| 2026-11-10 | Shawn | Keep the exact §3 `GET /api/v1/submissions/:id` response and both DTOs. The result page reads `published` and the second attempt's ID under the caller's scope and passes them to `GradingResult`. The client combines them with live grading state so “Next actions” switches from the pending reason to “Retry challenge” on an eligible open result without a reload. The retry URL rechecks on entry. T-13 names the completion-while-open unit case and the cross-Learner scoped-read denial integration case. |
| 2026-11-10 | Shawn | Test that second-attempt hint reads use that attempt's own original grade's eligible hints. Deny first-attempt hint IDs on attempt 2 unless they are eligible on attempt 2's original grade. |
| 2026-11-10 | Shawn | Authorize one bounded REV-04 recovery cycle after the two fix rounds. Main writes the production Chromium regression and stops for a supplementary G2 commit, which also includes the unchanged fix-round-2 recovery unit test. Main implements in the next session without an implementer rerun. |
| 2026-11-10 | Shawn | A history-restored retry must show “Loading retry…” until a fresh caller-scoped eligibility check returns. Reuse the existing server read of `read_learner_retry_eligibility` with no new endpoint, RPC or grant. Run one independent correctness rereview of REV-04 and the diff since rereview 2. Rerun security review only if the fix changes a server or database surface. |
| 2026-11-10 | Shawn | Accept REV-03, SEC-REV-01 and SEC-REV-02 as P3s. Include them under Known issues in the PR body. |
| 2026-11-10 | Shawn | Keep the reviewed document navigation. At G4, approve a standalone test fix limited to `feedback-and-retry-challenge.spec.ts`. Wait for the result URL and read the second attempt ID there because document navigation can make the 201 response body unavailable to Playwright. Preserve all other assertions. The existing reviews stand. |

## Findings

| ID | From | Priority | Criterion | Status | Resolution |
| --- | --- | --- | --- | --- | --- |
| T13-G1-01 | Plan source check | G1 decision | LRN-06.1, LRN-06.5–06.7 | Resolved | Shawn approved the compatibility changes in Decisions. T-13 records the approved scope. |
| REV-01 | Correctness | P2 blocking | LRN-06.5 | Resolved | Route refresh rechecks caller-scoped eligibility after completed status recovery or grading acknowledgement. Two supplementary unit tests and temporary Chromium recovery and publication-race cases passed. |
| REV-02 | Correctness | P2 blocking | LRN-06.6, LRN-03.4 | Resolved | Discard restores the copied baseline. Retry entry uses the shared client link. Main reproduced the previous native warning and verified both choices in the shared dialog with the fix. Forward restored copies and cleared the abandoned edit while eligible. |
| REV-03 | Correctness | P3 | LRN-06 UI notes, SYS-17.1 | Accepted | Manual eligibility refresh replaces the focused control while pending. |
| REV-04 | Correctness | P2 blocking | LRN-06.6–06.7 | Resolved | A restored retry shows “Loading retry…” until its caller-scoped check completes. The eligible case starts with fresh copies. After unpublish, Forward shows “Retry unavailable” with no source editor. Independent rereview passed. |
| SEC-REV-01 | Security | P3 | SYS-08.2, SYS-12 | Accepted | Invalid retry sources can receive the existing challenge lifecycle classification before source validation. T-11 already exposes the same classification. |
| SEC-REV-02 | Security | P3 | SYS-11.1 | Accepted | A hint RPC transport 401 after initial session verification maps to generic hint recovery. |

## Known issues for the PR body

- **REV-03 (P3)** Manual eligibility refresh replaces the focused control while the check is pending.
- **SEC-REV-01 (P3)** Invalid retry sources can receive the existing challenge lifecycle classification before source validation.
- **SEC-REV-02 (P3)** A hint RPC transport 401 after initial session verification shows generic hint recovery.

## Tests / G2 coverage

| Test path | Blob at G2 |
| --- | --- |
| `tests/e2e/learner/feedback-and-retry-challenge.spec.ts` | `4355fda72809db0d3f973b4da3edd6432e46e000` |
| `tests/integration/domain/learner-feedback-and-hints.test.ts` | `219fe1b8572a727c5610763e8dba5a4b501c6ba8` |
| `tests/integration/domain/learner-retry-challenge.test.ts` | `a95c05aca978af77e7a3f2564be2480aa0c390e7` |
| `tests/integration/domain/learner-submissions.test.ts` | `ac2993cb041edf3a6b93671053661a4aa44f7226` |
| `tests/unit/learner/feedback-and-hints.test.tsx` | `c7ce4eed187cfb31add0f53ee763ff15f364cd8f` |
| `tests/unit/learner/grading-result.test.tsx` | `080b43ba28bee9fec1817be45c7f280e16b305f5` |
| `tests/unit/learner/retry-challenge-contract.test.ts` | `8625519dcbe38decf074e660c0e307737e4d947e` |
| `tests/unit/learner/retry-challenge.test.tsx` | `277a22047bc01ca751080d7678305814d724d9ca` |
| `tests/unit/learner/submission-contract.test.ts` | `ed3e3e7ff1c1f5d5f82982be01f247f0982521e7` |

| Criteria | Acceptance tests |
| --- | --- |
| LRN-06.1–06.2 | `tests/unit/learner/feedback-and-hints.test.tsx` covers the three sections, inert matched feedback, one display of credits and statuses, partial criteria, category counts and empty states. The hint integration suite preserves the exact result DTO. |
| LRN-06.3–06.4, SEC-03.2 | The same unit suite covers ordered reveal, no prefetch, loading, reset, recovery and account errors. `tests/integration/domain/learner-feedback-and-hints.test.ts` covers grants, safe projections, ownership and eligibility denials, second-attempt scope, shared eligible hint IDs, historical access and absence of provider or accounting writes. |
| LRN-06.5 | `tests/unit/learner/retry-challenge.test.tsx` covers precedence, passing originals and live completion. `tests/integration/domain/learner-retry-challenge.test.ts` covers scoped eligibility reads and grants, pending/failed/override-only originals, and denied retry references and roles. |
| LRN-06.6–06.7 | The retry component, contract and integration suites cover independent pinned drafts, order and reload, confirmation and recovery, request and acknowledgement binding, lifecycle and concurrent keys, and legacy replay. `tests/e2e/learner/feedback-and-retry-challenge.spec.ts` covers the keyboard hint and retry journey at 320 px, guarded departure, reload, second-result navigation and direct-entry recovery. |

### Interfaces defined by tests

- `GET /api/v1/submissions/:id/hints/:hintId` in `src/app/api/v1/submissions/[id]/hints/[hintId]/route.ts` returns `{ data: { hintId, category, text } }`. The authenticated-only `public.read_learner_submission_hint(p_submission_id uuid, p_hint_id uuid)` returns `{ status: "ok", hint: { hintId, category, text } }` or a safe denial.
- The authenticated-only `public.read_learner_retry_eligibility(p_submission_id uuid)` returns `{ status: "ok", published, secondSubmissionId }` for the owned source or a safe denial. `GradingResult` takes `published` and `secondSubmissionId` as props. The default retry page in `src/app/learner/history/[id]/retry/page.tsx` takes `params: Promise<{ id: string }>` and provides the “Loading retry…” fallback.
- The existing submission request and `create_learner_submission(uuid, uuid, jsonb)` accept optional `previousSubmissionId` in the payload. `ReviewDraft` accepts `previousSubmissionId` and `initialComments` as optional props. The server and client bind the acknowledgement to the named first attempt. The existing result and submission response shapes stay as specified.

### Failing-first evidence

- Node `24.22.2`, `bun run test tests/unit/learner` — 25 expected failures and 165 passes. The result lacks learning sections, hint controls and retry actions. The draft lacks copied comments, the valid retry payload returns 400, retry acknowledgement checks use first-attempt semantics, and the retry page is missing.
- Local Supabase, `bun run test:integration` with the two new domain suites and the T-11 submission suite — 11 expected failures and 12 passes. The hint route and both new RPCs are missing. Valid retry requests fail validation, including the direct call returning `invalid` before acquiring the challenge lock. The strict existing result projection and all 11 T-11 submission tests pass. The broader T-11/T-12 integration run also passed all six existing suites (52 cases).
- Production Chromium with the local fake provider — three expected failures in `feedback-and-retry-challenge.spec.ts`. The original assessment renders before the missing “Earned credit” assertion. The absent retry route prevents direct access and recovery. All six cases in the existing `review.spec.ts` and `grading.spec.ts` passed.
- `bun run lint`, `bun run typecheck` and whitespace checks passed. Full `bun run verify` and the full browser suite remain for G4.

### Supplementary G2 coverage

| Test path | Verified blob at supplementary G2 | Evidence |
| --- | --- | --- |
| `tests/e2e/learner/retry-history-restore.spec.ts` | `172fa7f2c0293c44f4a70fb73c7d2dfb8d4d5d4f` | LRN-06.5–06.7. `bun run test:e2e tests/e2e/learner/retry-history-restore.spec.ts --project chromium` produced one pass and one expected failure. Both cases edit a copy, traverse Back and confirm “Leave review”. Forward while eligible restores the original comment without the abandoned edit. Forward after unpublish should show “Retry unavailable”, the LRN-06.5 unpublished reason and “Back to result”, with no source region. The current tree instead exposes the editor. |
| `tests/unit/learner/retry-recovery.test.tsx` | `0bb1655c460295e609a523ed07c56ffe9faabc0b` | Added during fix round 2 without a test gate. It was not failing-first. Preserved byte-for-byte for this supplementary G2 commit. `bun run test tests/unit/learner/retry-recovery.test.tsx --no-fs-module-cache` passed all three cases. |

At the supplementary G2 checkpoint, the original G2 files matched their committed versions in the index and working tree. The stage checkpoint shows no product-code changes during that cycle. The committed Learner Chromium cases, broader unit and integration suites, full verify and full e2e were not rerun at supplementary G2. The later G4 test fix is recorded separately above.

## Next action

Shawn commits the G4 test fix separately. The automatic approval review
rejected the agent's commit because AGENTS.md reserves commits for humans.

```sh
git add -- tests/e2e/learner/feedback-and-retry-challenge.spec.ts
git commit -m "test(learner): read retry attempt from result URL" --trailer "Agent: Codex"
```

Shawn runs full validation, commits the feature, guide and session log
separately, and opens the feature PR from the fork to `upstream/master`.
Include the three accepted P3 findings under Known issues.

```sh
bun run verify
bun run test:e2e
```

After both checks pass, stage and commit the reviewed implementation and handoff.

```sh
git add -- \
  src/app/globals.css src/app/layout.tsx \
  'src/app/api/v1/submissions/[id]/hints/[hintId]/route.ts' \
  'src/app/learner/history/[id]/page.tsx' \
  'src/app/learner/history/[id]/retry/page.tsx' \
  src/components/account/workspace-history.tsx \
  src/components/learner/client-submissions.ts src/components/learner/grading-result.tsx \
  src/components/learner/missed-criteria.tsx src/components/learner/retry-review.tsx \
  src/components/learner/review-draft.tsx src/lib/learner/feedback.ts \
  src/lib/learner/submissions.ts src/lib/supabase/database.types.ts \
  src/server/learner/submissions.ts supabase/migrations/20261110130000_learner_feedback_retry.sql \
  workflow/PLAN.md workflow/handoffs/52-learner-feedback-retry.md
git commit -m "feat(learner): add feedback hints and challenge retry" --trailer "Agent: Codex"
git add -- README.md docs/DeveloperGuide.md
git commit -m "docs(learner): describe feedback hints and challenge retry" --trailer "Agent: Codex"
```

Commit the session log, which includes the G4 test fix:

```sh
git add -- logs/shawnnygoh/026-learner-feedback-retry.md
git commit -m "chore(logs): record learner feedback and retry sessions" --trailer "Agent: Codex"
```
