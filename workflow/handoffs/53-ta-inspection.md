# #53 — ta-inspection

- **Route:** high
- **PLAN task:** T-30
- **Branch:** feat/53-ta-inspection
- **Base commit:** 27fd1b02090f426fd66ae13d80530e6365412ee2
- **Status:** done

## Goal

Deliver TA submission inspection and retained assessment evidence under
TA-01.1–TA-01.8 and T-30's cited system requirements, without starting grading
or moderation mutations.

## Stages

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | main | done | GitHub #53 is OPEN. GitHub upstream master equals the base above; local upstream/master is stale. Initial tree clean. T-02, T-03 and shared renderer #49 are done. Cited requirements exist at HEAD, which equals the verified upstream base. Feature branch created. | included in main snapshot |
| Plan / G1 | main | done | Existing T-30 task at base; no plan changes required. | included in main snapshot |
| Tests / G2 | test-writer / medium; main verification | done | Human test commit `4c0b0702db3d807fef971a38f5c748a88074bdd6` verified directly on base; all ten blobs below match, with no staged/working acceptance edits. Main observed four expected missing-module unit failures; local integration: one direct RLS/email pass and fourteen missing-route failures, fixture setup/cleanup passed. Lint passed; typecheck only missing TA modules. Seven browser tests discovered; browser assertions unrun because production build stopped at typecheck. | 2351768 (test-writer cumulative) |
| Supplementary G2 | test-writer / medium; main verification | done | Human commit `0c05f4184e2b005f587d1910b4e276c2fafbb8ee` verified directly on original G2: only the approved assertion-line correction. All fifteen TA integration cases passed. Corrected blob `82b03fc36eb9df91ddffada30ec0a17c9ee7e9c9`; all other G2 blobs/index/working files unchanged. | same test-writer total; not additive |
| Implement | implementer / medium | done | Both G2 baselines/index/working files unchanged. Main passed 209 targeted TA/learner/account/auth unit cases, lint and typecheck; 75 adjacent learner/auth integration cases passed, with all fifteen TA integration cases passing after approved test correction. Production build and all seven TA browser journeys passed. Migration applied locally and types regenerated. Implementer scope: src/ and new migration only. | 2202089 |
| Review | reviewer / medium + security-reviewer / high | done | Both fresh independent reviewers completed with no findings. Before/after tree and untracked-byte digests matched (below). Both independently passed all fifty-two TA unit cases; correctness also passed scoped lint. Reviewers left DB/browser execution to main, whose passing evidence is recorded above. No fix rounds. | correctness 646679; security 845050 |
| Docs | docs / low | done | README and DeveloperGuide only. Main compared wording against runtime and validated all three added link targets/anchor. Non-guide runtime/test digest unchanged: `7519ae4c035da5fad622b65382f65e69ef2131989667762a6986ad462257b398`. `git diff --check` passed. | 259193 |
| Close-out / G4 | main | awaiting-decision | All initial and recovery agent gates passed. Human-reported browser failures were corrected; both affected production journeys passed together. All three committed acceptance baselines preserved. Human full verify/final full browser rerun, feature/docs/log commits and PR remain pending. | 23989325 (latest cumulative main snapshot) |
| G4 validation recovery | implementer / medium; test-writer / medium read-only diagnosis | done | G4-01 fixed only in InspectionRoute. Main passed the existing TA signup/sign-out/sign-in production journey, 107 TA/account unit cases, lint and typecheck. G4-02 trace proves an extra pre-click landing read; approved test synchronization is recorded below. Recovery re-review remains pending. | implementer 2971878; test-writer 2790327; main 18365676 (cumulative recovery snapshots) |
| Supplementary G2 / browser synchronization | test-writer / medium; main verification | done | Human commit `0258d43daed261e4c43a818fdf192b2fef67d09d` verified: exactly the approved wait. Main passed both affected production browser journeys together (TA signup and read retry), retaining exact two-read assertion. Browser blob `a79aadf7578990f27f8650c335dfa819ecace8a5`; all acceptance working/index files match committed baselines. | test-writer 3015661; main 20506835 (later cumulative snapshots) |
| Recovery review | fresh reviewer / medium + security-reviewer / high | done | Both completed with no findings or criterion blockers. Before/after tree/untracked-byte digests matched (below). Correctness independently passed 68 targeted unit cases. Prior full-review evidence retained for unchanged behavior. | correctness 348977; security 482159 |
| Recovery Docs | docs / low | done | Existing README/DeveloperGuide remain accurate; no further edits. Docs rechecked 52 link targets/anchors and diff formatting. | 399853 (cumulative docs snapshot) |

## Token accounting

Recovered using `bun --no-env-file workflow/scripts/rollout-summary.ts --id
<thread-id>`. Values above copy `tokens.total_tokens` verbatim. The original
`unavailable` entries were an orchestration omission: readable rollouts and known
totals exist. Latest main close-out is a snapshot through `2026-11-08T14:07:35.214Z`,
including recovery follow-ups; it is not a separate total for each main-owned stage.
The test-writer total covers both its original and supplementary turns and must
not be counted twice. Totals include cached input; no cross-agent total is inferred.
Recovery row totals are cumulative snapshots of the same threads, not additional
stage costs. The Close-out row records the latest main snapshot.

| Role | Rollout thread ID |
| --- | --- |
| Main | `01a1bb2a-5e27-7b81-8ba7-c85462e03a93` |
| Test-writer | `01a1bb2b-8c2b-75d3-a25e-cc1fa343cc40` |
| Implementer | `01a1bb3c-7080-7b00-970c-5e31ee92c81e` |
| Correctness reviewer | `01a1bb51-db38-7843-a65b-05e3e0268a40` |
| Security reviewer | `01a1bb52-1a23-7cf3-8b52-e0611016a61c` |
| Docs | `01a1bb54-c940-7ae1-80e7-cff229df8567` |
| Recovery correctness reviewer | `01a1bb79-72fd-72f0-b309-b5e46a8630bf` |
| Recovery security reviewer | `01a1bb79-b225-7110-b2ba-b01ef5e9bb11` |

## Decisions

| Date | Who decided | Decision and one-line reason |
| --- | --- | --- |
| 2026-11-08 | Orchestrator | Preserve the planned high route for authorization and private assessment evidence. Verify the base through GitHub because the local upstream tracking ref is stale and no upstream remote is configured. |
| 2026-11-08 | Orchestrator | Use Node v24.22.2 from Bun's cache for checks. Local Docker requires escalation; LGTM containers were already running. Tests use loopback localHarness without reading or creating .env files. No runtime dependency changes. |
| 2026-11-08 | Human | Committed the exact G2 test baseline as `4c0b070` and requested continuation; implementation dispatched after direct verification. |
| 2026-11-08 | Orchestrator | Applied the new TA list function and the already-merged learner browse migration missing from the local stack, without reset. Regenerated types now differ only by the new TA function signature. |
| 2026-11-08 | Human | Approved G3-TEST-01: correct only the embedded grade expectation from a one-element array to an object, preserving the score and all other acceptance tests. |
| 2026-11-08 | Human | Committed supplementary G2 as `0c05f41` and requested continuation; implementation validation resumed. |
| 2026-11-08 | Human | Approved G4-02: insert only a visible submission-link wait before retry-test interception, preserving the exact two-read assertion. |
| 2026-11-08 | Human | Committed browser synchronization as `0258d43` and requested continuation; exact corrected blob and unchanged acceptance files verified before recovery review. |

## Acceptance tests

The criterion map and interfaces defined by tests are in
`tests/unit/ta/inspection/README.md`. New interfaces are TA query/cursor
validation, protected list/detail reads, two GET handlers and list/detail
components. The private per-flaw DTO field is `assessments`; page return context
is `from=flags` or `from=learner&learnerId=<matching UUID>`.

G2 committed Git blob hashes at `4c0b0702db3d807fef971a38f5c748a88074bdd6`:

| File | Git blob |
| --- | --- |
| `tests/unit/ta/inspection/README.md` | `5a3706ceee6d221c6c48ba655ac8ae416ffc0647` |
| `tests/unit/ta/inspection/detail.test.tsx` | `759fca3164e6de9e110b5ddcf3c6a8b2934944b9` |
| `tests/unit/ta/inspection/evidence.ts` | `cb89314c56f6034a7345c064c1296e92d2b74890` |
| `tests/unit/ta/inspection/list.test.tsx` | `8195caad7bc941729b0b2c4ea845f6022f845e20` |
| `tests/unit/ta/inspection/read-failures.test.ts` | `fc89170ca800ade6b4bef902c7e2d89756dec964` |
| `tests/unit/ta/inspection/validation.test.ts` | `bf63c0755806c8b5dd4b703a9cd46cd21fd2e019` |
| `tests/integration/ta/inspection/fixture.ts` | `e40b3682a8ed3ab6d6870af846313fdb624aee12` |
| `tests/integration/ta/inspection/reads.test.ts` | `76a9e43f110c267d1acd8d8ee25203db3bdf4dab` |
| `tests/e2e/ta/inspection/journeys.spec.ts` | `fa5470fd72c96d1e45ecf51f231ce3fed3a89fde` |
| `vitest.integration.config.mts` | `ffe8866d3b277671d05e044efbcf57961ba9ab3a` |

## Checks

Commands ran with Node 24 on PATH and `bun --no-env-file`:

- `run test tests/unit/ta/inspection`: four expected missing-module suite failures.
- `run test:integration tests/integration/ta/inspection/reads.test.ts`:
  one pass, fourteen expected missing-route failures; local real Auth/RLS.
- `run lint`: passed.
- `run typecheck`: failed only on nine TS2307 references to new TA modules.
- `run test:e2e tests/e2e/ta/inspection --list`: seven tests discovered.
- `run test:e2e tests/e2e/ta/inspection --max-failures=1`: production build
  stopped at typecheck; browser assertions unrun.
- `git diff --check`: passed.

Subsequent implementation checks:

- Targeted TA/learner/account/auth unit run initially had one timeout under
  concurrent worker contention; rerun with `--maxWorkers=2` passed all 209 cases.
- `run lint` and `run typecheck`: passed independently.
- `run test:integration tests/integration/ta/inspection/reads.test.ts
  tests/integration/domain/learner-browse.test.ts
  tests/integration/domain/learner-browse-catalogue.test.ts
  tests/integration/auth/core.test.ts`: 89 passed, one committed-test defect
  at `tests/integration/ta/inspection/reads.test.ts:127` (G3-TEST-01).
- G2 working/index files still match the human commit. `git diff --check` passed.
- After human approval, the exact one-line G3-TEST-01 correction was verified;
  `run test:integration tests/integration/ta/inspection/reads.test.ts` passed
  all fifteen tests, including historical evidence after every lifecycle change.

All seven post-implementation TA browser journeys passed against the production
build, including account transitions and keyboard/320px width. Final lint passed.
Full verify has not run. SYS-09.1 production shell/Suspense, SYS-09.2 cache-scope
review and SYS-17.2 contrast evidence: production build passed, protected page
components defer request-dependent content behind Suspense/connection, and
reviewers found no protected cache scopes. Built TA HTML/RSC shells contain
none of the fixture names, IDs or code. CSS contrast measurements: body 14.73:1,
muted 6.08:1, link 7.51:1, primary button 8.07:1, error 7.04:1; source added/removed
text 14.43:1/14.29:1; focus 5.06:1 on page and 5.44:1 on white; input border
3.66:1. Only the approved G3-TEST-01 acceptance assertion changed, committed in
supplementary G2.

Initial review batch before/after digests were identical:

- Status plus binary diff: `bb94ee4b15d2002a2d42fff91245607ef1b1cabc44894973694e1b7764d80d1d`.
- Untracked non-secret file bytes: `fe2a052b5ec945f0b619b91024f5dea453bc049e3c555bdacc42026f15efe574`.

Recovery review batch before/after digests were identical:

- Status plus binary diff: `72cea857126b3d2e72185b0fcde84ecd60888de67d7eaf480ee9602ae621febe`.
- Untracked non-secret file bytes: `9f2bd5ba8a280c4f5a72a2672277d2751e464fb858587b8bc0e2e4a510aa7a9a`.

Final recovery checks: 107 targeted TA/account units, lint/typecheck, production
build and both previously failing browser journeys passed. Recovery correctness
review independently passed 68 targeted cases. Final full human browser rerun
and full verify remain unverified.

## Findings

None from either independent reviewer.

Human G4 validation exposed:

- G4-01 (resolved, both recovery reviews passed): TA signup notice restored in InspectionRoute;
  only one exact `notice=account-created` is stripped from list-read parameters.
  Unknown/duplicate values still fail strict API validation. Main passed the
  existing production signup/sign-out/sign-in test, 107 units, lint/typecheck.
- G4-02 (resolved, both recovery reviews passed): Browser retry test counted an outstanding sign-in page read.
  Trace request times 109680.117 and 110144.304 precede retry click 110210.148;
  the explicit retry issues one read at 110228.831. Human-approved initial-list
  wait committed at `0258d43` isolates controlled reads; exact retry assertion
  remains unchanged and both affected production journeys passed together.

## Open questions

None. Both human-approved test corrections are committed and validated.

## Next action

Both recovery reviews and docs recheck passed. Supplementary G2 is verified at
`0258d43`; browser blob `a79aadf7578990f27f8650c335dfa819ecace8a5`. No other
acceptance files changed during recovery.

G4: Human runs full validation, commits the reviewed feature and docs separately,
writes the session log, then opens the feature PR from the fork to upstream
`master`. Agent completion does not assert these human checks passed. Preserve
the original and supplementary G2 commits. No agent commits or pushes occurred.

```sh
bun run verify
bun run test:e2e

git add src supabase/migrations/20261108090000_ta_submission_page.sql workflow/PLAN.md workflow/handoffs/53-ta-inspection.md
git commit -m "feat(ta): add submission inspection and retained evidence" --trailer "Agent: Codex"

git add README.md docs/DeveloperGuide.md
git commit -m "docs(ta): explain submission inspection" --trailer "Agent: Codex"
```

After writing the session log:

```sh
git add logs/TaiaYovelaPang
git commit -m "chore(logs): record T30 implementation session" --trailer "Agent: Codex"
```

Initial and recovery reviewer/runtime checks and guide validation passed.
Test corrections are human-approved supplementary G2 changes; no dependencies
were added. No agent commits or pushes occurred.
