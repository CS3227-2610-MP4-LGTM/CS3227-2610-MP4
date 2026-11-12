# #52 part 1 — Learner review history

- **Route:** high
- **PLAN task:** T-14 (Learner; G1 approved)
- **Branch:** `feat/52-learner-history`
- **Base commit:** `115d49c8767e0584b3da8474c7c045349e92441e` (`upstream/master`)
- **Status:** done

## Goal

Deliver all LRN-08.1–08.8, with own-attempt history and read-only effective-grade and moderation display. LRN-07 reports are a separate T-15 task and are outside this loop.

## Stages

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | Main / medium | Complete | #52 reverified OPEN. Branch `feat/52-learner-history`, base `115d49c8767e0584b3da8474c7c045349e92441e`; HEAD `63b19755c18857ae70e4b08834d89338386be890` is the verified policy-only G3 commit. Base and #89 merge remain ancestors; T-13 done. LRN-08.1–08.8, ACC-03 navigation/recovery, SYS-12 and §3 contracts exist at base. High route retained. Resume checkpoint: tracked tree clean, only this handoff pre-existing/untracked. | See Main sessions |
| Plan / G3 | Planner / high, then Main | Resolved | Capacity block T14-G3-01 resolved by Shawn's 19 total / 6 Learner decision in `63b1975`. Prior planner thread `01a1cef4-1a74-7030-a979-d48f7276d04e` made no edits. | 115782 |
| Plan / G1 | Planner / high, then Main | Complete | G1 commit `437f7cf` verified on resume: only the approved 172-line T-14 insertion in PLAN; HEAD and branch verified.  T-14 added at `workflow/PLAN.md:1004`, all LRN-08.1–08.8, high route; only T-13 completion required. Planner thread `01a1cefa-5faa-7970-a56b-317b1aad6cac`. Main independently verified only PLAN insertion, all fields and exact paths, unchanged prior tasks, 17/19 total and 5/6 Learner, and clean `git diff --check`. T-15/T-23 not inserted. | 1159965 |
| Tests / G2 | Test-writer / medium; Main verification | Complete | Test-writer thread `01a1cf02-6978-7b92-9550-1b94416c77e8`; completed. Main verified checkpoint: seven new test/fixture files and three existing test files only; no implementation/dependency/config edits or specialist handoff edits. All new titles begin with criterion IDs. Expected failing-first evidence: new unit 41 failed/1 passed, seven list cases blocked at missing new component import; local integration 8 expected failures; production-build Chromium 15/15 expected failures with `--repeat-each 3`. Prior session reported targeted lint, typecheck and diff check pass. Resume discovered T14-G3-02 below; prior retry-pass claim does not apply to the committed baseline. Details below. G2 `6bdcf67c932cfb2a5fea6d3dfb36971287761ab6` verified: nine test/fixture files only. Acceptance files match HEAD, index and working tree; SHA-256 baseline below. The prior ten-file checkpoint count included retry-challenge.test.tsx, which has no change in G2 and is not part of its diff. | 5336315 |
| Implement / prior | Implementer / medium | Interrupted at resolved T14-G3-02 | Prior specialist `01a1cf16-0025-76e3-b75f-2f681a0df08f` made no edits. | 603917 |
| Implement / Session 5 | Implementer / medium | Interrupted at resolved T14-G3-03 | Specialist `01a1cf1c-6d1e-7a11-a77b-c13a2c4605e7`. Draft stays within src/ and planned new migration; generated types refreshed locally by Main; no acceptance edits or specialist handoff edits. Specialist six unit suites: 82 pass / 1 fail (noncompleted malformed override reaches date formatting; fix deferred). Main Node 24.22.2 retry regression before source: 12/12. Main local migration up/types pass; history integration 7/8 and TA reads 15/15. State fixture conflict below blocks source-only completion. Main git diff --check passes; ten acceptance hashes match HEAD/index/worktree. Lint/typecheck/browser unrun; no review/docs dispatch. | 1290073 |
| Implement / Session 6 | Implementer / medium; Main verification | Awaiting decision; G3 T14-G3-04 | Specialist `01a1cf25-2de9-7da3-bf8b-d01724726db0` completed source fix: noncompleted grading suppresses overrides before sorting/rendering; named focus dependency removes lint warnings. Scope check: only two source files changed since checkpoint; acceptance, migration, PLAN and handoff untouched by specialist. Main independently: six unit suites 83/83; local history 8/8 plus TA reads 15/15; lint/typecheck/diff check pass. Chromium history repeated three times: 12/15 pass; retention test fails three times at line 131 because CSS main locator also matches Next Activity hidden history DOM. No acceptance edits. No review/docs dispatch. | 1466924 |
| Implement / Session 7 | Implementer / medium; Main verification | Complete | Specialist `01a1cf2c-9507-7e63-8f95-8dd3626fe627` completed verification with no edits: six unit suites 83/83, lint/typecheck/diff check pass. Main independently confirms 83/83, lint/typecheck and diff check pass; complete history Chromium file repeated three times passes 15/15 on current source. All six existing learner Chromium files pass 16/16; serialized local history 8/8 and TA reads 15/15. Initial overlapping integration attempt invalid due to shared local fixture collision; clean serialized reruns pass. No test-side failures remain. No source or acceptance edits this session. | 590035 |
| Review | Reviewer / medium; security-reviewer / high | Complete | Fresh independent reviewers `01a1cf30-db47-7cc2-b1f0-c66ffa6027d4` and `01a1cf31-1162-7910-acbf-8a18bbbbc1db`: completed, no findings. Both traced privileged functions/grants to G2 defining tests. Correctness reviewer independently passes 83 units and targeted lint; DB/browser evidence supplied by Main. Whole-batch before/after digest of status + binary HEAD diff + untracked nonsecret bytes is identical: `cf095898821000b781b49fcd8346302517ca0ef624bada67d2673b71b07bae91`. No file writes. | Correctness: 672804; Security: 1241020 |
| Docs | Docs / low | Complete | Specialist `01a1cf34-558e-7330-84c2-fd9823479ab2` updated only README.md and docs/DeveloperGuide.md. Main checkpoint confirms those two paths only; exact UI labels, list/RPC bounds, retained results and read-only moderation match source. New local links/anchors and upstream repository targets resolve; diff check passes. Hosted SoC/local-CI fake distinction preserved; stale learner-history exclusion removed; no report-creation docs. | 853665 |
| Close-out / G4 | Main / medium | Agent stages complete; awaiting human G4 | PLAN T-14 and handoff done. All ten acceptance files still match HEAD/index/worktree. Upstream migration list rechecked: latest `20261113120000_author_publication.sql`; no open PRs; #84 remains OPEN Author T-23. No migration collision. Human full verify/e2e, commits, log and PR remain unverified. | See Main sessions |

## Main sessions

| Session | Stages | Thread ID | Measured total | Resume gaps |
| --- | --- | --- | --- | --- |
| 1 | Ready, blocked Plan / G3 | `01a1cef2-69be-7c33-b92a-f738b70f378c` | 531578 | Final total measured on Session 2 resume; G3 decision verified in `63b19755c18857ae70e4b08834d89338386be890`. |
| 2 | Ready recheck, G3 resolved, Plan / G1 | `01a1cef9-7d4b-7751-8ca1-da4cf409174d` | 1225815 | Final total measured on Tests resume; G1 commit `437f7cf` verified, #52 OPEN and base unchanged; no remaining resume gaps. |
| 3 | Tests | `01a1cf01-951d-7d00-9e86-d83340d165e4` | 6615757 | Final total measured on Implement resume. G2 `6bdcf67c932cfb2a5fea6d3dfb36971287761ab6` verified; #52 OPEN; branch/base unchanged; no remaining resume gaps. |
| 4 | Implement resume; stopped G3 T14-G3-02 | `01a1cf14-d92e-72a3-bc5a-3f6ff930a024` | 1453402 | Final total measured on Session 5 resume. T14-G3-02 resolved by Shawn; supplementary G2 `12c1e42` verified. |
| 5 | Implement resume; stopped G3 T14-G3-03 | `01a1cf1b-1e21-7e52-bcbf-8b34dba7afd4` | 2478527 | Final total measured on Session 6 resume. T14-G3-03 approved by Shawn and supplementary G2 `4fb58d8` verified; renewed fixture hash below. |
| 6 | Implement resume; stopped G3 T14-G3-04 | `01a1cf23-a6c2-7492-b3a7-fba90b395bcd` | 1490379 | T14-G3-03 resolved, fixture baseline renewed, source unit failure fixed. Final total measured on Session 7 resume. T14-G3-04 approved and committed as supplementary G2 `644d43a`; both main-content locators repaired, acceptance hash renewed. |

| 7 | Implement verification, Review, Docs, G4 | `01a1cf2b-7522-7521-8cbc-fb6e6dae020c` | 4458046 (close-out checkpoint; final measurement pending next resume) | T14-G3-04 resolved; `644d43a` scope and renewed acceptance hash verified; prior source preserved. Agent stages pass; human G4 remains unverified. |

End each main session after updating this handoff at every gate, including G3 decisions. A resumed session first verifies the gate commit named in its resume prompt and its scope in Git, copies the preceding main session's measured `tokens.total_tokens` verbatim using `bun workflow/scripts/rollout-summary.ts --id <thread-id>` (or `unavailable`), and lists resume gaps. No gate commit was supplied in this initial session.

## Tests evidence for G2

**Session 7 resume:** #52 OPEN; branch/base unchanged. Supplementary G2 `644d43a50e327a3ccf292f577e1b87fa4a01fd92` changes only the two approved history main-content locators. Every assertion preserved; all ten acceptance files match HEAD/index/worktree, renewed history SHA-256 below. Full current-source history Chromium file `--repeat-each 3`: 15/15 passed.

**Session 6 resume:** #52 OPEN; same branch/base. Human supplementary G2 `4fb58d8bab65e8728d08934338627c6b7fe11dda` changes only the history fixture: pending creates no grading run; running created_at is one hour ahead to keep the 60-second deadline unexpired throughout the suite. Assertions and submittedAt ordering unchanged. All ten acceptance files match HEAD/index/worktree; fixture SHA-256 renewed below. Pre-existing implementation and PLAN status-only edit preserved.

**Prior resume:** Supplementary G2 `12c1e42d115e40d20266aa8f18b2ea7b094bcd01` repairs retry-page discovery only; all assertions are unchanged. Main verified the nine original baseline hashes and supplementary retry hash against commit, HEAD, index and working tree. Retry regression now passes 12/12.

**Historical resume correction:** The following historical Tests evidence describes the prior session checkpoint. G2 does not include its claimed retry-page lookup repair. Current `retry-challenge.test.tsx` is unchanged from the parent and fails at line 212; do not rely on the historical 12/12 retry-pass claim for this baseline.

All checks used Node 24.22.2 and Bun. Local Supabase doctor and history fixture setup/cleanup passed. Reads use only local Supabase; the browser server uses the fake provider. No implementation was written.

| Criterion | Acceptance evidence |
| --- | --- |
| LRN-08.1 | `history-list.test.tsx`: separate attempts, labels, own result links; `learner-history.test.ts`: GET/reader/RPC two-user-per-role matrix and exact caller scope; browser list journey. |
| LRN-08.2 | List states, completed zero versus unavailable, empty navigation; integration list/detail agreement. |
| LRN-08.3 | `history-contract.test.ts`: strict query/response bounds, cursors and failure categories; list loading, retry, disabled paging, URL restoration, stale-response suppression/focus; integration direct bounds/tie-safe paging/grants; browser back/reload/recovery/320px journey. |
| LRN-08.4 | `history-moderation.test.tsx`: current/original separation, shared pass threshold, source, noncompleted states and preserved learning sections; browser original/current journey. |
| LRN-08.5 | Moderation unit/browser tests: tied-time overrides/corrections, latest marker, full inert reasons, generic TA action and no identities. |
| LRN-08.6 | Moderation unit/browser tests: all four kinds, resolved flags, report comment/line and absent rule associations. |
| LRN-08.7 | Moderation unit/browser tests: all ordered resolution corrections, latest disposition, awaiting-review and unchanged grade absent override. |
| LRN-08.8 | Integration/browser lifecycle retention, pinned code/title/comments/original/hints/moderation, safe projection, missing/forbidden results, sign-out/account-switch and role denial; read-only database/usage snapshots. |

Interfaces defined by tests (expected missing interfaces, not setup failures):

- `src/app/api/v1/submissions/route.ts`: `GET(Request): Promise<Response>`.
- `src/server/learner/history.ts`: `readSubmissionPage(URLSearchParams)` returns `{ status: "ok", page }` or existing categorized access/read failures.
- `src/lib/learner/history.ts`: `submissionPageSchema` validates strict bounded `Page<SubmissionCard>`.
- `src/components/learner/history-list.tsx`: `HistoryList({ search, readPage, navigate })`, following the catalogue's injectable boundary.
- `public.list_learner_submissions(p_limit integer DEFAULT 20, p_challenge_id uuid DEFAULT NULL, p_before timestamptz DEFAULT NULL, p_after_id uuid DEFAULT NULL)`: caller-scoped `{ status: "ok", items }`, at most limit-plus-one candidates; no owner/role argument. Only authenticated execution; direct role/forgery/half-anchor denial covered.
- `private.learner_submission_card(uuid)`: private card helper; no PUBLIC/anon/authenticated/service_role execution. Security-definer functions require empty search_path. Existing result/detail/DTO signatures remain unchanged.

Verification:

- `bun run test tests/unit/learner/history-contract.test.ts tests/unit/learner/history-list.test.tsx tests/unit/learner/history-moderation.test.tsx tests/unit/learner/grading-result.test.tsx tests/unit/learner/feedback-and-hints.test.tsx tests/unit/learner/retry-challenge.test.tsx`: 41 expected new acceptance failures / 35 passed, plus the expected missing HistoryList collection failure. Seven list acceptance cases cannot collect until the new component exists. The pre-existing retry-page glob lookup failure was repaired by importing the existing module directly; all loading/authorization assertions are unchanged and the retry suite now passes 12/12.
- Final `bun run test tests/unit/learner/grading-result.test.tsx`: 14/14 pass. Existing original-score assertions in this file and `tests/e2e/learner/grading.spec.ts` now scope to Original assessment, accommodating the approved Current grade display while retaining original-preservation checks.
- `bun run test:integration tests/integration/domain/learner-history.test.ts`: final serialized run has eight expected failures, seven for the new GET route missing and one for the two new database functions missing; fixture setup/cleanup passed.
- `bun run test:integration tests/integration/ta/inspection/reads.test.ts`: 15/15 pass.
- `bun run test:e2e tests/e2e/learner/history.spec.ts --project chromium --repeat-each 3`: production build/server start succeeded; all 15 runs failed as expected on absent history rows/read-error presentation or result-heading focus. No final build/fixture failures.
- Targeted lint on all ten changed tests/fixtures: pass, no warnings. `bun run typecheck`: pass. `git diff --check`: pass.
- Existing Chromium grading/feedback regression files and full `verify` were not run. Implementation, reviews and docs have not started. The pre-existing retry discovery failure is resolved in the Tests diff, with no production or behavior change.

## Decisions

| Date | Who decided | Decision and one-line reason |
| --- | --- | --- |
| 2026-11-12 | Shawn | T-14 is #52 part 1 on the high route, covering all LRN-08.1–08.8 with nothing deferred; LRN-07 follows separately as T-15. |
| 2026-11-12 | Shawn | Preserve T-13 result sections, “Retry challenge” and “Retry grading”. Build no report creation, route or function; render every flag kind returned by the existing reader. |
| 2026-11-12 | Shawn | New `GET /api/v1/submissions` returns caller-scoped `Page<SubmissionCard>` and uses a private SubmissionCard projection helper; leave `list_ta_submissions` unchanged. Preserve the existing §3 optional `challengeId` filter. |
| 2026-11-12 | Shawn | Moderation uses existing `read_learner_submission` / `readLearnerSubmission`. Preserve GradingView and FlagView including actorId, display “TA action”, and test that no actor ID appears on the page. |
| 2026-11-12 | Shawn | Move `flagLabels` from `src/lib/ta/moderation.ts` to a neutral shared module, retaining a one-line re-export. Name both files and every script, fixture and other-role file in PLAN Config paths. |
| 2026-11-12 | Shawn | New migrations sort after the latest master migration at branch time. Base latest is `20261113120000_author_publication.sql`; recheck #84 and upstream before close-out. GitHub currently identifies #84 as an open unpublish/archive issue, not a PR; no open PRs were returned. |
| 2026-11-12 | Shawn | Before any gate reporting Chromium results, run new e2e files with `--repeat-each 3`. Docs must preserve hosted SoC versus local/CI fake-provider behavior and must not describe reports. |

| 2026-11-12 | Shawn | G3 resolved: capacity is 19 total / 6 Learner to accommodate T-14, T-15 and Author T-23. Proceed to plan T-14 only; human policy commit `63b19755c18857ae70e4b08834d89338386be890` verified to change only the capacity header. |

| 2026-11-12 | Shawn | T14-G3-02 approved; human supplementary G2 `12c1e42d115e40d20266aa8f18b2ea7b094bcd01` uses a direct retry-page import, preserving every assertion. Main verified scope/hash and 12/12 retry regression. |

| 2026-11-12 | Shawn | T14-G3-03 approved and applied in `4fb58d8`: pending seeds no run, running created_at is one hour ahead so the 60-second deadline does not expire mid-suite. All assertions preserved; renewed acceptance hash verified. |

| 2026-11-12 | Shawn | T14-G3-04 approved and applied in `644d43a`: both history main-content reads use visibility-aware `getByRole("main")`, with assertions preserved. Main verified commit scope and renewed hash. |

## Findings

| ID | From | Priority | Criterion | Status | Resolution |
| --- | --- | --- | --- | --- | --- |
| T14-G3-04 | Implement / Main + specialist diagnosis | G3 decision | LRN-08.8 retained projection; committed browser acceptance | Resolved | Shawn approved and committed `644d43a`: both line 78 and line 131 main-content reads use `getByRole("main")`; every assertion preserved. Renewed history hash verified against HEAD/index/worktree. Historical evidence: all three repeated retention journeys fail at `tests/e2e/learner/history.spec.ts:131`: `page.locator("main").innerText()` matches the result main and hidden prior-history main. `next.config.ts` enables Cache Components; installed Next guide `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md:353–389` documents retained hidden DOM and recommends visibility-aware getByRole. Accessibility snapshot exposes only result main; trace confirms hidden prior main. The committed visibility-aware locator repair preserves the private-answer assertion; no source workaround. |
| T14-G3-03 | Implement / Main + specialist | G3 decision | LRN-08.2 list/detail state agreement; committed acceptance fixture | Resolved | Shawn approved and committed `4fb58d8`; pending seeds no run and running is dated one hour ahead (not now). Fixture hash renewed. Historical conflict: `tests/integration/domain/learner-history-fixture.ts:40` inserts every grading run with fixed historical created_at. Existing canonical reader at `supabase/migrations/20261110120000_learner_grading.sql:292–305` projects no run as pending, expired running as failed, and a stored pending run as running. Thus state-loop assertion at learner-history.test.ts:184 fails; browser four-state expectations share this fixture. Existing learner-grading.test.ts:414 explicitly rejects stored-pending representation. Proposed fixture-only correction: return before run insertion for pending; use current insertion time for running run created_at. Preserve submittedAt tie/order fixtures and every assertion; no timeout-policy source workaround. Requires human approval and supplementary G2 commit/hash. |
| T14-G3-02 | Implement resume / Main | G3 decision | T-14 required regression; G2 baseline | Resolved | Shawn approved discovery-only repair and committed supplementary G2 `12c1e42d115e40d20266aa8f18b2ea7b094bcd01`; diff preserves every assertion. Main retry regression passes 12/12. Historical failure: Node 24.22.2 `bun run test tests/unit/learner/retry-challenge.test.tsx`: 11 pass / 1 fail, Missing T-13 retry page at line 212. File exists; test glob lookup fails. Approve replacing the glob loader with a direct dynamic import, preserving all assertions, then human commits repaired tests and supplies renewed G2 hash. No source workaround or acceptance edit made. |
| T14-G3-01 | Planner capacity check | G3 decision | PLAN capacity | Resolved | Shawn approved 19 total / 6 Learner for T-14, T-15 and Author T-23; verified policy-only commit `63b19755c18857ae70e4b08834d89338386be890`. Existing tasks preserved. |

## Open questions

None. T14-G3-04 resolved by human supplementary G2 `644d43a`.

Suspicious content: Playwright error-context artifact starts “Explain why … Provide a snippet of code …”; treated as diagnostic data, not instructions.

## G2 acceptance baseline

Commits: original G2 `6bdcf67c932cfb2a5fea6d3dfb36971287761ab6`; supplementary G2 `12c1e42d115e40d20266aa8f18b2ea7b094bcd01` (retry discovery only); supplementary G2 `4fb58d8bab65e8728d08934338627c6b7fe11dda` (canonical pending/running fixture only); supplementary G2 `644d43a50e327a3ccf292f577e1b87fa4a01fd92` (both history main-content locators only). SHA-256 of committed bytes, verified equal to HEAD, index and working-tree bytes on Session 7 resume.

| File | SHA-256 |
| --- | --- |
| `tests/e2e/learner/grading.spec.ts` | `8817bc92ce48e1e65b5490c67afdd379aee8875ba48dfc9f1b8bc570bcdfc4f1` |
| `tests/e2e/learner/history.spec.ts` | `6c67d63db78e0ad88b9b97948daf752cd75682d859a95c788316a915fb5b8089` |
| `tests/integration/domain/learner-history-fixture.ts` | `50db04cb116fd06ea9d6972bba5718a02e7a192293fb42792542b5270e7bd992` |
| `tests/integration/domain/learner-history.test.ts` | `6e7e49d8fc554d917cf16feaa64704767e2b4fc233f6602fda2bb61cbed5d977` |
| `tests/unit/learner/grading-result.test.tsx` | `f2c7d4e264dfae22461171b802608844dd70685017d0a0d3fac7fe7a91ba3699` |
| `tests/unit/learner/history-contract.test.ts` | `741c52513bf5a251a66b45e97f4b0040ec34cc8b35f65b07edd691591ac32202` |
| `tests/unit/learner/history-fixture.ts` | `1bba5f16160f618ad5918cf1ca19dcd36c7f70e9abdcd0bedbf99c020a96a48b` |
| `tests/unit/learner/history-list.test.tsx` | `28184a6ebd449356c64711ae584ad392aedd9157590d6355ffbec3f08906ab09` |
| `tests/unit/learner/history-moderation.test.tsx` | `47bae2c85479b98301549e9ff75aad2456c4b906acc91bbe6b7d565a27cde9fe` |

| `tests/unit/learner/retry-challenge.test.tsx` | `1f6acfd984c1a74aa956b034b3fec8a1b286c57bd67d5f68254c577e236609d8` |

## Next action

Agent stages are complete. Stopped at G4 under sdd-orchestrate: “Run `bun run verify` and `bun run test:e2e`, commit the reviewed changes, write the session log, and open this feature PR. Human validation remains unverified until reported.” No further G3 decisions or test repairs are needed.

Current-source checks: six targeted learner unit suites 83/83; full history Chromium file `--repeat-each 3` 15/15; all six existing learner Chromium files 16/16; serialized local history integration 8/8 and TA inspection reads 15/15; full lint, typecheck and diff check pass. Initial overlapping database/browser fixture failures were resolved by clean serialized reruns; no acceptance-test repairs were needed. Correctness/security reviews completed without findings and without tree mutations. Docs changed only README and Developer Guide. Full verify and full repository e2e were not run by agents.

All ten acceptance hashes are verified against HEAD/index/worktree. Human G2 commits: `6bdcf67`, `12c1e42`, `4fb58d8`, `644d43a`. T14-G3-04 is resolved, including both approved visibility-aware locators. Session 6 final measured total: **1490379**. Current session total above is a measured checkpoint; measure its final total on next resume.

### Human G4 commands

Use Node 24 from `.node-version` and the local Supabase stack with the fake provider. Run these checks serially:

```sh
bun run verify
bun run test:e2e
```

After reviewing the diff and passing G4 checks, create separate commits in this order (G1/G2 commits already exist):

```sh
git add src/app/api/v1/submissions/route.ts src/app/learner/history/page.tsx src/components/learner/grading-result.tsx src/components/learner/history-list.tsx src/components/learner/history-page.tsx src/components/learner/moderation-history.tsx src/lib/learner/history.ts src/lib/moderation/flags.ts src/lib/supabase/database.types.ts src/lib/ta/moderation.ts src/server/learner/history.ts supabase/migrations/20261114130000_learner_history.sql workflow/PLAN.md workflow/handoffs/52-learner-history.md
git commit -m "feat(learner): add review history and moderation outcomes" --trailer "Agent: Codex"
git add README.md docs/DeveloperGuide.md
git commit -m "docs(learner): explain review history and moderation" --trailer "Agent: Codex"
```

Write the session log (suggested next path `logs/shawnnygoh/027-learner-history.md`), then:

```sh
git add logs/shawnnygoh/027-learner-history.md
git commit -m "chore(logs): record learner history feature run" --trailer "Agent: Codex"
```

Push the feature branch to the member fork and open the feature PR against upstream `master`; agents have not committed, pushed or opened a PR. Include the feature decisions above and G4 results. LRN-07 reports remain a separate T-15 task.
