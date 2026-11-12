# #52 part 2 — Learner reports

- **Route:** high
- **PLAN task:** T-15 (Learner; G1 approved, `93ef7a4`)
- **Branch:** `feat/52-learner-reports`
- **Base commit:** `bf16af71e6e82680d15527bc5ad605653dc1fbd9` (`upstream/master`, includes T-14 via #99)
- **Status:** done

Keep at `workflow/handoffs/52-learner-reports.md`. Only the orchestrator updates it.
Record the current state, not a transcript.

## Goal

Deliver all of LRN-07.1–07.7: a Learner reports an unmatched comment on their own completed result through `POST /api/v1/submissions/:id/reports`, creating one immutable `learner_report` flag per (submission, comment) that appears through T-14's "Moderation flags". Closes #52.

## Stages

Claude Code sessions have no readable rollout for `rollout-summary.ts`; Tokens record `unavailable` and the Main sessions table records each session's own context usage (from `/context`) instead.

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | Main (Claude) / high | Complete | #52 OPEN. Branch `feat/52-learner-reports` at base `bf16af7` = `upstream/master`; tree clean at start. LRN-07.1–07.7 exist in `workflow/specs/stories/LRN-07-report-an-unmatched-comment.md`; §3 Learner surface lists `POST /submissions/:id/reports`; §5 Flags defines `learner_report`; SYS-12 has learner-raised flags. T-13 and T-14 done. Existing schema already has `review_flags` with learner check constraint and `review_flags_report_once` unique index (domain schema migration). Master latest migration `20261114130000_learner_history.sql`; open PR #98 (Author lifecycle) adds `20261114120000_author_lifecycle.sql`, edits PLAN and `database.types.ts`. High route: new user-callable write function, ledger, grants and migration. | unavailable |
| Plan / G1 | Planner skill run by Main (Claude) / high | Approved by Shawn 2026-11-12; G1 commit `93ef7a4` plus pending condition amendment | G1 commit `93ef7a4dae2395ca01acde7fc7369f4bec00c5a8` verified: PLAN only, 203 insertions, parent `bf16af7`. It predates the decision 1 condition; the shared-constants sentence in T-15 Constraints is an uncommitted 3-line PLAN change awaiting a human commit. T-15 inserted after T-14 in `workflow/PLAN.md`; only PLAN changed. Covers LRN-07.1–07.7, defers nothing. Capacity: 18/19 total, 6/6 Learner (PR #98's T-23 would make 19). All fields filled; Config paths name migration, types, two new fixtures, reused fixtures/scripts/configs and every TA file reused without edits. `git diff --check` clean. Prior tasks unchanged. | unavailable |
| Tests / G2 | Test-writer skill run by Main (Claude) / medium | Awaiting G2 | Resume checks: #52 OPEN; `upstream/master` still `bf16af7`; PR #98 still OPEN with `20261114120000_author_lifecycle.sql` and `database.types.ts`, no new collision. G1 `93ef7a4` is PLAN only. Changed paths (all new, all under `tests/`): `tests/unit/learner/report-contract.test.ts` (52 tests), `tests/unit/learner/report-comment.test.tsx` (29), `tests/unit/learner/report-fixture.ts`, `tests/integration/domain/learner-reports.test.ts` (8), `tests/integration/domain/learner-reports-fixture.ts`, `tests/e2e/learner/reports.spec.ts` (5). No package, config or `src/` change. Every new title starts with a criterion ID. Observed failures, all expected (missing T-15 interfaces): unit 78 failed / 3 passed (the 3 passes are LRN-07.1 "no action for pending/running/failed", which already holds); integration on local Supabase 8/8 failed on PGRST202 (no `create_learner_report`), missing ledger/function row, or missing route module; fixture setup and teardown clean (0 leftover `53a00000`/`50a00000` rows). Chromium 5/5 failed only on the missing "Report unmatched comment" button, after sign-in, result focus and comment-row assertions passed; `--repeat-each 3` not run (required only once passing). Regressions unchanged and passing: 6 unit files, 70 tests. `bun run lint` and `bun run typecheck` pass. Node: `.node-version` is 24 but only v20/v25 are installed; all checks ran on v25.6.1. Pre-G2 blob hashes: report-contract `379ffe3`, report-comment `4928994`, report-fixture `98b1413`, learner-reports.test `4f9382b`, learner-reports-fixture `9cd87b9`, reports.spec `9f8639f`. | unavailable |
| Tests / G2 commit | Shawn | Approved as written | Plan amendment `b434a1e` (PLAN only, parent `93ef7a4`); tests `f6c2cde` (the six test files only, parent `b434a1e`). All six committed blobs match the pre-G2 hashes above. | — |
| Implement | Implementer skill run by Main (Claude) / medium | Complete | Resume checks: #52 OPEN; `upstream/master` still `bf16af7`; PR #98 still OPEN, same files (migration `20261114120000_author_lifecycle.sql`, `database.types.ts`); new migration still sorts after both. Changed paths, all in implementer scope: `supabase/migrations/20261115120000_learner_reports.sql` (new: `private.learner_report_requests` ledger, RLS on, all API-role privileges revoked; `public.create_learner_report` security definer, `search_path=''`, revoked from PUBLIC/anon/authenticated/service_role then granted to authenticated), `src/lib/supabase/database.types.ts` (regenerated with `db:types`, +17), `src/lib/learner/reports.ts` (new: `reportErrorMessages`, input schema, strict acknowledgement check), `src/server/learner/reports.ts` (new: `createLearnerReport`), `src/server/learner/responses.ts` (+`learnerReportResponse`), `src/app/api/v1/submissions/[id]/reports/route.ts` (new), `src/components/learner/client-reports.ts` and `comment-report.tsx` (new), `src/components/learner/grading-result.tsx` (+9: hook call, notice region, per-comment control). No test, spec, PLAN, agent, skill, package or TA-code change; acceptance tests unchanged vs `f6c2cde`. Checks (Node v25.6.1): unit `report-contract` 52/52 and `report-comment` 29/29; unit regressions `tests/unit/learner` + `tests/unit/ta/moderation/queue.test.tsx` 25 files / 329 tests pass; integration on local Supabase (after a human-approved `bun run db:reset`) `learner-reports` 8/8; integration regressions `learner-history`, `learner-submissions`, `ta/moderation/writes`, `ta/inspection/reads` 57/57; Chromium `reports.spec.ts --repeat-each 3` 15/15; Chromium regressions `grading`, `feedback-and-retry-challenge`, `history` 11/11; `bun run lint` and `bun run typecheck` pass. | unavailable |
| Review | Fresh human-opened reviewer and security-reviewer sessions | Complete; passed | Tree digest before and after the batch both `82a9660f53142a504bbe7e22e3a269203689c41dfdf9ac3e77377b0c7af61dc8` (matched; batch valid; HEAD still `f6c2cde`). Reviewer: completed, all LRN-07, SYS-02/08/10/11/12/17 criteria met (Chromium journeys unverified by the reviewer; human-reported 15/15); only REV-01 P3, non-blocking. Reviewer checks: lint, typecheck pass; unit `report-contract` + `report-comment` 81/81; plus six T-15 unit regression files 151/151. Security reviewer: completed, no findings; SYS-10.1/10.2/10.4, SYS-08.3, SYS-11, SYS-12.1/12.4/12.5, SYS-02.1, LRN-07.1/07.4/07.5/07.7 met; SEC-01–06 and SYS-03 not applicable (no AI operation). Security checks: integration `learner-reports` 8/8, unit 81/81, lint, typecheck pass. REV-01 fixed by a direct main-session edit per G3 (see Findings); no reviewer rerun. Post-fix digest `6db90314e2edd0fe37a7374da2362827eae6d52bd7f45f36bedd148e943560cf`. | Reviewer session 116.2k; security-reviewer session 90.1k (context usage) |
| Docs | Docs skill run by Main (Claude) / low | Complete | Checkpoint diff is guide scope only: `README.md` (+7/−1: Learner reports paragraph with link; `test:e2e` row names unmatched-comment reports) and `docs/DeveloperGuide.md` (+77: new "Learner unmatched-comment reports" section after Learner review history, with "Report contract and persistence" and "Report checks"). On-screen text and messages quoted from `comment-report.tsx`, `src/lib/learner/reports.ts` and `moderation-history.tsx`; status codes from `src/server/learner/responses.ts`; persistence claims checked against the migration (role check, ownership, unmatched eligibility, ledger key `(actor_id, submission_id, idempotency_key)`, try-lock and pair lock, `authenticated`-only grant). Anchors `#account-pages`, `#ta-flag-resolution-and-grade-overrides`, `#learner-unmatched-comment-reports` exist; outside-docs links use upstream blob/master URLs (the migration and `src/lib/learner/reports.ts` links resolve only after merge). No Jekyll raw block needed. `git diff --check` clean. Covers LRN-07.1–07.7. Follow-up human edit (Shawn, session 5 prompt, docs only): the "Report contract and persistence" paragraph now links INTEGRATION §3 Learner surface (`#learner-surface`) and Transport, concurrency and errors (`#transport-concurrency-and-errors`) and §5 Flags (`#flags`) instead of listing status codes and envelopes; all three anchors match headings in `workflow/specs/INTEGRATION-SPEC.md` at `bf16af7`. Rechecked in session 5: diff vs HEAD still touches only the guide-scope and implementation paths above (`docs/DeveloperGuide.md` +75). | unavailable |
| Close-out / G4 | Main (Claude) / low | Complete; stopped at G4 | Session 5 rechecks: HEAD `f6c2cde`; `upstream/master` still `bf16af7` (nothing new). PR #98 still OPEN at `1f61431`, now also edits `docs/DeveloperGuide.md` (new Author section at its line 1174; ours inserts at 603, so no hunk overlap expected) plus the known `database.types.ts`, PLAN and `20261114120000_author_lifecycle.sql`. T-15 `Status:` set to `done` in `workflow/PLAN.md` (one line). Tree digest after the docs follow-up, before the PLAN edit: `90266c3b98febb7f110d31d0e1b0a84391373ee85ce4306561f8654b1310848f`. Not run this session: `bun run verify`, `bun run test:e2e` (G4, human; unverified). | unavailable |

## Main sessions

| Session | Stages | Context usage at last gate | Resume gaps |
| --- | --- | --- | --- |
| 1 | Ready, Plan / G1 (approved; stopped before Tests) | Final (from session 2 resume prompt): context 128,265 / 1,000,000 | G1 commit `93ef7a4` verified in-session; decision 1 condition PLAN amendment uncommitted at stop. |
| 2 | Tests / G2 (stopped at G2) | Final (from session 3 resume prompt): 248.1k | Decision 1 shared-constants PLAN amendment was still uncommitted at resume; carried forward and given its own commit command at G2. |
| 3 | Implement; stopped before Review | Final (from session 4 resume prompt): 214.4k | G2 commits `b434a1e` and `f6c2cde` verified at resume; no gaps. `bunx supabase migration up` was denied; Shawn chose `bun run db:reset` instead. |
| 4 | Review (results recorded, REV-01 fixed), Docs; stopped before Close-out | Final (from session 5 resume prompt): 110.3k | Pre-review digest recomputed and matched; HEAD `f6c2cde` unchanged; no gaps. |
| 5 | Close-out; stopped at G4 | Final (Shawn, at log request): 76.1k | HEAD `f6c2cde` unchanged; human docs-only edit to the Developer Guide made between sessions, recorded in the Docs row. |

End each main session after updating this handoff at every gate, including G3 decisions. A resumed session first verifies the gate commit named in its resume prompt and its scope in Git, records the previous session's final readout if available (otherwise `unavailable`), and lists resume gaps.

## Decisions

| Date | Who decided | Decision and one-line reason |
| --- | --- | --- |
| 2026-11-12 | Shawn (session prompt) | T-15 is a separate PLAN task on #52 covering all LRN-07; PLAN capacity already raised. |
| 2026-11-12 | Shawn (G1) | Decision 1, approved with condition: 409 `INVALID_STATE` serves ineligible comment, already-reported pair and in-progress replay, distinguished by stable server messages (T-11 precedent); absent submission or comment is 404. The three messages are shared constants in `src/lib/learner/`, like T-11's `submissionErrorMessages`, used by both route and client. |
| 2026-11-12 | Shawn (G1) | Decision 2, approved: eligibility = comment listed in the completed original grade's `unmatchedCommentIds`; publication state is irrelevant (historical results stay reportable). |
| 2026-11-12 | Shawn (G1) | Decision 3, approved: replay of a recorded success returns the flag's current `FlagView` (may be resolved). Migration path `20261115120000_learner_reports.sql`, after both master and PR #98. |
| 2026-11-12 | Shawn (G3, session 4 prompt) | Fix REV-01 now as a direct main-session edit with no reviewer rerun; P3, no behaviour change. |

## Findings

| ID | Priority | Location | Status |
| --- | --- | --- | --- |
| REV-01 | P3 (non-blocking) | `src/components/learner/comment-report.tsx:12` | Fixed (main session, per G3): `copy.unavailable` removed; the "unavailable" outcome now uses `reportErrorMessages.ineligible` (same text). After fix: `report-comment.test.tsx` 29/29, `bun run lint` and `bun run typecheck` pass (Node v25.6.1). Not rereviewed, by decision. |

## Open questions

- Close-out risk: PR #98 also regenerates `src/lib/supabase/database.types.ts` and edits `workflow/PLAN.md` and `docs/DeveloperGuide.md`; whichever merges second must rebase, regenerate types and keep both PLAN statuses and guide sections.
- Environment: Node 24 (`.node-version`) is not installed; Tests-stage checks ran on v25.6.1. Install Node 24 before G4 `bun run verify`.

## Interfaces defined by tests

- `src/lib/learner/reports.ts`: `reportErrorMessages` with `ineligible` "This comment isn't available for reporting.", `alreadyReported` "This comment has already been reported.", `inProgress` "Your report is still being confirmed. Check again." (decision 1 constants; route and client both use them).
- `src/app/api/v1/submissions/[id]/reports/route.ts`: `POST(request, { params: Promise<{ id }> })`. 201 `{ data: FlagView }`; 400 `VALIDATION_ERROR` with `fieldErrors.reason` ["Enter a reason."] or ["Reason is too long."]; 503 definitive message "We couldn't send your report. Try again."; 503 uncertain message "We couldn't confirm your report. Check report again."; 429 message "Too many requests. Try again later."; account failures reuse T-11 messages and the `accountAccessHeader` (including `unauthenticated` on 401); database `forbidden` with a still-valid Learner maps to 403 `FORBIDDEN`. A strict but mismatched FlagView acknowledgement (another submission, comment, kind/source, reason or extra field) maps to uncertain 503.
- `src/server/learner/reports.ts`: `createLearnerReport(submissionId: string, request: Request) => Promise<{ status: "ok"; flag: FlagView } | { status: ... }>`, returning `forbidden` for another Learner's submission and the workspace-access statuses (`unauthenticated`, `role_denied`, …).
- `public.create_learner_report(p_submission_id uuid, p_idempotency_key uuid, p_payload jsonb)`: security definer, `search_path=""`, explicit `EXECUTE` to `authenticated` only. Returns `{ status: "ok", flag }` or `{ status: "invalid" | "forbidden" | "not_found" | "ineligible" | "already_reported" | "in_progress" | "idempotency_conflict" }`.
- `private.learner_report_requests`: RLS on, no API-role privileges, has a `submission_id` column (fixture teardown deletes by it).
- `GradingResult` UI: per-comment "Report unmatched comment" button; form with heading "Report unmatched comment", textbox "Reason" (required, `aria-invalid` and `aria-describedby` error), help text naming 2,000, "Send report"/"Sending report…", "Cancel", "Check report"/"Checking report…", "Back to result", "Refresh result", "Reported" status text that receives focus. Notices are inside `role=status`, `role=alert` or `aria-live`. Requests send `Idempotency-Key`, `Content-Type: application/json` and the workspace account header; result refreshes `GET /api/v1/submissions/:id`.

Implementation notes for later stages:

- Ledger rows are written only after ownership is confirmed (owned submission), so outcomes for absent or foreign submissions are returned unrecorded; recorded outcomes are `ok`, `not_found` (comment outside the owned submission), `ineligible` and `already_reported`. Distinct keys on one (submission, comment) pair serialise on a blocking pair advisory lock; the same key uses T-11's try-lock for in-progress.
- A database `forbidden` with a still-valid Learner maps to 403 (unlike T-11's create path, which maps to 503); a 401/403 PostgREST permission error with a still-valid Learner maps to the definitive 503.
- Client: during a "Check report" replay, throttling keeps the request unconfirmed (Check report stays) rather than restoring Send, so no different report is sent while uncertain.
- Environment: Vitest's persistent fs module cache (`node_modules/.vitest-cache`) kept a stale empty `import.meta.glob` result for the integration file after the route was added; `bunx vitest --clearCache --config vitest.integration.config.mts` fixed it.

Test interpretation recorded: the PLAN's "duplicate fields" is covered as a duplicated query field and a repeated `Idempotency-Key` header. Duplicate JSON body keys are not required to fail, because that would need a custom JSON parser.

Suspicious content: None.

## Next action

G4 (human): install Node 24, run `bun run verify` and `bun run test:e2e`, then commit in order `feat(learner)` (src, migration, types, PLAN status and this handoff), `docs(learner)` (README.md, docs/DeveloperGuide.md), write the session log and commit `chore(logs)`, and open the PR to `upstream` `master` closing #52. If PR #98 merges first, rebase onto `upstream/master` and regenerate `database.types.ts` before verify.

Digest method (SHA-256, excluding `workflow/handoffs/`):
`{ git status --porcelain --untracked-files=all -- . ':!workflow/handoffs'; git diff --no-ext-diff --no-textconv --binary HEAD -- . ':!workflow/handoffs'; git ls-files --others --exclude-standard -z -- . ':!workflow/handoffs' | sort -z | xargs -0 cat; } | shasum -a 256`.
