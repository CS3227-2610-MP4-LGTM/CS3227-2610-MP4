# #49 — learner-browse

- **Route:** high
- **PLAN task:** T-10
- **Branch:** feat/49-learner-browse
- **Base commit:** 149368677922564c4c819ddfa601abdabda78fc8
- **Status:** done

## Goal

Deliver the published challenge catalogue and read-only PR view under LRN-01
and LRN-02. Start the shared SYS-04 code/diff renderer with the Learner
new-file projection so Author and TA can reuse it with their own projections.

## Stages

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | main | done | GitHub #49 is open. Initial tree was clean. HEAD and local upstream/master matched the base commit above. Approved stories, contracts and named system criteria were verified at the base. T-02 and T-03 are done. | 1249528 |
| Plan / G1 | planner / high | done | Verified human-approved commit `009bdd789d98f9a792790677483d21635873230c` directly on the base. It adds only the revised T-10 entry under Learner. | initial 867271, revision 560610 |
| Tests / G2 | test-writer / medium, two scopes | done | Verified approved test-only commit `cb5529eeeca7e9f39939bc72b306e5fba9e7e348` directly on G1. Main observed expected failures in unit, local integration and production-baseline browser checks. Git blob baseline below. | integration 2102537, unit and e2e 1854995 |
| Implement | implementer / medium | done | G2 blobs and index unchanged. Main passed 153 targeted unit cases, lint, typecheck and 64 Learner/Auth integration cases. Production Playwright passed 19 Learner/account cases, with 4 Learner cases repeated on the final initial implementation. | 2423324 |
| Review, initial batch | reviewer / medium + security-reviewer / high | done | Both before/after tree digests matched. Initial blocking findings led to the G3 decision and the two fix rounds below. | correctness 922970, security 1289380 |
| Supplementary G2 | test-writer / medium | done | Verified human commit `89657a0691bdd9fefed15b52004b598f5c9e1f5e` directly on G2 with exactly the two approved additions. Original and supplementary blobs and index match. Main observed 10 integration passes, one stale-cursor failure, and one production browser pass before fixes. | 951520 |
| Implement, fix round 1 | implementer / medium | done | Both test baselines and index unchanged. Main refreshed only the catalogue function on LGTM's local stack with no signature changes. Passed 159 targeted unit cases, lint, typecheck, 75 integration cases and 20 production browser journeys. | 1759875 |
| Scoped rereview, round 1 | reviewer / medium + security-reviewer / high | done | Both digests matched. Security cleared SEC-REV-01–03. Correctness cleared REV-03–04 and left REV-01–02 open for the narrower cases below. | correctness 600467, security 517618 |
| Implement, fix round 2 | implementer / medium | done | Both acceptance baselines unchanged. Main refreshed only the catalogue function on LGTM's local stack and passed 164 targeted unit cases, 75 integration cases, all 5 Learner production browser journeys, lint and typecheck. | 1109120 |
| Scoped rereview, round 2 | reviewer / medium | done | Both digests matched. Correctness cleared REV-01 and REV-02. Security's round 1 pass is preserved. | 355607 |
| Docs | docs / low | done | README and Developer Guide only. Main verified documented behavior and on-screen labels, all six added links and applicable anchors, and unchanged non-guide files. | 362081 |
| Close-out / G4 | main | awaiting-decision | All agent stages passed. Both acceptance baselines match. Human verify and e2e, feature and docs commits, session log, and PR remain pending. | 45589380 |

## Decisions

| Date | Who decided | Decision and reason |
| --- | --- | --- |
| 2026-11-08 | Orchestrator | Use the high route. Existing row policies hide unpublished and archived challenges from Learners without a submission. Approved categories also live in private flaw records. The proposed migration scopes both reads to the permitted decision or projection, with existing table policies and grants preserved. |
| 2026-11-08 | Human | The orchestrator runs every database-backed check with per-command escalation. Specialists report these checks as unrun. Ask before stopping or touching another project's local Supabase stack. |
| 2026-11-08 | Human | G3 approves supplementary acceptance tests in two new files only. Preserve all eight G2 files, including the fixture. Stop and report if the committed fixture cannot express a case. |
| 2026-11-08 | Human | Run both new suites against the current implementation and stop for the supplementary G2 commit. After that commit, fix REV-01, REV-02/SEC-REV-02 and REV-03 plus any defects exposed by the new tests. Rerun the two blocking reviewers only, scoped to those IDs and REV-04/SEC-REV-01/SEC-REV-03. This is fix round 1. |

## Findings

| ID | From | Priority | Criterion | Status | Resolution |
| --- | --- | --- | --- | --- | --- |
| REV-01 | correctness | P2 | LRN-01.7 | resolved | Issued cursors include the anchor revision ID. The page query returns the current matching anchor revision, and the API rejects a mismatch even when ordering fields still match. |
| REV-02 | correctness | P2 | LRN-02.7, ACC-03.6 | resolved | Detail and first-attempt reads recheck the caller after an ambiguous RPC denial, so profile loss reaches account recovery. |
| SEC-REV-02 | security | P2 | LRN-02.7, ACC-03.6–03.7 | resolved | Account failures from the material handler and attempt action reach the shared recovery boundary and replace the workspace. |
| REV-03 | correctness | P2 | LRN-01.4 | resolved | Browser queries use the default bound and the API retains limits 1–50. |
| REV-04, SEC-REV-01 | both | P2 | SYS-08.3, SYS-10.1, SYS-12.1 | resolved | Supplementary integration coverage checks catalogue grants, direct role denial, both Learners' projections and bounds. |
| SEC-REV-03 | security | P3 | SYS-09.3 | resolved | The committed same-browser account switch passed across Back, reopening and reload. |

Initial review digests matched before and after. The status and binary diff
digest was `112fcfbf3f1a0e0b18dc0d6c335ce01bfbf9c42525f919b63cd60e58a55f88af`.
The untracked file digest was
`dde5f2ecc5e12567973dc1fdcaa46e814977d032618700d444dec6314bc7ac47`.

Round 1 rereview digests also matched. The status and binary diff digest was
`cdabde2c819cbbc755c8fbe29e0191ad7e6bcc91edf72a77d9a48c2e9bd592ea`.
The untracked file digest was
`8bcd96e930ecdea32fbb51e282dba258e25844e798a0bb273b9d53b036b6cfb5`.

Round 2 rereview digests also matched. The status and binary diff digest was
`06a046ea523a9ebbf9e6eb778b7786f13d8e716dc4ace062ebfac573694b5694`.
The untracked file digest was
`9d92cf659762f996a6963e2660cd3f1a43d13b4755c6a29e51e621e56643388d`.

## Acceptance tests

| G2 test file | Git blob |
| --- | --- |
| `tests/e2e/learner/browse.spec.ts` | `b5f5d12a087493a3103ad567ba3cc6feb6bc42af` |
| `tests/integration/domain/learner-browse-fixture.ts` | `f2708eb583e8b3cad752cffc7f01bcc9bcf292f5` |
| `tests/integration/domain/learner-browse.test.ts` | `fd6c6ce0cf63177ca939dbb7bbcc4e283008a67a` |
| `tests/unit/learner/catalogue.test.tsx` | `1d6f05e92fa252f1d47f7d95a76a666d842d6237` |
| `tests/unit/learner/code-diff.test.tsx` | `7ac1590ef9c3b3560e297e2b70ea6472b23ddbfd` |
| `tests/unit/learner/projection.test.ts` | `838414358e3a56746775f3e2c0e4078d2e9d6f8b` |
| `tests/unit/learner/validation.test.ts` | `4277bd267776b1851c3a0f3f70905873a0935175` |
| `tests/unit/learner/workspace.test.tsx` | `d2db773523d8fd41cea1248b65a1a529c176739e` |
| `tests/e2e/learner/account-switch.spec.ts` (supplementary) | `77486fd2b89f0e6df5989ceb7e5cf4719578e94c` |
| `tests/integration/domain/learner-browse-catalogue.test.ts` (supplementary) | `6385edd2cf632c08456eb641e117fa1e089fa90e` |

| Criteria | Evidence |
| --- | --- |
| LRN-01.1–01.7, SYS-02.1–02.2 | `tests/unit/learner/catalogue.test.tsx` and `validation.test.ts` cover choices, inert cards, URL filters, cursor validation, focus, pending and recovery. `tests/integration/domain/learner-browse.test.ts` covers ordering, AND filters and page bounds. |
| LRN-02.1–02.7, SYS-04.2 | `tests/unit/learner/workspace.test.tsx`, `projection.test.ts` and `code-diff.test.tsx` cover read-only rendering, inert source, loaded revision retention, first-attempt and read outcomes. The integration suite verifies exact live projections, first-attempt isolation, no submission creation and denied versus missing records. |
| SYS-08, SYS-09, SYS-10.1–10.2, SYS-10.4, SYS-11, SYS-12.1 | Integration calls the protected handlers and readers with local Auth and probes RPC grants, RLS, and private table, column and join restrictions. HTTP responses must disable caching. Shared server boundaries and cache scope require implementation review. |
| SYS-17.1, SYS-17.3 | Unit focus and announcements, plus `tests/e2e/learner/browse.spec.ts` at 320 CSS pixels. The same browser file covers filtered URL history, forbidden versus missing detail, and the first-attempt link. |

### Failing-first evidence

- `bun --no-env-file run test tests/unit/learner` reaches five expected unresolved feature imports. Typecheck reports only missing feature modules. Targeted ESLint and `git diff --check` passed.
- Main escalated `bun --no-env-file run test:integration tests/integration/domain/learner-browse.test.ts`. Seven existing-policy cases passed. The 26 failures reference the missing handlers, server reader or `read_learner_challenge` RPC. The existing domain schema suite passed 39 cases, and the fixture smoke check seeded, switched the live pointer and cleaned up successfully.
- The workspace production build reaches the same missing test imports during typecheck. Main ran the exact browser file and fixture with a temporary production build of `009bdd7` that excluded unit and integration acceptance test files. The build and sign-ins succeeded. The four browser tests failed on absent catalogue links, forbidden and PR detail headings, and the absent language filter. Full verify remains unrun.

### Supplementary G2 evidence before fix round 1

- `tests/integration/domain/learner-browse-catalogue.test.ts` covers REV-04,
  SEC-REV-01 and REV-01. Main's escalated run passed 10 of 11 cases. The
  authenticated-only grant, direct denials, both Learners' card projections and
  limit checks passed. LRN-01.7 returned HTTP 200 for a cursor after its anchor
  left the live filtered catalogue, where the test expects HTTP 400.
- `tests/e2e/learner/account-switch.spec.ts` covers SEC-REV-03. Main's escalated
  production run passed. Learner B saw only B's first-attempt link after
  browser Back, reopening the challenge and reload.
- Targeted ESLint passed. The test-writer's non-database TypeScript check passed.
  The two new files reuse the unchanged G2 fixture. Product code was frozen.

### Interfaces defined by tests

- `src/app/api/v1/challenges/route.ts` exports `GET(request)`. `src/app/api/v1/challenges/[id]/route.ts` exports `GET(request, { params })` with `params: Promise<{ id: string }>`. Both preserve the §3 envelopes and status codes.
- `src/server/learner/challenges.ts` exports `readChallenge(challengeId)` and `readFirstAttempt(challengeId)`. On success they return `{ status: "ok", challenge }` and `{ status: "ok", submissionId }`, respectively. The attempt ID is nullable. Failures use tagged statuses.
- `public.read_learner_challenge(p_challenge_id uuid)` returns a JSON status. On a live success it also returns `revisionId` and sorted unique `categories`. Tests cover the authenticated grant and minimal direct output.
- `src/server/learner/validation.ts` exports `parseChallengeListQuery(URLSearchParams)` and `encodeChallengeCursor(anchor, filters)`. `src/server/learner/projection.ts` exports `projectLearnerCode(language, source)`.
- `src/components/code-diff.tsx` exports `CodeDiffView({ code })`. Learner components export `ChallengeCatalogue({ search, navigate, readPage })` and `ChallengeWorkspace({ challengeId, readChallenge, readFirstAttempt })` from `src/components/learner/challenge-catalogue.tsx` and `challenge-workspace.tsx`. Their test files define the injected read shapes.

## Open questions

None.

## Next action

At G4, the human runs `bun run verify` and `bun run test:e2e`, commits the
feature with this handoff and the PLAN status, commits the guide changes,
writes and commits the session log, and opens the PR to upstream master.
