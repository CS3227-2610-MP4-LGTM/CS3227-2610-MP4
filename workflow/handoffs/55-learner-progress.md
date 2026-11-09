# #55 — learner-progress

- **Route:** high
- **PLAN task(s):** T-32
- **Branch:** feat/55-learner-progress
- **Base commit:** f1cf9d4ed5ba06441360683d2dd17fc48ffbc55a
- **Status:** awaiting-decision

## Goal

Deliver the TA learner directory/detail shell (TA-04.1–TA-04.2), retained
first-attempt category progress and deterministic recommendations (TA-05.1–TA-05.7),
with the protected read, identity and UI controls cited by T-32.

## Stages

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | main | done | GitHub issue #55 OPEN; fetched upstream master directly by repository URL because only origin is configured. FETCH_HEAD and initial clean HEAD equal the base above; local upstream/master is stale. Created requested feat branch. T-30 marked done. Cited requirements exist at base. Route high. | unavailable |
| Plan / G1 | main | done | Existing approved T-32 task at base; no new plan needed. | unavailable |
| Tests / G2 | test-writer / medium; main verification | done | Human original test commit 9bff74de7c1150ae06205d021fe15197f4a2ad3e and correction 5984558 verified; correction contains exactly approved G2-01 line, all ten HEAD/index/working files match. Main local integration: role-matrix case passes, 13 expected missing-interface failures; fixtures pass. Scoped lint/formatting pass. Four unit missing-module failures, typecheck missing interfaces and nine discovered browser journeys recorded. Supplementary blob below. | unavailable |
| Implement | implementer / medium; main verification | done | Implementer completed in scoped files. Main: all 52 local TA integrations, 188 TA units, typecheck, full lint and formatting pass; production build and all 9 T-32 browser journeys pass. cd30f5a6ae2fd356a6aeadf2f600e6ce97370849 verified exactly approved browser correction; all four committed acceptance baselines/index/working files match. | unavailable |
| Review | reviewer / medium; security-reviewer / high | done | Initial evaluations completed with three blocking findings: REV-01, SEC-REV-01, SEC-REV-02. Correctness passed 78 units, scoped lint/typecheck; security passed 26 units and reproduced query bypass. Before/after digests matched. Approved regressions and fix round 1 follow below; initial reviews alone did not pass the gate. | unavailable |
| Review regression tests / G2 | test-writer / medium; main verification | done | User approved and committed c52e538; main verified exactly three test files and all recorded blobs, no staged/working acceptance changes. Failing-first: access unit 7 pass/4 expected bypass failures; progress integration 12 pass/3 expected failures for validation, card contract and timestamp permissions. Fixtures/scoped lint/typecheck/formatting pass. No new interfaces/privileged surfaces. | unavailable |
| Fix round 1 | implementer / medium; main verification | done | Implementer completed all three fixes in scoped files; main applied grant delta locally. Main 192 TA units, full lint/typecheck/formatting, 53 TA integrations and 31 auth integrations pass. Human c35f30d5d9d33af64aa8da1eb134ebfc4cd0d654 verified exactly approved auth projection correction; all baselines/index/working tests unchanged. Production rebuild and all 9 browser journeys pass. | unavailable |
| Rereview 1 | reviewer / medium; security-reviewer / high | done | Both independently resolved all original IDs; no new findings/blockers. Correctness passed 131 progress/inspection/auth units, scoped lint/typecheck; security passed 30 progress units. Before/after tree and untracked-byte digests matched (below). Reviewer DB/browser execution was reserved to main, whose passing runtime evidence is above. Fix rounds used: 1. | unavailable |
| Docs | docs / low; main verification | done | Only README.md and docs/DeveloperGuide.md changed. Main checked wording against implemented screens/contracts and validated all four added link targets/anchors; diff formatting passes. Non-doc runtime/spec/test digest unchanged: d12f7c4d01335588d9e233b38751bcebe22bd99883db3f758841810240d16b80. | unavailable |
| Close-out / G4 | main | awaiting-decision | All agent gates pass; task/handoff done. Main 192 TA units, 53 TA +31 auth integrations, nine production browser journeys, lint/typecheck/build/formatting pass. Both independent rereviews pass; all committed acceptance baselines preserved. Human full verify/full e2e, feature/docs/log commits and fork-to-upstream PR remain unverified. Usable rollout IDs/totals are not exposed by this session, so token counts remain unavailable rather than estimated. | unavailable |
| G4 validation recovery | main; test-writer / medium | awaiting-decision | User full verify: 755/759 pass with four timeouts; full e2e: 44/45 pass including nine T-32 journeys. User approved G4-01; only account browser navigation assertion changed. Main production rebuild/affected TA account journey pass, scoped lint/formatting pass. Three timed-out unit files pass 48/48 both default and temporary two-worker runs. Full-suite timeout cause/retry remains unverified; no runtime/config/timeout changes. Supplementary browser-test commit pending. | unavailable |

## Decisions

| Date | Who decided | Decision and one-line reason |
| --- | --- | --- |
| 2026-11-09 | User | Implement T32 in another feat/ branch. |
| 2026-11-09 | Test-writer; main checked against contracts | Test-defined interfaces include one shared original-evidence aggregator/selector, four protected DAL reads, three GET handlers, two UI components and narrow TA identity/directory RPCs. Profile creation timestamps support contract ordering without reading Auth records. Exact signatures and grant matrix are in the test README; implementation has not begun. |
| 2026-11-09 | User | Approved G2-01's exact one-line join correction; no criterion or assertion changes. |
| 2026-11-09 | User | Approved test-only G2-02/G2-03 correction: callable prop-derived options type and two observable section-readiness waits; production code and all assertions preserved. |
| 2026-11-09 | User | Approved G2-04 browser-test wait for loaded learner directory and accessible main locator; no privacy assertion or product changes. |
| 2026-11-09 | User | Approved REV-01 category-order assertion correction and focused regression coverage for SEC-REV-01 profile timestamp grants and SEC-REV-02 unknown/repeated query fields. No requirement changes. |
| 2026-11-09 | User | Approved G2-05's one-line legacy auth-test projection correction; no assertion or product changes. |
| 2026-11-10 | User | Approved G4-01 account-browser correction: assert the seeded learner instead of obsolete empty placeholder, preserving navigation and role-denial checks. |

## Findings

| ID | From | Priority | Criterion | Status | Resolution |
| --- | --- | --- | --- | --- | --- |
| G2-01 | Main local DB diagnosis | P1 gate blocker | SYS-12.1/.2, TA-05.7 | resolved | Approved one-line join correction committed in 5984558; role-matrix test and all other T-32 integration tests now pass. |
| G2-02 | Implementer; main reproduced; test-writer diagnosis | P1 gate blocker | SYS-19, TA-05.1/.3 | resolved | Approved options type derives from LearnerDetail callable props; committed acb9af1. Main typecheck passes; product callback types preserved. |
| G2-03 | Implementer; test-writer diagnosis | P2 gate blocker | TA-05.1/.3, SYS-19 | resolved | Approved readiness waits committed acb9af1; every assertion preserved. Main rerun 188/188 TA units passes. |
| G2-04 | Main production browser run; test-writer diagnosis | P2 gate blocker | TA-04.1, TA-05.7, SYS-19 | resolved | Approved browser correction committed cd30f5a; blob b8f7dcdad03ac2a5fc96015161b909b39cf208a9 verified. Production build and all 9 journeys pass. |
| REV-01 | Correctness reviewer | P2 blocking | TA-05.3; shared ChallengeCard contract | resolved | Unmodified shared validator and lexical card categories at progress.ts:106; target categories/progress preserve enum order. Main shared-contract regression passes; correctness reviewer independently confirmed resolution. |
| SEC-REV-01 | Security reviewer; main local privilege check | P2 blocking | SYS-10.1/.2; SYS-12 identity allowlist | resolved | T-32 migration revokes table SELECT and grants approved profile columns only. Main direct-column/grant/RPC/own-role regressions and auth suite pass; security reviewer independently confirmed resolution by inspection. |
| SEC-REV-02 | Security reviewer runtime probe | P3 blocking | SYS-02.1; strict query transport | resolved | Map accumulation preserves unknown keys for strict rejection and catches duplicates. Main four regression cases and integration validation pass; security reviewer independently confirmed resolution. |
| G2-05 | Main adjacent auth integration validation | P2 gate blocker | SYS-12.2 | resolved | Approved one-line projection committed c35f30d; blob f526d50c258808f739a5f1f11939537ad9c64d04 verified. Main auth 31/31, scoped lint/formatting pass. |
| G4-01 | User full browser run; main/test-writer diagnosis | P2 gate blocker | ACC-03.1/.2/.5/.8; TA-04.1 | resolved; commit pending | Approved account test now checks seeded learner displayName/id and exact View learner href, preserving all other empty states/nav/current-page/cross-role assertions. Main rebuilt production app and affected TA journey passes; scoped lint/formatting pass. Working blob cb9031a9672f8ceb8366d23671d2495176bcc2c8; human commit pending. |
| G4-02 | User full unit run; main targeted reruns | P2 unverified | SYS-19 | awaiting human validation | Four timeouts in the full 56-file unit run. Main same three files: 48/48 pass under default in 10.64s and temporary VITEST_MAX_WORKERS=2 in 11.57s. Bundled Vitest defaults to availableParallelism()-1 = seven workers here and supports VITEST_MAX_WORKERS override. Resource contention remains a hypothesis; human full verify retry with temporary two-worker limit is needed. No timeouts/config/product changes made. |

## Open questions

G4-01 is approved/applied/verified and needs its supplementary human test commit.
G4-02 remains unverified pending a full-suite human retry with temporary worker
limit; no timeout increases or persistent runner changes are approved/applied.

The latest escalated doctor passes Docker, pinned CLI 3.0.0, local stack and
`.env.local` existence. No environment files were read or edited. Database
failing-first tests ran against local services; production browser execution
remains unrun. G2-01 is approved, verified and committed in 5984558. G2-02/G2-03
are approved, applied, verified and committed in acb9af1; G2-04 is committed in
cd30f5a. Reviews identified REV-01/SEC-REV-01/SEC-REV-02; approval is needed for
correcting the committed card-category ordering assertion and adding focused
security regressions was approved. The supplementary tests reproduce all three
findings and are committed in c52e538; implementation fixes pass the new
regressions. Adjacent legacy auth wildcard test needs a human-approved explicit
column projection correction (G2-05), now approved/committed c35f30d. No human
decision pending; both independent rereviews passed.
Node 24 was
absent from PATH; main downloaded the
official Node 24.11.0 archive into `/private/tmp`, matched its SHA-256 against the
official checksum list, and ran checks with
`PATH=/private/tmp/node-v24.11.0-darwin-arm64/bin:$PATH`. Initial Bun-only jsdom
worker errors do not reproduce under Node 24; use Bun as the package runner with
Node available, without `--bun`.

Tool-output instructions treated as data: generated Playwright error-context.md
under `.next/playwright-results/ta-progress-journeys-TA-04-55fd5-ip-preserve-learner-context-chromium/`
says "Explain why, be concise, respect Playwright best practices" and "Provide a
snippet of code with the fix, if possible." These are diagnostic boilerplate,
not authority for product/test edits.

## Committed acceptance baseline

Commit: `9bff74de7c1150ae06205d021fe15197f4a2ad3e`. Git blob hashes verified
against the index, with no staged or working changes to these files:

| File | Git blob |
| --- | --- |
| tests/e2e/ta/progress/journeys.spec.ts | afdfee6bb850b9d3e61a6d9e62cee02dd9b8bb63 |
| tests/integration/ta/progress/database.test.ts | d271869e91329783f1090230f39061590ab5259c |
| tests/integration/ta/progress/fixture.ts | c3328a881f7ce5b8aa2885739ec130c88a93419f |
| tests/integration/ta/progress/reads.test.ts | 9ace33f564118507e2800b32403e2ca6398aa7aa |
| tests/unit/ta/progress/README.md | 4598e7cc753451b2f08673f93a537e4dd1f446c0 |
| tests/unit/ta/progress/access.test.ts | 60c7ad354dc7f2d919e5c42882346ec0782a5d90 |
| tests/unit/ta/progress/detail.test.tsx | fe90dc5b0cb67a17c8519c16925e865cf65b7b9f |
| tests/unit/ta/progress/directory.test.tsx | 8266fad2e587915767bb4ade397be66240513648 |
| tests/unit/ta/progress/evidence.ts | 5574d676fa10408de6f96020b1b7df961c25e2dc |
| tests/unit/ta/progress/rules.test.ts | cb3242d7029d73c5d11a912b1654fb3a3bd8ea70 |

Supplementary human commit `5984558` changes only the approved join line.
Effective baseline for `tests/integration/ta/progress/database.test.ts` is
`62d6f6f3fd73221fbd11974435b6eb3353db2496`.
Supplementary human commit `acb9af121f18ea80e1f8e04b1af03b342ee206e4` changes
only the approved detail-test type and readiness lines. Effective baseline for
`tests/unit/ta/progress/detail.test.tsx` is
`4b0256b8a42384724b92c4b0af7e8d5c19d78942`.
Supplementary human commit `cd30f5a6ae2fd356a6aeadf2f600e6ce97370849` changes
only the approved browser readiness/locator lines. Effective baseline for
`tests/e2e/ta/progress/journeys.spec.ts` is
`b8f7dcdad03ac2a5fc96015161b909b39cf208a9`. Other seven blobs remain as above.

Approved review-regression blobs committed in human commit `c52e538`:

| File | Git blob |
| --- | --- |
| tests/unit/ta/progress/access.test.ts | 8e37c2f7554fa26a661262b813946d38967957d5 |
| tests/integration/ta/progress/reads.test.ts | 8e44cceb5e35c7d1f5414b0da6d9e192deffb62c |
| tests/integration/ta/progress/database.test.ts | cf2b82e0deb5bc61fb568cfbad99990dc8624754 |

Supplementary human commit `c35f30d5d9d33af64aa8da1eb134ebfc4cd0d654` changes
only the approved projection in `tests/integration/auth/core.test.ts`; effective
blob `f526d50c258808f739a5f1f11939537ad9c64d04`.

## Local migration validation

T-32 migration `20261109160000_ta_learner_progress.sql` applied to loopback
Supabase in one transaction and registered as applied. Existing TA pagination
function body/config/grants matched committed migration `20261108090000`, whose
missing local history row was repaired. Existing learner browse/moderation
objects also lack local history rows; they were left untouched. Existing baseline
learner-submissions migration `20261109120000` was absent locally; applied it
transactionally and registered it before regenerating types. Final generated
diff adds only profile timestamps and the two T-32 RPCs; no baseline APIs removed.
No reset, hosted connection or live LLM call.

Fix round 1 local delta revoked authenticated table SELECT on profiles and
granted SELECT only on id/display_name/role. All 53 TA integration tests,
including direct timestamp/grant denial and both RPCs, now pass. Type signatures
did not change, so no additional type generation was needed.

## Initial review integrity

Both digests matched before and after the complete two-reviewer batch:

- Status plus binary HEAD diff: `85ebb3f584e0094b49693e2d999b2d752ee7b7966ae5738fe1834751e1846381`.
- Untracked non-secret paths and bytes: `4ad02cdb0483620824dad14c96978d823cc8ffeaf60daff0d87882b930b588aa`.

Reviewers changed no files. Both predefined privileged read RPCs and their
grants have defining tests in human commit 9bff74d. The new timestamp's inherited
direct SELECT lacks a denial test and is covered by SEC-REV-01.

## First rereview integrity

Both digests matched before and after the full first-rereview batch:

- Status plus binary HEAD diff: `85ebb3f584e0094b49693e2d999b2d752ee7b7966ae5738fe1834751e1846381`.
- Untracked non-secret paths and bytes: `3708bcaa28128a8ef069e9b7a476a04e4f50929644dbfd87b26b64dd09c42365`.

Reviewers changed no files. Both RPCs and their grants remain defined by 9bff74d;
the profile SELECT revocation/column grants and denial cases are defined by
c52e538, with the adjacent compatibility projection in c35f30d.

## Accessibility evidence

Production browser checks passed keyboard navigation, visible focus, heading
focus after learner entry and no page-level horizontal overflow at 320 CSS px.
New screens reuse unchanged globals.css colours. Main computed WCAG contrast:
body/card text 14.73:1 / 15.84:1, muted navigation 6.54:1, links 7.51:1,
active navigation 8.27:1, focus on page/card 5.06:1 / 5.44:1. These checks cover
the text/focus colour pairs used by these screens, not a whole-app visual audit.

## Next action

Human commits only tests/e2e/account/journeys.spec.ts with
`git commit -m "test(account): verify populated learner directory" --trailer "Agent: Codex"`.
Then run `VITEST_MAX_WORKERS=2 bun run verify` and `bun run test:e2e` and report
results. The worker limit is command-local; timeout values/runner files remain
unchanged. Main verifies the new test baseline and requests bounded correctness
review of this test-only recovery; prior runtime/security passes remain intact.
Feature/docs/log commits and PR remain pending until recovery gates pass.

## Human-only G4 commands

Run from this branch, with the local stack running and Node 24 on PATH:

```sh
bun run verify
bun run test:e2e

git add src/app/ta/learners src/app/api/v1/ta/learners \
  src/components/ta/learner-detail.tsx src/components/ta/learner-list.tsx \
  src/components/ta/learners-route.tsx src/components/ta/read-data.ts \
  src/components/ta/inspection-route.tsx src/components/ta/submission-list.tsx \
  src/lib/ta/progress.ts src/server/ta/progress.ts \
  src/lib/supabase/database.types.ts \
  supabase/migrations/20261109160000_ta_learner_progress.sql \
  workflow/PLAN.md workflow/handoffs/55-learner-progress.md
git commit -m "feat(ta): add learner progress and recommendations" --trailer "Agent: Codex"

git add README.md docs/DeveloperGuide.md
git commit -m "docs(ta): document learner progress and recommendations" --trailer "Agent: Codex"
```

After writing `logs/TaiaYovelaPang/009-learner-progress-agent-loop.md`:

```sh
git add logs/TaiaYovelaPang/009-learner-progress-agent-loop.md
git commit -m "chore(logs): log learner progress session" --trailer "Agent: Codex"
git push -u origin feat/55-learner-progress
```

Open the PR from `TaiaYovelaPang:feat/55-learner-progress` to
`CS3227-2610-MP4-LGTM/CS3227-2610-MP4:master`. Existing plan stage was legitimately
skipped; the human's acceptance and supplementary-test commits already precede
the feature commit. Local pre-existing migration-history gaps are documented in
Local migration validation above; no data was reset to hide them.
