# #54 — ta-moderation

- **Route:** high
- **PLAN task:** T-31
- **Branch:** feat/54-ta-moderation
- **Base commit:** e5bfac52472fadae2edc9e4317ad95d41a09af78
- **Status:** done

## Goal

Deliver TA-02.1–TA-02.8 and TA-03.1–TA-03.8: a flagged-submission queue,
append-only resolutions and justified grade overrides, with T-31's cited
authorization, audit, historical-access and UI requirements.

## Stages

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | main | done | GitHub #54 OPEN; GitHub upstream master matches HEAD/base above. Initial tree clean; separate feature branch created at human request. T-30, T-02 and T-03 marked done. All cited story/system IDs and integration sections exist at base. | unavailable |
| Plan / G1 | main | done | Existing approved T-31 task at base; high route retained for protected moderation writes. | unavailable |
| Tests / G2 | test-writer / medium; main verification | done | Human commit 1e39a1fc1d3747ea855c512b6cc2a0770cb7dca0 verified directly: exactly eight acceptance files and every blob below matches, with no staged/working test edits. Main observed intended missing-interface unit/DB failures; lint passed, typecheck only missing-interface imports, six browser journeys discovered. | test-writer 2334872; main snapshot 3404042 |
| Implement | implementer / medium; main verification | done | Main passed 311 targeted units, lint/typecheck, 38 local TA integration cases, production build and 28 expanded browser journeys; approved G3-TEST-01 correction passed the remaining production journey. Both G2 baselines/index/working files verified. | implementer 5233414; main snapshot 14413782 |
| Review | reviewer / medium + security-reviewer / high | done | Both evaluations completed with criterion blockers REV-01–03 / SEC-REV-01–02 below. Initial before/after tree and untracked-byte digests matched exactly. | correctness 825715; security 868031 |
| Fix round 1 | implementer / medium; main verification | done | Both G2 baselines unchanged. Main passed 319 targeted units, lint/typecheck, 38 local TA integrations, fresh production build and all six moderation browser journeys. Actual DB red/green probe verified failed-outcome retention and RLS/default denial. Eight supplementary internal recovery cases cover uncertain-refresh races. | implementer 7326613 (cumulative) |
| Rereview round 1 | same independent reviewers | done | Both completed with prior source blockers resolved and no newly supported defects. Before/after tree+untracked-byte digests matched (below). Main independently verified runtime DB replay/RLS and all targeted checks; reviewers correctly report DB/browser execution unverified in their own evaluations. Missing persisted DB regression coverage noted below. | correctness 1318890; security 1595367 (cumulative) |
| Docs | docs / low | done | README and DeveloperGuide only. Main verified three added link targets/anchor and implementation wording; runtime/test checkpoint unchanged, git diff --check passed. | 267719 |
| Close-out / G4 | main | awaiting-decision | All agent gates passed; PLAN/handoff done. Human full verify/full e2e, feature/docs/log commits and PR remain unverified. | 26247846 (main snapshot) |
| G3 test diagnosis | test-writer / medium; implementer / medium | done | Both read-only evaluations identify a still-valid Auth session in the mocked-401 fixture, not a runtime defect. Human approved exact two-line session-precondition correction. | test-writer 2804055; implementer included above |
| Supplementary Tests / G2 | test-writer / medium; main verification | done | Human commit fedff948f2998eb8a87e0d22b3babf1f17cd00d9 verified: exact approved import and expireSession call only. Browser blob 107af410bcf867b4551e49bc9f189c6a952e6c46; affected production journey passed. All seven other G2 files unchanged, index/working acceptance files clean. | test-writer 3424846 (cumulative) |

## Decisions

| Date | Who decided | Decision and one-line reason |
| --- | --- | --- |
| 2026-11-08 | Human | Implement in another branch; created feat/54-ta-moderation from verified upstream master. |
| 2026-11-08 | Orchestrator | Verify upstream through GitHub because no upstream remote is configured and local upstream/master is stale. |
| 2026-11-08 | Human | Committed the exact G2 baseline as 1e39a1f and requested continuation; implementation follows direct blob verification. |
| 2026-11-08 | Orchestrator | Applied only 20261108150000_ta_moderation.sql transactionally to local Docker Postgres, because earlier TA/learner migrations are present but absent from local CLI history. No reset or hosted connection; regenerated database types from local schema. |
| 2026-11-08 | Orchestrator | No owning-Learner submission read module exists yet. Shared effective-grade projection is used in existing TA reads/results and tested against real owning-Learner-authorized stored rows; no speculative learner endpoint/UI added. |
| 2026-11-08 | Human | Approved G3-TEST-01: import existing expireSession helper and expire the browser session before the mocked-401 save, preserving all assertions. |
| 2026-11-08 | Human | Committed the approved supplementary G2 correction as fedff94 and requested continuation; exact diff/blob verified before reviews. |

Token totals are verbatim cumulative snapshots from rollout-summary.ts:
test-writer thread `01a1bb93-f458-7640-b627-e464cb95056d`; main thread
`01a1bb92-d260-7de0-963a-201c535e0e04`. Rows for repeated roles are cumulative
snapshots, not additive totals. Other role threads:

| Role | Thread ID |
| --- | --- |
| Implementer | 01a1bba8-a98d-7c21-92d5-bc2d7b41ddd7 |
| Correctness | 01a1bbc6-fdf8-7040-9e3b-33a83b7cf23d |
| Security | 01a1bbc7-3937-7010-86ac-ade1d6ade1e7 |
| Docs | 01a1bbd0-db69-7202-afcb-aeb7be8b9d5b |

## Findings

| ID | From | Priority | Criterion | Status | Resolution |
| --- | --- | --- | --- | --- | --- |
| REV-01 | correctness | P2 blocker | TA-02.7, TA-03.6 | resolved | Both-form recovery tests and panel preserve uncertain identity through refresh/incoming reads; pending refresh blocked. Correctness rereview passed. |
| REV-02 / SEC-REV-02 | both | P2 blocker | TA-03.5–6, shared idempotency | resolved | Migration persists validated invalid_state under lock before return; both reviewers confirm source fix; main actual committed DB probe passed replay/conflict/fresh-key assertions. |
| REV-03 / SEC-REV-01 | both | P2 blocker | SYS-10.1 | resolved | Migration explicitly enables default-deny RLS, retains revoked grants; both reviewers confirm source fix and main verified applied schema/privileges. |

Initial review batch immutable digests (before and after identical):
tree/status+diff `7cf5818d31e793d959ee3d3b2d6aac5767c1d4477a2aa9c96a341d2a3c4615ff`;
untracked non-secret bytes `4cb6c7318c1b2bc2d6c013bc7fbb106dcb4641d1c217fe572249003ac17aad05`.

Fix-round resolutions confirmed by independent rereview: refresh preserves
uncertain keys and is disabled while saving; validated incomplete-state outcomes
are persisted under the serialized key; private key-table RLS explicitly enabled.
Main actual local DB probe reproduced the failed-key bug before the change and
passed afterward: retained invalid_state on replay after completion, conflict on
changed payload, fresh-key success with exactly one override, RLS enabled and
authenticated table grants denied. Applied only local ALTER TABLE and function
replacement transactionally; no type-shape change.

Rereview batch immutable digests (before and after identical):
tree/status+diff `adcd32112a8b75d4b4cde6909a3770b305c00ee7731e3fee53365f753c4a1c22`;
untracked non-secret bytes `17687ca3744e9cb3e3a1f9618f1d51c46ffeafc0fd879507fd717012718cce46`.

Coverage limitation: private key-table RLS and rejected-key replay after grading
completion were verified with main-owned executable local DB probes, not added
to the committed integration suite. Security rereview recommends retaining those
scenarios as database regression tests. No source defect or criterion blocker
remains; SYS-19 evidence here combines source review with actual DB execution.

G3-TEST-01: `tests/e2e/ta/moderation/journeys.spec.ts:126–129` mocks a
moderation POST 401 without expiring TA A's real Auth session. The later login
helper opens plain `/sign-in`, so ACC-02.8/ACC-03.1 correctly redirect the still
signed-in TA to its workspace and Email is absent. Both test-writer and
implementer independently diagnosed this fixture contradiction without edits.
Human-approved correction now passes the complete affected production journey,
including reauthentication and no replay. Supplementary test commit is verified
at fedff94; both independent rereviews passed.

## Open questions

None. Supplementary G2 verified and corrected production journey passed.

Local doctor confirms Docker, pinned CLI and running local Supabase.
`.env.local` is absent; no secret files were read or created. Existing
localHarness and Playwright server.ts explicitly inject loopback configuration
in memory, so these checks require no environment files.

## Checks

Main verification uses Node v24.22.2 on PATH and `bun --no-env-file`.
G2 failing-first evidence: five expected missing-module unit suites and missing
moderation route/RPC integration failures; local Auth fixtures succeeded and
existing direct RLS/privacy assertions passed. Lint passed; typecheck failed
only on new-module imports. Six browser journeys were discovered.

Final validation:

- Applied the new moderation migration with psql ON_ERROR_STOP and a single
  transaction; succeeded. Regenerated types differ only for the new key table
  and moderation functions.
- `run test:integration tests/integration/ta/moderation/writes.test.ts
  tests/integration/ta/inspection/reads.test.ts`: all 38 passed after fixes
  (23 moderation plus 15 existing inspection). Actual append probe retained
  literal `v` and trimmed vertical-tab whitespace; writes rolled back and
  fixtures cleaned up. Review DB state-transition/RLS probe passed as above.
- `run test tests/unit/ta tests/unit/auth tests/unit/account tests/unit/learner
  --maxWorkers=2`: 29 files / 319 tests passed after fixes, including fourteen
  supplementary internal HTTP/recovery tests outside the G2 baseline.
- Final main lint and typecheck passed; git diff --check passed. No acceptance
  files changed. Runtime/migration scope preserved; no dependencies added.
- `run test:e2e tests/e2e/ta/moderation`: fresh production build and all six
  journeys passed after review fixes. Earlier expanded browser run passed all
  fifteen account journeys, learner account-switch journey and seven TA
  inspection journeys; approved G3-TEST-01 recovery then passed independently.
- Protected fixture content absent from all sixteen generated TA HTML/RSC
  shell files; production build passed. No protected cache scopes found.
  Existing palette contrast measurements: body14.73:1, muted6.08:1, link7.51:1,
  primary8.07:1, error7.57:1, focus5.06:1/5.44:1, input/textarea border3.66:1.
- Docs scope and link checks passed; runtime/test bytes unchanged across Docs:
  `50b95356c4120c067068ddb4316775a813bdc794a444b9b1bab5ea3ed20e8ad3`.
- Full verify and full e2e remain unrun; these are human G4 checks.

## Verified acceptance baselines

Criterion map and exact new interfaces:
`tests/unit/ta/moderation/README.md`. These are the verified committed Git blobs
at G2 commit 1e39a1fc1d3747ea855c512b6cc2a0770cb7dca0; preserve them.

| File | Git blob |
| --- | --- |
| tests/unit/ta/moderation/README.md | 3b17103305ca8280caa01180c0d00833107c779b |
| tests/unit/ta/moderation/validation.test.ts | 698e883a3c46dce16e568d9dfba835997ad10923 |
| tests/unit/ta/moderation/queue.test.tsx | 88f1bdbec8143062dadf09ea9be0e0dacaa52322 |
| tests/unit/ta/moderation/forms.test.tsx | e30f438294b27b2b5f5ca711ff6c8a95ef60e1a4 |
| tests/unit/ta/moderation/access.test.ts | 4a69f409a4631ba225c39f23119672e918956bc2 |
| tests/unit/ta/moderation/effective-grade.test.ts | 01f8fa05f69ecf9bef58c37447cedcd77469fd61 |
| tests/integration/ta/moderation/writes.test.ts | aee9af0c96a390a43b52b4a07cac3cfa4da04412 |
| tests/e2e/ta/moderation/journeys.spec.ts (original G2) | 4b5d9bf5b88f42e45f0fd5a62841cf3abfbf1abc |
| tests/e2e/ta/moderation/journeys.spec.ts (supplementary G2 fedff94) | 107af410bcf867b4551e49bc9f189c6a952e6c46 |

## Next action

G4: All agent gates passed. Human runs full validation, commits the reviewed
feature and docs separately, writes the session log, then opens the feature PR
from the fork's feat/54-ta-moderation to upstream master. Human checks remain
unverified until reported. Preserve both existing G2 commits.

```sh
bun run verify
bun run test:e2e

git add src supabase/migrations/20261108150000_ta_moderation.sql tests/unit/ta/moderation-http.test.ts tests/unit/ta/moderation-recovery.test.tsx workflow/PLAN.md workflow/handoffs/54-ta-moderation.md
git commit -m "feat(ta): add flag resolutions and grade overrides" --trailer "Agent: Codex"

git add README.md docs/DeveloperGuide.md
git commit -m "docs(ta): explain moderation decisions and recovery" --trailer "Agent: Codex"
```

After writing the session log:

```sh
git add logs/TaiaYovelaPang
git commit -m "chore(logs): record T31 implementation session" --trailer "Agent: Codex"
```

No agent commits, pushes or PR operations occurred. No dependencies added.
