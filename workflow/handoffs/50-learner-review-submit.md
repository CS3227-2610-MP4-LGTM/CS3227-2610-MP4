# #50 — learner-review-submit

- **Route:** high
- **PLAN task:** T-11
- **Branch:** feat/50-learner-review-submit
- **Base commit:** 27fd1b02090f426fd66ae13d80530e6365412ee2
- **Status:** in-progress

## Goal

Let an eligible Learner draft line comments, submit one immutable first attempt,
and open its pending result under LRN-03.1–03.6 and LRN-04.1–04.6.

## Stages

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | main | done | Issue #50 was open. HEAD matched local `upstream/master` and the initial tree was clean. The LRN-03 and LRN-04 criteria and submission contract exist at the base. T-10 is done and merged in #57. The user-scoped mutation and execution grants require the high route. | 552503 |
| Plan / G1 | planner / high and main | done | The human approved commit `e6d733c05ed218b120e712c0f3eed0a37491d584`, directly on the recorded base. It adds only the 1,131-word T-11 entry. | planner initial 950695, planner revision 719498 |
| Tests / G2 | test-writers / medium and main | done | Human approved `b1ed9d71c8e0df8a62fef6008aa0992ab6d37be3` directly on G1. Verified the six test files, criterion-prefixed titles, expected baseline failures, targeted lint, typecheck and whitespace. The committed blobs are below. | unit 2619436, integration 2944973, browser 1657799 |
| Implement | implementer / medium and main | done | G2 tests match the committed baseline. Main applied the T-11 migration incrementally to LGTM and generated matching public and private types. Schema lint, app lint, typecheck, 150 targeted unit and 55 local integration tests passed. The production traversal revision passed 23 Chromium journeys, with all 3 T-11 journeys repeated on the final snapshot. | 15953410 |
| Review | reviewer / medium and security-reviewer / high | awaiting-decision | Frozen-tree digests matched before and after. Security returned blocking findings. Correctness reported three preliminary blockers and did not finish its final report. No fix rounds have run. | correctness unavailable, security 1287760 |
| Correctness rerun / G3 | reviewer / medium | done | Final report delivered on the same implementation. Both digests matched before and after. Confirmed REV-01–03, added blocking REV-04 and nonblocking REV-05. | 1020153 |
| Supplemental Tests / G2 | test-writer / medium and main | done | Human approved `73393437af12d34e751cf04d0372a976224de2e1` directly on G2, adding three test files. Original G2 blobs and index match. Frozen baseline shows 13 intended failures and 5 passes. Targeted lint, typecheck and whitespace passed. | 5521679 |
| Implement, fix round 1 | implementer / medium and main | done | Both test baselines and index match. Main refreshed only LGTM's local submission ledger and write RPC, regenerated matching types and passed schema lint, lint, typecheck, 160 unit tests, 63 local integration tests and all 3 T-11 Chromium journeys. | 21916083 |
| Scoped rereview, round 1 | reviewer / medium and security-reviewer / high | done | Both tree digests matched. Correctness cleared REV-01–04 and security cleared SEC-REV-01–05. Main independently passed the local integration and browser checks. Neither reviewer found a new issue in scope. | correctness 469108, security 788858 |
| Origin tests before Docs | test-writer / medium and main | done | The inbound Host fix was present before the round-1 freeze and explicitly checked in the SEC-REV-01 rereview. The five new POST cases and five existing request-boundary cases pass. Targeted lint, typecheck and whitespace pass. Human committed the single new test file in `ffc4d4bf97242cf95cf33252d8488ad8025cd319`, with blob `04c796a7db7da7f8fc6441e5921cf33c48a0a41c`. | 7524984 |
| Migration order before Docs | main | done | Fetched `upstream/master` at `f5d57f9` and verified the TA migration sequence ends at `20261108150000`. Renamed the T-11 migration with identical SQL. Fresh LGTM-only reset replayed the feature branch migrations. Regenerated types matched byte-for-byte, schema lint passed, and both T-11 integration suites passed all 19 cases. The upstream merge is pending. | — |
| Docs | docs / low | pending | Awaiting the human implementation commit and upstream merge. | — |
| Close-out / G4 | main | pending | Human validation unverified. | — |

## Decisions

| Date | Who decided | Decision and reason |
| --- | --- | --- |
| 2026-11-08 | Human | T-11 accepts first attempts only and rejects `previousSubmissionId`. T-13 owns retries under LRN-06. |
| 2026-11-08 | Human | Use a private ledger for submission creation only. Store idempotency keys, payload fingerprints and outcomes, including definitive failures, in the same database transaction that handles the submission. |
| 2026-11-08 | Human | Deliver the owning Learner's `/learner/history/:submissionId` page with pinned code, read-only comments and plain pending status. T-12 owns the submission detail API, grade display and grading start. Submission creation writes zero grading runs. |
| 2026-11-08 | Human | Inherit the write boundaries from [PR #43](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/pull/43). Create the submission and all comments together, prevent late child inserts, and test explicit execution grants with no direct table writes. |
| 2026-11-08 | Human | The main session runs each database-backed check with per-command escalation. Specialists report those checks as unrun. Ask before touching another project's local Supabase stack or ports. |
| 2026-11-08 | Human | One LRN-03.4 guard covers workspace and role navigation links, sign-out and browser Back/Forward. Reload/close use the native warning. Successful submission and unrefreshable expiry bypass the guard. |
| 2026-11-08 | Orchestrator | Wire the guard through the shared account shell in [WorkspacePage](../../src/components/account/workspace-page.tsx) and [WorkspaceAccessBoundary](../../src/components/account/workspace-access-boundary.tsx), including the expiry bypass. Route the brand and role links in [RoleNavigation](../../src/components/account/role-navigation.tsx) and the sign-out action in [SignOutControl](../../src/components/account/sign-out-control.tsx) through that guard. Author and TA inherit the shared wiring. The Learner review activates it when it has draft work. |
| 2026-11-08 | Human | The user-callable submission function validates its arguments and derives the fingerprint itself. Direct calls enforce the comment bounds. Only HTTP checks the 128 KiB raw body cap before parsing. |
| 2026-11-08 | Human | Map submission outcomes per the T-11 table and account failures under SYS-11 and ACC-03. The lifecycle message stays in the review. Server and client use exact shared message constants to distinguish the two cases each for `409 INVALID_STATE` and `503 SERVICE_UNAVAILABLE`. |
| 2026-11-08 | Human | Production e2e covers keyboard submission at phone width through the read-only result, both guard choices on app links, sign-out and Back, and the native reload warning. Other UI states use component tests. Account isolation stays in integration. |
| 2026-11-09 | Human | Rerun correctness on the frozen implementation through a final report and verify the before and after tree digests. Pause before any fix round. |
| 2026-11-09 | Human | Add supplemental acceptance tests in new files only for every blocking finding and SEC-REV-04. Reject descending comment order with `400 VALIDATION_ERROR` through HTTP and the direct RPC and preserve same-line order. Keep account isolation in integration. Stop for human review and a supplemental test commit. |
| 2026-11-09 | Human | Rename the [T-11 submission migration](../../supabase/migrations/20261109120000_learner_submissions.sql) to sort after the TA migrations already applied on hosted dev. Preserve its SQL. Merge `upstream/master` after the implementation commit, before Docs. |

### Decisions other roles should know about

- **Workspace account precondition.** The Learner workspace sends its loaded
  account ID in `X-LGTM-Workspace-Account-Id` on every submit and replay. The
  header is optional on POST. When present, it must be a UUID that matches the
  verified caller. A malformed or mismatched value is rejected before the RPC
  with no ledger or domain write, and the stale workspace follows ACC-03
  recovery. The threat is the app's own stale tab, which always sends the
  header. A headerless request is a caller acting as itself. The actor is
  still derived from the verified session and never from this header.

## Findings

| ID | From | Priority | Criterion | Status | Resolution |
| --- | --- | --- | --- | --- | --- |
| REV-01 | Correctness | P1 | LRN-04.4 and LRN-04.6 | Resolved | A status check returning throttling or submission-service failure stays uncertain and restores Check submission with the same frozen payload and key. |
| REV-02 | Correctness | P2 blocking | LRN-03.5 | Resolved | The HTTP boundary and direct RPC reject descending lines with `400 VALIDATION_ERROR` before any ledger or domain write. Equal lines keep input order. |
| REV-03, SEC-REV-03 | Both | P2 blocking | LRN-04.4–04.5 and INTEGRATION §3 | Resolved | The create RPC records the invalid-line outcome and comment index. Exact replay returns the same field error, even after unpublish. A changed payload conflicts. |
| REV-04 | Correctness | P2 blocking | LRN-04.3–04.4 | Resolved | The client compares UUIDs case-insensitively and opens the canonical result for an uppercase workspace URL. |
| REV-05 | Correctness | P3 nonblocking | LRN-04.5 and SYS-17.1 | Open | `review-draft.tsx:219` displays field errors without associating them with the affected retained comment or its edit control. Outside the approved supplemental test scope. |
| SEC-REV-01 | Security | P2 blocking | SYS-16.2 | Resolved | The POST rejects foreign origins before the RPC. It uses the validated inbound Host with Next's request protocol because the production request URL can carry an internal hostname. |
| SEC-REV-02 | Security | P2 blocking | SYS-09.3, SYS-12 and LRN-04.4 | Resolved | The workspace sends the loaded account UUID on submit and replay. The POST rejects a malformed or mismatched header before writes, and the client discards the stale draft through account recovery. |
| SEC-REV-04 | Security | P3 | SYS-16.1 and INTEGRATION §3 | Resolved | Returned validation diagnostics contain fixed messages and omit unknown property names. |
| SEC-REV-05 | Security | P3 blocking | SYS-10.1 and SYS-12.1 | Resolved | Supplemental integration verifies explicit read RPC grants and direct anonymous, owner, foreign Learner, Author, TA and missing-ID behavior. |

The review status and tracked binary diff digest was
`147eb1964ba2d891a103cf18c13c86a1642e4aac608350bc906555b70fa575a0`.
The untracked file digest was
`83cfcf611f78ebf47aeeb6aaaef5016b114a38df6d0ba072418b930ce3d238e0`.

The correctness rerun status and tracked binary diff digest matched before
and after at `147eb1964ba2d891a103cf18c13c86a1642e4aac608350bc906555b70fa575a0`.
The rerun untracked file digest matched at
`9a496c9e542a3d9d93485acce4ce6fe046e953fb27b912331f0bb8f19f43f1a7`.

Round 1 rereview digests matched before and after. The status and tracked
binary diff digest was `d7583bbc07e8f218cb8b4d0cde797822c5fa0fd10c7598d523936285d4ba77c6`.
The untracked file digest was
`62c4762047e1919324b4bfa66e96c84e76a73d29b6c6dd35aed92aac3c9ee577`.

## Open questions

None.

## Acceptance tests

| G2 test file | Git blob |
| --- | --- |
| `tests/e2e/learner/review.spec.ts` | `7d47c62494efb02560b3caa39b3f837047dcaf74` |
| `tests/integration/domain/learner-browse-fixture.ts` | `d506c32d1101db5a579b537dd97cba080b7fed6d` |
| `tests/integration/domain/learner-submissions.test.ts` | `7e8f3a18ef9a2808217f6050f6e3e35f6372490e` |
| `tests/unit/learner/review-workspace.test.tsx` | `87f0283f1db4e911e824c4ace5a58cb1f8a3f199` |
| `tests/unit/learner/submission-contract.test.ts` | `4c2c5cb5e1e747b97877581490c2943e37e5e98b` |
| `tests/unit/learner/workspace.test.tsx` | `3cbe68ce2a82d54b5451d6e004cf0c4fb2078a5a` |

| Criteria | Evidence |
| --- | --- |
| LRN-03.1–03.3, LRN-03.5–03.6, SYS-02.2, SYS-17.1 | `tests/unit/learner/review-workspace.test.tsx` covers line controls, editor exclusivity, inert text, ordering, limits, validation and focus. |
| LRN-03.4, ACC-02.5, ACC-03.2 and ACC-03.4 | The component suite covers guard activation with open editor text, draft retention or discard, and expiry. `tests/e2e/learner/review.spec.ts` exercises both choices on workspace and role links, sign-out and browser Back, and the native reload warning. |
| LRN-04.1–04.4, SYS-17.1 and SYS-17.3 | The component suite covers confirmation, payload lock, uncertain replay and result navigation. The browser suite drives keyboard submission at 320 CSS pixels through the read-only result. |
| LRN-04.5–04.6, SYS-02.1, SYS-11.4 and ACC-03.7 | The component suite covers definitive failures, conflict and account recovery. `tests/unit/learner/submission-contract.test.ts` covers strict fields, raw UTF-8 size, exact shared messages and the account outage response. |
| LRN-03.3, LRN-03.5, LRN-04.2–04.6, SYS-08, SYS-09, SYS-10 and SYS-12 | `tests/integration/domain/learner-submissions.test.ts` uses local Auth and the extended browse fixture for caller and grants checks, direct bounds, atomic immutable submissions, no grading run, pinned history, canonical replay, ledger isolation and lifecycle races. Implementation review covers cache scope, transactional boundaries and schema/type compatibility. |

The test diff also removes two superseded T-10 assertions that a workspace
without a first attempt is read-only. The read-only assertion for an existing
attempt remains.

### Failing-first evidence

- Targeted Learner and account Vitest passed 108 existing cases. The 22 new
  component cases failed at missing line controls, draft notice or submit
  action. The 19 new HTTP and shared-message cases failed at missing T-11
  modules.
- Local Supabase integration passed 44 existing browse cases. Nine submission
  cases failed because the POST or RPC is absent. The grant query found no
  function and PostgREST returned `PGRST202` for the new RPC.
- The production build started successfully. All three Chromium journeys
  reached an eligible workspace and failed at the missing line-specific
  “Add comment” action.
- After the G2 revisions, the contract suite showed 20 expected failures,
  including the new write-RPC error case at the missing POST. The integration
  suite showed 11 expected failures. The archived POST and the setup for exact
  denied-read outcomes stopped at the missing route. The missing-ID case
  reached the absent submission result reader directly.

### Interfaces defined by tests

- `src/app/api/v1/challenges/[id]/submissions/route.ts` exports
  `POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response>`.
  Comment field errors use keys such as `comments.0.body`.
- `src/lib/learner/submissions.ts` exports `submissionErrorMessages` with
  `lifecycleUnavailable`, `inProgress`, `submissionUnavailable` and
  `accountServiceUnavailable`. The contract tests assert their exact values.
- `src/server/learner/submissions.ts` exports `readLearnerSubmission(id: string)`.
  Its successful result is `{ status: "ok", submission }` with the pinned
  Learner projection, ordered comments and pending state. Tests assert exact
  `{ status: "unauthenticated" }`, `{ status: "forbidden" }`, and
  `{ status: "not_found" }` outcomes.
- `public.create_learner_submission(p_challenge_id uuid, p_idempotency_key uuid,
  p_payload jsonb)` is user-callable. Tests accept a direct error or the
  applicable `forbidden` or `invalid` outcome for denied and invalid calls.
  Grant checks and fixture cleanup use `private.submission_create_requests`,
  with `actor_id uuid` for actor-scoped cleanup.

## Next action

The human commits the implementation, renamed migration, generated types and
handoff, then merges `upstream/master`. Docs stays pending. REV-05 remains a
nonblocking follow-up outside the approved fix round.

## Supplemental acceptance tests

| Supplemental G2 test file | Git blob |
| --- | --- |
| `tests/integration/domain/learner-submission-boundaries.test.ts` | `d0b8adde7e97fa43a14158029f5eedf8c546f09d` |
| `tests/unit/learner/submission-request-boundaries.test.ts` | `f40cfc96d98596c20605228ded6b310e8a00d653` |
| `tests/unit/learner/submission-review-regressions.test.tsx` | `9c87a07b0f6d5a01bf514396049f35fce42459d3` |

| New file | Findings | Frozen baseline |
| --- | --- | --- |
| `tests/unit/learner/submission-review-regressions.test.tsx` | REV-01, REV-04, SEC-REV-02 | Four fail. A 429 or 503 removes Check submission, a canonical lowercase response leaves an uppercase workspace uncertain, and the initial submit and both replays omit the account header. ACC-03 recovery after a mocked denial passes. |
| `tests/unit/learner/submission-request-boundaries.test.ts` | SEC-REV-01, SEC-REV-02, SEC-REV-04 | Four fail. Foreign Origin and malformed and mismatched account headers reach the RPC. Nested validation echoes the unexpected property name. Headerless submission reaches the RPC as expected. |
| `tests/integration/domain/learner-submission-boundaries.test.ts` | REV-02, REV-03, SEC-REV-02, SEC-REV-03, SEC-REV-05 | Five fail. Both descending inputs write submissions and ledger entries. The invalid-line response is unrecorded, a corrected payload reuses its key, and an exact replay changes after unpublish. Both invalid account-header requests write submissions and ledger entries. Same-line order, read RPC grants, and the direct role/ownership matrix including absent ID pass. |
