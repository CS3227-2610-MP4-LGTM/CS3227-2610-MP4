# #82 — author-proposals

- **Route:** high
- **PLAN task(s):** T-21 (committed at G1 in c3cfbff)
- **Branch:** feat/82-author-proposals (the human creates it from `upstream/master`)
- **Base commit:** 22442ccfe444a281c341fa913094bf866093b78e (`upstream/master`, after T-20 merged as PR #93)
- **Status:** done (agent stages complete; G4 human checks unverified)

Keep at `workflow/handoffs/<issue>-<slug>.md`. Only the orchestrator updates it.
Record the current state, not a transcript. Omit command output, stack traces
and attempt history unless the next stage needs them to continue, such as a
test that still fails.

## Goal

Let an Author generate a validated flaw proposal set for their own draft, preview
it and approve or reject each proposal (AUT-03.1–03.7, AUT-04.1–04.6), through
`POST /author/challenges/:id/proposals`,
`PATCH /author/challenges/:id/proposals/:proposalId`,
`GET /author/challenges/:id/preview` (AUT-04.4 “Preview final challenge”) and the
SYS-10.3 “Proposal generation” operation.

## Stages

After each stage, the orchestrator records each agent's `tokens.total_tokens`
from `bun workflow/scripts/rollout-summary.ts --id <thread-id>` when that
thread has a readable rollout and a known total; otherwise record `unavailable`.
At close-out, record the orchestrator's own session total using the same rule.

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | main (Claude Code) / default | done | 2026-11-11: #82 OPEN (labels feat, role: author). Dependency T-20 done (PR #93 merged, #81 closed); T-04 and T-05 (LLM boundary, SoC provider) done. Checked at 22442cc: AUT-03.1–03.7 and AUT-04.1–04.6 in their story files; TECHNICAL-SPEC SYS-02–04, SYS-08–12, SYS-17–19 and the SYS-10 “Proposal generation” row; AI-SECURITY-SPEC SEC-01–06; INTEGRATION-SPEC §1 shared values and code cap, §2 “Code, proposals and locations”, §3 transport and Author surface (both proposal routes), §4 “Flaw injection: `operation: inject_flaws`”. PLAN capacity: 14 of 17 tasks used, Author 1 of 4, so T-21 fits. Route high: LLM operation, admin client (SYS-10.3), migrations and SEC requirements. Branch not yet created. | unavailable |
| Plan / G1 | main (Claude Code) / default, sdd-plan | done | 2026-11-11 at 22442cc: branch `feat/82-author-proposals` confirmed, HEAD = `upstream/master`; #82 OPEN. Only `workflow/PLAN.md` changed (T-21 entry added after T-20; existing tasks untouched). Capacity after T-21: 15 of 17 tasks, Author 2 of 4. All fields filled; Reads use exact spec headings. Found no server code deriving a real working-to-flawed diff (TA reads stored diffs), so T-21 adds one in `src/lib/` for T-22 to reuse. G1: human committed c3cfbff `docs(plan)` (PLAN.md only, `Agent: Claude` trailer). | unavailable |
| Tests / G2 | main (Claude Code) / default, sdd-test | done | 2026-11-11: eight new files, all under `tests/`, nothing else changed. Unit (`bun run test tests/unit/author/`): 96 fail, 149 pass (all T-20 tests still pass). Every failure is a missing T-21 module, export, Route Handler or the “Generate proposals” button. Integration (`bun run test:integration tests/integration/author/proposals.test.ts`, local Supabase): 59 fail, all “Missing T-21 Route Handler”. One passes already: the admin role has no direct privilege on proposal or draft tables (baseline guard). E2E (`bun run test:e2e tests/e2e/author/proposals.spec.ts`, production build, fake AI): 3 fail, waiting for the “Generate proposals” button, the “Generate proposals before reviewing flaws.” text and the access-denied text. `bun run lint`: test files clean. `bun run typecheck`: clean. The component tests load modules with `import.meta.glob` because `next build` type-checks `tests/`; static imports of missing modules blocked the e2e build. G2: human committed 15cdad9 `test(author)` (only these eight files). SHA-256 at G2: final-preview.test.ts 22af11b1…945a3f, proposal-requests.test.ts 51e1a62b…f98126, proposal-client.test.ts 616ab39a…038f4d, generate-proposals.test.tsx b0237ad5…835b37a, proposal-preview.test.tsx c84fd91a…7eb3e7b5, configuration-generation.test.tsx 119b71d4…98ad, integration proposals.test.ts 53045df3…7b7b, e2e proposals.spec.ts 99c215b9…a6ae1. | unavailable |
| Implement | main (Claude Code) / default, sdd-implement | done | 2026-11-11: committed tests unchanged since 15cdad9 (`git diff 15cdad9 -- tests/` empty). Changes are in `src/`, the new migration `supabase/migrations/20261112120000_author_proposals.sql` and the regenerated `src/lib/supabase/database.types.ts` (after `bun run db:reset` and `bun run db:types` on local Supabase). New database surfaces, as the tests define them: `public.persist_author_proposals(jsonb)` (security definer, `search_path=""`, `service_role` only, the SYS-10.3 “Proposal generation” use), `public.decide_author_proposal(uuid, uuid, jsonb)` (`authenticated` only), `private.author_proposal_requests` (replay ledger, no grants) and `private.valid_injected_proposals` (internal). The preview builds its diff from retained edits with no new dependency, and the route cross-checks the result against `assembleCandidate`. Orchestrator checks: `bun run test` 1,150/1,150 passed; `bun run test:integration` 464/464 passed (including the 60 new tests); `bun run test:e2e tests/e2e/author/` 6/6 passed after a CSS fix for overflow at 320px; `bun run lint` clean; `bun run typecheck` clean. | unavailable |
| Review | fresh reviewer and security-reviewer subagents (round 1, in parallel) | blocked (G3) | 2026-11-11: tree digest `635004ea2a96f625` before and after the batch (match; neither reviewer wrote anything). Both returned `completed`. Reviewer: no P0 or P1 findings; REV-01–03 are P2 and REV-04–07 are P3. It reran 245 unit and 105 Author integration tests (all pass), plus tsc and eslint on the Author paths; it did not run e2e. Security reviewer: no P0 or P1 findings; SEC-REV-02 is P2 and blocking, SEC-REV-01 is P3. It reran 96 unit and 60 integration tests and did read-only psql grant checks. Blocking: REV-01 (= SEC-REV-02; needs G3 because the tests change), REV-02 (breaks the PLAN constraint to use the shared code view, SYS-04.2), REV-03 (AUT-03.2 focus criterion unmet). | unavailable (reviewer 147,546 and security reviewer 102,278 subagent tokens, from the task notifications) |
| Tests (REV-01, G3 (a)) | main (Claude Code) / default, sdd-test | done | 2026-11-11: only `tests/integration/author/proposals.test.ts` changed since 15cdad9 (+55 lines, two tests in "database boundary"): `SYS-10.1 SYS-10.3 the private request ledger and output validator are unreachable by every API role` (RLS on; no table privilege for anon, authenticated or service_role; no EXECUTE on the validator for those roles or PUBLIC) and `SYS-10.3 SEC-02.1 the database rejects tampered output on completion even after server validation` (intercepts the real `complete` call and first sends six tampered proposal arrays with the same completed operation; each raises `INVALID_AI_OUTPUT` with no set and unchanged versions; then the genuine call saves the only set). Both pass against the existing implementation (the gap was coverage, not behaviour), so no failing-first run applies. Not mutation-tested. Checks: `bun run test:integration tests/integration/author/proposals.test.ts` 62/62 passed; `bun run lint` clean; `bun run typecheck` clean. G3 commit: human committed 35b9ae2 `test(author)` (this file only); SHA-256 proposals.test.ts a239ebd6…6eb6542 matches. | unavailable |
| Implement (fix round 1) | main (Claude Code) / default, sdd-implement | done | 2026-11-11: committed tests unchanged since 35b9ae2. REV-02: proposal code renders through `CodeDiffView` (new optional `label`/`showPath` props; `proposalDiff` in `src/lib/author/preview.ts`; `.snippet` CSS removed). REV-03: notice set after mount and focus to the h1 on arrival and in-place regeneration. REV-04: preview version mismatch shows the decision-conflict state. REV-05: “Try again” uses current versions and a new key. REV-06: preview rereads `draft_version` after assembly (3 attempts). SEC-REV-01: a failed recheck records `FORBIDDEN`; SQL `fail` skips the role check but keeps ownership. REV-07: SQL `complete` raises `AI_TIMEOUT` for an expired operation. Supplementary test `tests/unit/author/proposal-diff.test.ts`. `db:reset` + `db:types`. Checks: unit Author 246/246, `tests/unit/learner/code-diff.test.tsx` + `tests/unit/ta/inspection/` 53/53, integration Author 107/107, e2e Author 6/6, lint and typecheck clean. | unavailable |
| Review (round 2) | ONE fresh verifier subagent (sdd-review + sdd-security-review) | done | 2026-11-11: tree digest `17cb97dd9dc678e3` before and after (match). `completed`. All eight round-1 findings resolved; no P0–P2; one new P3 (REV-08). Reran unit Author 246, integration Author 107, lint, typecheck; e2e not run. After the review, the main session fixed REV-08 in `author-routes.tsx` (reload clears the one-shot `generated`); unit Author 246/246, lint and typecheck clean. That one-line change was not rereviewed. | unavailable (verifier 102,797 subagent tokens, from the task notification) |
| Tests (round-2 gaps, G3) | main (Claude Code) / default, sdd-test | done | 2026-11-11: three tests. `tests/unit/author/proposal-preview.test.tsx` new `AUT-03.2 SYS-17.1 moves focus to the Proposal preview heading on arrival after generation` (REV-03). New `tests/unit/author/proposals-route.test.tsx` `AUT-03.2 SYS-17.1 announces a generation once and a reload neither repeats it nor moves focus` (REV-08; mocks only `next/navigation` and the Author client). `tests/integration/author/proposals.test.ts` late-result test tightened from `[409, 504]` to `failed(late, 504, "AI_TIMEOUT")` (REV-07). All pass against current code. Mutation check: removing the REV-08 reset fails the route test; removing the REV-03 focus call fails both focus tests; code restored byte-identical. REV-07 not mutation-tested (needs two `db:reset` runs). Checks: unit Author 248/248, the late-result integration test passes, lint and typecheck clean. G3 commit: human committed 22261b0 `test(author)` (these three files only, `Agent: Claude` trailer); SHA-256 proposal-preview.test.tsx e3ee1149…6fe9bef, proposals-route.test.tsx f1cd3a8f…0403c2f, proposals.test.ts 37f0f029…4976d42 match. | unavailable |
| Docs | main (Claude Code) / default, sdd-docs | done | 2026-11-11: checkpoint at 22261b0 (no test changes since; status digest `6751a1e17e092c1f`). Only `docs/DeveloperGuide.md` changed in the stage: new `### Author flaw proposals` with `#### Author proposal contracts` and `#### Author proposal checks`, after `#### Author draft checks`. Every quoted string checked against `proposalMessages` in `src/lib/author/drafts.ts` and the components (`generate-proposals.tsx`, `proposal-preview.tsx`, `challenge-detail.tsx`, `flaw-configuration.tsx`); status codes against `src/server/author/responses.ts`; database claims against the migration (grants, RLS, `complete` checks, 45 s ledger expiry). Links outside `docs/` use full upstream blob/master URLs; no Jekyll-sensitive sequences added. No checks rerun (docs only). | unavailable |
| Close-out / G4 | main (Claude Code) / default | done (G4 pending) | 2026-11-11: T-21 `Status: done` in `workflow/PLAN.md`; handoff `done`. `bun run verify` and full `bun run test:e2e` not run by the agent; they are G4 human checks and remain unverified. Orchestrator session total: unavailable (no readable rollout for Claude Code). | unavailable |

## Decisions

| Date | Who decided | Decision and one-line reason |
| --- | --- | --- |
| 2026-11-10 | Human | Author work is T-20 (#81), T-21 (#82, AUT-03/04), T-22 (#83, AUT-05), T-23 (#84, AUT-06.4–06.7), all high route and chained; the PLAN budget leaves exactly four Author slots. |
| 2026-11-10 | Human | Reviews use fresh reviewer and security-reviewer subagents (no handoff, no narrative) until the human asks for separate sessions. Other specialist stages run in the main session with their skills. |
| 2026-11-10 | Human | Agents may run `gh issue create` and Docker commands. Commit, push, rebase and PR creation stay with the human. |
| 2026-11-11 | Human | The agent checks gate commits itself with `git log`/`git show` instead of asking for commit IDs. |
| 2026-11-11 | Human | From now on, a new agent session continues this feature as a sequential generator–verifier workflow. The main session is the generator: it runs fixes, tests and Docs with the stage skills. Each review uses ONE fresh verifier subagent that applies both sdd-review and sdd-security-review (REV-nn and SEC-REV-nn IDs). This replaces the parallel reviewer and security-reviewer pair, to be faster and use fewer tokens. Human gates, tree digests and human-only commits are unchanged. |
| 2026-11-11 | Human (G3) | Round-2 test gaps: add the three key tests (REV-03 focus, REV-07 504 `AI_TIMEOUT`, REV-08 reload) as a separate `test(author)` commit; REV-04/05/06 and SEC-REV-01 stay without committed tests (accepted). |
| 2026-11-11 | Human (G3) | REV-01 / SEC-REV-02: option (a). Add an integration test for the private ledger and validator grants and the SQL revalidation branch, committed separately as `test(author)` before the fix commit. |
| 2026-11-10 | Human (T-20) | Binding for T-21: any accepted draft edit clears the active proposal set and increments both versions; proposals persist only server IDs (`ProposalWithDecision` omits the model-local `key`). |
| 2026-11-11 | Human (G1) | T-21 includes `GET /author/challenges/:id/preview`; AUT-04.4 needs it and T-22 reuses it. |
| 2026-11-11 | Human (G1) | A successful generation and each accepted decision increment both rowVersion and draftVersion; failed, replayed or stale generations change none. |
| 2026-11-11 | Human (G1) | “Proposal preview” is at `/author/challenges/[id]/proposals`; “Generate proposals” is on the detail and configuration pages. |
| 2026-11-11 | Human (G1) | `inject_flaws` output cap (1280 tokens) stays unchanged in T-21; a possible live-length risk is outside this task. |
| 2026-11-10 | Human (T-20) | Binding for T-21: page routes are `/author/challenges/[id]` (detail), `/[id]/edit`, `/[id]/configuration`. T-21 adds proposal preview under `/author/challenges/[id]` and the “Generate proposals” action, which T-20 left out. |

## Context for resuming

- **What T-20 built (merged):** Author routes `GET`/`POST /api/v1/author/challenges`
  and `GET`/`PATCH /api/v1/author/challenges/[id]`; `src/server/author/`
  (`access.ts` role check, `drafts.ts` reads and writes, `validation.ts`,
  `responses.ts` error envelopes); `src/lib/author/drafts.ts` (DTOs, field
  messages, `orderedCategories`, `ProposalWithDecision`); components in
  `src/components/author/` (`use-draft-editor.ts` already confirms before
  clearing proposals); migration `supabase/migrations/20261111120000_author_drafts.sql`
  (`create_author_challenge`, `update_author_draft`, private ledger and
  validator). `AuthorDraft.proposals` and `generationId` are read today but
  always empty from T-20 paths. The integration fixture
  `tests/integration/author/fixture.ts` has `activateProposalSet()`, which
  imitates T-21 generation; T-21's real path should replace that imitation in
  new tests.
- **LLM foundations (T-04, T-05):** `src/server/llm/boundary.ts` captures
  `inject_flaws` input from a draft; `src/server/llm/contracts.ts` has the
  injection schema and `assembleCandidate`; `src/server/llm/config.ts` sets the
  operation budget; the fake provider is used in all tests (never live calls).
- **Patterns to copy for LLM work persisted by the admin client:** TA summaries
  (`src/server/ta/summaries.ts` calls `createAdminClient()` then
  `persist_ta_summary`, granted only to `service_role` in
  `supabase/migrations/20261110160000_ta_performance_summaries.sql`) and Learner
  grading (`src/server/learner/grade-submission.ts`,
  `supabase/migrations/20261110120000_learner_grading.sql`: start, context,
  complete and fail functions). Shared request helpers are in
  `src/server/http/request.ts`.
- **Spec anchors for Plan:** the T-20 PLAN entry is the format to follow. The
  SYS-10 table's “Proposal generation” row: verified Author owns the editable
  challenge; the result passes SEC-02 validation against the captured draft
  snapshot; persist the set, proposals and pending decisions together with the
  draft's active-generation pointer.
- **Test setup:** `vitest.integration.config.mts` already includes `author`.
  Integration and e2e need Docker running and local Supabase (`bun run db:start`).
  Never run two Playwright runs at once: a second run deletes the first one's
  `.next/playwright-results` artifacts. The full e2e suite takes about 13 minutes.
  `tests/e2e/ta/summaries/journeys.spec.ts:95` once hung on TA sign-in during a
  full run and then passed alone.
- **Tooling:** Vitest caches `import.meta.glob` results in
  `node_modules/.vitest-cache`; delete it after adding modules that
  failing-first tests looked up. `bun run db:types` must follow every migration
  change (CI checks committed types).
- **Peer testing:** #18 needs the prod starter catalogue published through the
  Author flow, so T-21 and T-22 are on the team's critical path.
- **Human gates:** separate commits with `--trailer "Agent: Claude"` in the
  order `docs(plan)`, `test(author)`, `feat(author)` (with this handoff),
  `docs(author)`, `chore(logs)`. The human's local `.claude/settings.json`
  change is never committed.

## Interfaces defined by tests

- Route Handlers: `src/app/api/v1/author/challenges/[id]/proposals/route.ts` (`POST`),
  `.../proposals/[proposalId]/route.ts` (`PATCH`), `.../[id]/preview/route.ts` (`GET`).
  Generation success may be 200 or 201; decision and preview success is 200.
- `src/lib/author/preview.ts`: `buildFinalPreview({ language, workingCode, proposals })`
  returns `{ code: CodeDiff, flaws: RevisionFlawPreview[] }`, or `null` when any
  decision is pending or none is approved.
- `src/components/author/client.ts`: `generateProposals(id, versions, key, accountId?)`,
  `decideProposal(id, proposalId, body, accountId?)`, `readFinalPreview(id)`. Status
  mapping: generation `ok`, `invalid_output`, `limited`, `too_large`, `timeout`, `failed`,
  `conflict` (`VERSION_CONFLICT` or the archived message), `uncertain` (in-progress or
  lost reply), plus access failures. Decisions: `ok`, `conflict`, `failed` (503 with
  the shared “unavailable” message), `uncertain`. Preview: `ok`, `incomplete` (409),
  `unavailable`.
- `src/components/author/generate-proposals.tsx`:
  `GenerateProposals({ draft, unsaved?, generate, onGenerated, reload })`.
- `src/components/author/proposal-preview.tsx`:
  `ProposalPreview({ draft, generated?, decide, readPreview, reload, generate })`.
  List named “Proposals”, region and heading “Final challenge preview”, “Source
  line N” or “Source lines N–M”, “Final line N”, and an “AI-generated” label.
- `FlawConfiguration` gains optional `generate` and `onGenerated` props.
- Page `/author/challenges/[id]/proposals`. Denial shows “This challenge isn't
  available to your account.”
- Database: each admin function the generation path calls (other than
  `llm_accounting`) is `SECURITY DEFINER` with `search_path=""` and is executable
  only by `service_role`. Each new user-scoped function the decision path calls is
  executable only by `authenticated`. Users cannot write proposal tables or the
  generation pointer directly.

## Findings

Review round 1 (2026-11-11), all resolved in fix round 1 and confirmed by review round 2. Round 2 added REV-08.

| ID | Priority | Location | Criterion | Finding and fix direction | Blocking |
| --- | --- | --- | --- | --- | --- |
| REV-01 / SEC-REV-02 | P2 | `supabase/migrations/20261112120000_author_proposals.sql:7-19, :23-79, :285` | SYS-10.1, SYS-10.3, SEC-02.1 | No test in 15cdad9 defines the private surfaces `private.author_proposal_requests` and `private.valid_injected_proposals`. The tests also never reach the SQL revalidation branch, because the TS boundary rejects invalid output first. Fix: a human-approved test addition in `tests/integration/author/proposals.test.ts`. It calls `persist_author_proposals` action `complete` with a tampered proposals payload against a real completed operation, asserting `INVALID_AI_OUTPUT`, no new set and unchanged versions. It also asserts that `has_table_privilege`/`has_function_privilege` are false for anon, authenticated and service_role, plus no PUBLIC EXECUTE. | Yes (review rule; needs G3) |
| REV-02 | P2 | `src/components/author/proposal-preview.tsx:149-152`, `src/app/globals.css` `.snippet` | SYS-04.2, SYS-17.3, PLAN constraint | Proposal snippets use a custom `<pre>`, not the shared `CodeDiffView`. They have no keyboard focus or label, so long lines may not be scrollable by keyboard. Fix: render each proposal as a small original→replacement `CodeDiff` through `CodeDiffView`. | Yes |
| REV-03 | P2 | `src/components/author/author-routes.tsx` (`useOpenProposals`), `proposal-preview.tsx` (`adoptGenerated`, status region) | AUT-03.2, SYS-17.1 | Focus falls to body after generation and navigation, and after in-place regeneration. The status region mounts already holding the message, so it may not be announced. Fix: focus the “Proposal preview” h1 (`tabIndex={-1}`) on arrival when `generated` is set and in `adoptGenerated`, and set the notice after mount. | Yes |
| SEC-REV-01 | P3 | `src/server/author/proposals.ts:141-143` | SEC-05.3, AUT-03.7 | When the account recheck after the provider call fails, the request row stays `active`, and replays return in-progress until the 45 s expiry. Fix: record the failure through `failure(...)` (for example FORBIDDEN) before returning. | No |
| REV-04 | P3 | `proposal-preview.tsx` `showPreview` | AUT-04.4, AUT-04.6 | A preview whose `draftVersion` mismatches the shown draft is reported as a read failure, and “Try again” can never succeed. Fix: show the AUT-04.5 conflict state (“This draft changed…” plus “Reload draft”). | No |
| REV-05 | P3 | `generate-proposals.tsx` “Try again” | AUT-03.6 | “Try again” reuses the stored versions, so a decision saved after a failure causes a false conflict. Fix: build a new attempt from the current `draft` versions, and keep the stored versions only for “Check generation”. | No |
| REV-06 | P3 | `src/server/author/proposals.ts` `readAuthorPreview` and `drafts.ts` `loadDraft` | AUT-04.4 | Separate reads can mix a decision committed mid-read with an older `draftVersion`. Fix: reread the versions after assembly and return 409 or retry on a mismatch. T-22 must not trust the preview `draftVersion` alone. | No |
| REV-07 | P3 | migration `complete` op check; `responses.ts` INVALID_STATE mapping | AUT-03.5, AUT-03.6 | A late result after operation expiry returns 409 with the archived message instead of the timeout. Fix: raise `AI_TIMEOUT` in `complete` when `op.expires_at <= clock_timestamp()`. | No |
| REV-08 | P3 | `src/components/author/author-routes.tsx` `ProposalsRoute` | AUT-03.2, SYS-17.1 | “Reload draft” remounted the preview with `generated` still true, re-announcing generation and moving focus. Fixed after review: reload clears `generated`. Not rereviewed. | No |

Round 2 test gaps (non-blocking; changes to committed tests need G3): REV-03 focus has no assertion; REV-04, REV-05, REV-06, SEC-REV-01 and REV-08 have no committed test; `proposals.test.ts:455` accepts `[409, 504]` so it would not catch a regression of REV-07.

## Open questions

None.

## Next action

G4 (human). Agent stages are complete; these checks are unverified until reported:

1. Run `bun run verify` and `bun run test:e2e` (full e2e takes about 13 minutes;
   never run two Playwright runs at once).
2. Commit in order, each with `--trailer "Agent: Claude"`:
   - `feat(author)`: all `src/` changes, the migration, `database.types.ts`,
     `workflow/PLAN.md`, this handoff and `tests/unit/author/proposal-diff.test.ts`.
   - `docs(author)`: `docs/DeveloperGuide.md` only.
   - `chore(logs)`: the session logs under `logs/naa-siuuuu-ff/`.
3. Push to `origin` and open the PR from the fork to `upstream` `master`
   (closes #82), listing the Decisions above under "Decisions made".

Never commit `.claude/settings.json`.
