# #81 — author-drafts

- **Route:** high
- **PLAN task(s):** T-20
- **Branch:** feat/81-author-drafts
- **Base commit:** a06f062 (`upstream/master`, after spec #80 merged as PR #86); originally 27e7542 stacked on the spec branch at e58a6d1
- **Status:** done (rebased onto `upstream/master`; push and PR are the human's)

Keep at `workflow/handoffs/<issue>-<slug>.md`. Only the orchestrator updates it.
Record the current state, not a transcript. Omit command output, stack traces
and attempt history unless the next stage needs them to continue, such as a
test that still fails.

## Goal

Let an Author create, configure, list, view and edit their own challenge drafts
(AUT-01.1–01.5, AUT-02.1–02.6 without “Generate proposals”, AUT-06.1–06.3)
through the user-scoped Author surface in INTEGRATION-SPEC §3.

## Stages

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | main (Claude Code) / default | done | #81 OPEN on 2026-11-10. Cited AUT-01/02/06 criteria and SYS/INTEGRATION headings exist at base. Route high: migrations, grants and record access. T-02 and T-03 done. Spec #80 not merged; branch stacked on it by human decision. | unavailable |
| Plan / G1 | main running sdd-plan (no planner subagent) | done | Human plan commit a3c610d4ca774f8ee054c548b0bfef237f3208e7 verified: only `workflow/PLAN.md`. | unavailable |
| Tests / G2 | main running sdd-test (no test-writer subagent) | done | Human test commit 949047e3fbbcd78bbe235b9b8272a4bfaab6c4c0 verified: exactly the 12 approved files; blob hashes in "G2 baseline". See "Tests stage evidence" below. Unit 87/87 fail on missing interfaces; integration 27 fail on missing interfaces, 3 pass on existing RLS/grants; e2e 3 discovered, not run. Lint passes; typecheck errors only for the five missing component modules. Existing Learner unit (165) and integration (52) suites still pass after the fixture change. | unavailable |
| Implement | main running sdd-implement (no implementer subagent) | done | Acceptance baseline unchanged (`git diff 949047e -- tests vitest.integration.config.mts` empty). Writes only in `src/` and `supabase/migrations/`. Main: full unit 913/913, Author integration 30/30, domain integration 106/106, full e2e 48/48 on a production build, lint and typecheck clean. Local DB reset applied the new migration; types regenerated. | unavailable |
| Review | reviewer / medium and security-reviewer / high (fresh general-purpose subagents, no handoff or narrative) | done | Initial: both completed read-only; digest 982b3697a4c138f509dd032993e26296f9de56c69e9fcdc2451382b2aa000024 (match); blocking REV-01, REV-02/SEC-REV-01. Fix round 1 (1 of 2): supplemental tests committed by the human in 479b7a8 (three files; blobs match the table below). Fixes in `src/lib/author/drafts.ts`, `src/components/author/draft-fields.tsx` and the migration; after `db:reset`/`db:types`, main ran unit 927/927, integration author+domain 151/151, e2e author 3/3, lint and typecheck; G2 and supplemental tests unchanged. Rereview by fresh agents of both reviewers: digest f47f4f71a01e83fd3584a9868dfda090d65bbe5ba02f3afe7e10d94c4917a9bf before and after (match). Both completed: all prior findings resolved; one new non-blocking P3 (REV-06). Each ran unit author 149/149, lint, typecheck; DB/e2e left to main. | initial: reviewer 170377, security 121803; rereview: reviewer 84960, security 86179 (subagent totals from the harness) |
| Docs | main running sdd-docs (no docs subagent) | done | Only `docs/DeveloperGuide.md` changed: new “Author challenge drafts” section with contracts and checks, placed before “Auth tests and settings”. Quoted labels and messages checked against `src/components/author/*`, routes, validation and the migration. README and `docs/index.md` need no change (the Author overview is unchanged). | unavailable |
| Close-out / G4 | main | done | PLAN T-20 `Status:` set to `done`. Human rebased onto `upstream/master` a06f062: 712ba22 plan, 700c86b and 94f40ed tests, ee7b0bd feat, 876d8b4 docs. Conflicts resolved in ee7b0bd: `src/server/learner/submissions.ts` keeps upstream's new Learner functions and re-exports `readRequestBody`/`matchesRequestOrigin` from `src/server/http/request.ts`; types regenerated; migration renamed to `20261111120000_author_drafts.sql` (upstream's `learner_grading` took version 20261110120000). Test blobs unchanged except `tests/integration/domain/learner-browse-fixture.ts`, which auto-merged with upstream edits; its T-20 change is identical. Main on the rebased tree: unit 1054/1054, full integration 404/404, lint, typecheck; full e2e 62/63, with the one failure a TA sign-in hang in the `beforeEach` of `tests/e2e/ta/summaries/journeys.spec.ts:95` (upstream test, before any Author step); that spec then passed 7/7 alone. Before the rebase the human's full e2e was 47/48, the failure caused by a concurrent agent run deleting Playwright artifacts; that spec passed 15/15 on rerun. `bun run verify`: not reported by the human, unverified. | unavailable |

## Decisions

| Date | Who decided | Decision and one-line reason |
| --- | --- | --- |
| 2026-11-10 | Human | Author work splits into T-20 (#81), T-21 (#82, AUT-03/04), T-22 (#83, AUT-05) and T-23 (#84, AUT-06.4–06.7), all high route and chained; the PLAN budget leaves exactly four Author slots. |
| 2026-11-10 | Human | `GET /author/challenges` returns `Page<AuthorChallengeCard>`; spec change in #80 (branch `docs/80-author-list-response`). |
| 2026-11-10 | Human | Start T-20 before #80 merges, stacked on the spec branch. The human rebases onto `upstream/master` after #80 merges; agents never rebase. |
| 2026-11-10 | Human | Review stages use fresh reviewer and security-reviewer subagents until the human asks for separate terminal sessions. Other specialist stages run in the main session with their skills. |
| 2026-11-10 | Human | Agents may run `gh issue create` and Docker commands; commit, push and PR creation stay with the human. |
| 2026-11-10 | Orchestrator (proposed at G1) | Any accepted draft PATCH counts as an edit: both versions increment and the active proposal set is cleared. The UI sends only changed fields and offers no save when nothing changed. |
| 2026-11-10 | Orchestrator (proposed at G1) | Page routes: `/author/challenges/[id]` detail, `/[id]/edit` “Edit draft”, `/[id]/configuration` “Flaw configuration”. T-21 adds proposal preview; T-22 adds publication result and revision detail. |
| 2026-11-10 | Orchestrator (proposed at G1) | T-20 detail shows only whether a live revision exists (`publishedRevisionId`); T-22 adds the published revision view. T-20 omits “Generate proposals”, “Unpublish” and “Archive”. |
| 2026-11-10 | Human (G1, G2) | G1 entry and the three proposals above approved. G2: SYS-16.2 origin checks, AUT-06.6 save outcomes for "Save changes", and the Draft/Published/Unpublished/Archived labels are in T-20. |
| 2026-11-10 | Human | `ProposalWithDecision` omits the model-local `key`; only server IDs persist. |
| 2026-11-11 | Human (G3) | REV-02/SEC-REV-01: add supplemental tests for the ledger table and private validator rather than accepting the T-03 sweep. |
| 2026-11-11 | Human (G3) | Fix round 1 covers all findings: REV-01, REV-03, REV-04, REV-05 and SEC-REV-02's cases, each with supplemental tests in new files committed by the human before fixes. |
| 2026-11-11 | Human (G4) | REV-06 accepted as a known minor issue; no fix round 2. |

## Context for resuming

Durable context any agent needs to continue the Author track:

- **What exists:** all nine Author tables and owner-only read policies (`supabase/migrations/20261107120000_domain_schema.sql`); draft/challenge triggers enforce immutable identity, `draft_version` +1 per update and no archived changes. `public.challenge_generation_access` gives a 403/404 decision. `src/server/llm/boundary.ts` already captures `inject_flaws` and `generate_hints` input from a draft, and `assembleCandidate` is in `src/server/llm/contracts.ts`; neither persists anything.
- **What is missing:** every Author write path. There are no table write grants (by design: PR #43 boundary), no user-callable Author functions, no SYS-10.3 admin functions for “Proposal generation” or “Publication” (T-21, T-22), no `/api/v1/author/*` routes, `src/server/author/`, components or tests. `/author/challenges` and `/new` are `RoleLanding` placeholders.
- **Patterns to copy:** Learner submission creation (`supabase/migrations/20261109120000_learner_submissions.sql`: private idempotency ledger, function-computed fingerprint, explicit grants) and Learner entry points (`src/server/learner/access.ts`, `responses.ts`, `src/app/api/v1/challenges/`). Vocabularies live in `src/lib/learner/challenges.ts` and `challenge-schema.ts`.
- **Test setup:** `vitest.integration.config.mts` includes only `auth,domain,llm,ta`; T-20 adds `author`. Integration and e2e need local Supabase (Docker); the main session runs database-backed checks.
- **Peer testing:** #18 says the prod starter catalogue is published through the Author flow, so T-20–T-22 are on the team's critical path.
- **Human gates:** commits use `--trailer "Agent: Claude"` in the order `docs(plan)`, `test(author)`, `feat(author)` (with this handoff), `docs(author)`, `chore(logs)`.

## Tests stage evidence

Acceptance files for the G2 commit:

- `tests/unit/author/requests.test.ts`: Route Handler validation matrix (exact
  AUT-01.2/AUT-02.2 field messages on POST and PATCH), code cap with CRLF and
  multibyte boundaries, 413 body cap, Idempotency-Key, list query bounds,
  SYS-11 account mapping, wrong-role denial, SYS-16.2 origin and workspace
  account header.
- `tests/unit/author/create-form.test.tsx`, `flaw-configuration.test.tsx`,
  `edit-draft.test.tsx`, `detail.test.tsx`, `challenge-list.test.tsx`, with
  shared `evidence.ts`: screen states for AUT-01, AUT-02, AUT-06.1–06.3 and the
  AUT-06.6 save outcomes.
- `tests/integration/author/fixture.ts` and `drafts.test.ts`: real local Auth,
  two Authors, Learner, TA and anonymous callers; grants, direct-access denial,
  direct RPC bounds, idempotency (replay, conflict, concurrency, per-actor),
  versions, invalidation, archived and published edits, list order, filter and
  cursors.
- `tests/e2e/author/drafts.spec.ts`: keyboard create at 320 px through Flaw
  configuration; filter, detail and edit; cross-Author denial.
- Supporting changes: `tests/integration/domain/learner-browse-fixture.ts` adds
  `author` and `author-e2e` ID scopes only; `vitest.integration.config.mts`
  includes `author`.

Failing-first: every unit failure is "Missing T-20 Route Handler" or an
unresolved `@/components/author/*` import. Integration failures are the missing
Route Handlers (19) plus the absent RPC functions (grants test and direct create).
Already passing at base, as expected from existing RLS and grants: direct table
writes denied; other roles cannot read drafts or proposal sets; direct edits by
other callers change nothing (vacuous until `update_author_draft` exists). The
e2e cross-Author test may also pass against today's placeholder pages.

Environment: `bun install --frozen-lockfile` synced stale `node_modules`
(`pg`). Local Supabase was empty (no users or tables, one migration) and was
reset with `bun run db:reset`. Fixture cleanup verified: zero users,
challenges, drafts and proposal sets afterwards.

### Interfaces defined by tests

- Route Handlers: `src/app/api/v1/author/challenges/route.ts` exporting `GET`
  and `POST`; `src/app/api/v1/author/challenges/[id]/route.ts` exporting `GET`
  and `PATCH`. They use `getAccount` from `@/server/auth/account` and
  `createClient` from `@/server/supabase/server`, with no admin client or LLM.
- RPCs, `EXECUTE` explicitly granted to `authenticated` only:
  `public.create_author_challenge(p_idempotency_key uuid, p_payload jsonb)`
  and `public.update_author_draft(p_challenge_id uuid, p_payload jsonb)`.
  `p_payload` uses the HTTP field names; create receives LF-normalized code.
- Components (default props are injected I/O):
  - `CreateChallengeForm({ create(input, idempotencyKey), navigate })`
  - `FlawConfiguration({ draft, save(patch), reload(), navigate })`
  - `EditDraftForm({ draft, save(patch), reload(), navigate })`
  - `AuthorChallengeDetail({ challengeId, read() })`
  - `AuthorChallengeList({ search, readPage(search), navigate })`
- Write results: `{ status: "ok", draft }`, `{ status: "invalid", fieldErrors }`,
  `{ status: "failed" | "uncertain" | "conflict" | "invalid_state" }`. Read
  results: `{ status: "ok", draft }` or `{ status: "not_found" | "unavailable" }`;
  list reads `{ status: "ok", page }` or `{ status: "unavailable" | "invalid" }`.
- Patches carry `expectedRowVersion`, `expectedDraftVersion` and only changed
  fields. Labels: "Flaw count", group "Flaw categories", "Status" filter with
  options All statuses, Draft, Published, Unpublished, Archived.

### G2 baseline (git blob hashes at 949047e)

| Blob | Path |
| --- | --- |
| 1f81ad96261496285c8363b51db3736b8ac8e0cf | tests/e2e/author/drafts.spec.ts |
| 9bd978398884c060b26917f6fa493dd3d81d2965 | tests/integration/author/drafts.test.ts |
| ceb60b0555d98a4367bddc9452d1fdd4402cc4ad | tests/integration/author/fixture.ts |
| f5ec1695454233b49e99105ad2e56b722d6f6dd0 | tests/integration/domain/learner-browse-fixture.ts |
| bdc830209cc6fb7b29c86c51b35379adf86ec21a | tests/unit/author/challenge-list.test.tsx |
| bfed138e07fab0e80f0fc743d883ec272de630a9 | tests/unit/author/create-form.test.tsx |
| 026a5f5e903c07a4c3b3fb1d77d0100a6df717b5 | tests/unit/author/detail.test.tsx |
| 9e161fe463db01a38c4513a88c43ecc800fb7a8a | tests/unit/author/edit-draft.test.tsx |
| 2634cf01196beb6a89879097416834e07b8ff7d7 | tests/unit/author/evidence.ts |
| 08e52e91248042884ab8ad8b482e0b1215cef28c | tests/unit/author/flaw-configuration.test.tsx |
| e46e30b35815826e27269304393fa999bd52c02a | tests/unit/author/requests.test.ts |
| 9b20d3cb78dfe3aff5f36c7fd0aab365f8370a09 | vitest.integration.config.mts |

## Implementation notes

- Migration `20261111120000_author_drafts.sql` (renamed from `20261110120000` at the rebase): private ledger
  `private.author_challenge_create_requests` (RLS on, no role grants), private
  `valid_author_draft_fields(jsonb)`, and definer RPCs `create_author_challenge`
  and `update_author_draft`. These are the only test-defined privileged
  surfaces. They return `{ status, challengeId }`; the server then rereads
  through owner RLS, so no new read surface exists. A reread failure after a
  committed write is reported as uncertain, never as a failure.
- Reads: list and detail use user-scoped selects under existing RLS. Detail
  reuses `public.challenge_generation_access` for the 403/404 distinction.
- `ProposalWithDecision` omits the model-local `key`: proposals persist only
  server IDs (INTEGRATION §3 says the server assigns IDs).
- Shared refactors without behaviour change: the request-body reader and
  origin check moved from `src/server/learner/submissions.ts` to
  `src/server/http/request.ts`; the new-file projection moved to
  `src/lib/code-projection.ts` (`projectLearnerCode` delegates to it).
- Component props use structural "view" types from `src/lib/author/drafts.ts`
  because the committed tests pass looser shapes (string statuses, `unknown[]`
  proposals).
- Next 16 Cache Components keeps visited routes mounted but hidden
  (`<Activity>`). Loaders clear their data on hide and reread on reveal. The
  create form drops its fields before navigating, and "Draft saved." reaches
  Flaw configuration through a one-time `sessionStorage` flag, because the e2e
  test requires a query-free configuration URL.
- Tooling: Vitest 5 caches `import.meta.glob` results in
  `node_modules/.vitest-cache`; delete it after adding modules that failing-first
  tests looked up.

## Findings

| ID | From | Priority | Criterion | Status | Resolution |
| --- | --- | --- | --- | --- | --- |
| REV-01 | reviewer | P2 blocking | AUT-01.2, SYS-02.1 | resolved (round 1) | `src/lib/author/drafts.ts:165-181`: U+0000 passes validation, Postgres rejects it (22P05), and it surfaces as a repeatable 503 "couldn't save". Reject U+0000 in text and code checks (and in `valid_author_draft_fields`). |
| REV-02 / SEC-REV-01 | reviewer, security-reviewer | P2 blocking (privileged-surface rule) | SYS-10.1 | resolved (round 1, tests in 479b7a8) | Migration lines 7-17 and 22-62: no 949047e test asserts the ledger's RLS and role privileges or `private.valid_author_draft_fields` EXECUTE denial. Needs supplemental tests or a G3 acceptance of the T-03 sweep. |
| REV-03 | reviewer | P3 | AUT-01.3 | resolved (round 1) | Category order changes the idempotency fingerprint; canonicalise categories on the server. |
| REV-04 | reviewer | P3 | AUT-06.3 | resolved (round 1) | `draft-fields.tsx:51` compares untrimmed text, so whitespace-only edits enable a no-op save that can clear proposals. |
| REV-05 | reviewer | P3 | PATCH contract | resolved (round 1) | Migration lines 149-150 accept 9-digit versions; HTTP allows up to 2,147,483,647. Align bounds. |
| SEC-REV-02 | security-reviewer | P3 | SYS-12.1 | resolved (round 1, tests in 479b7a8) | Direct `update_author_draft` test lacks TA, anon and stale-version cases (covered elsewhere). |
| REV-06 | reviewer (rereview) | P3 non-blocking | SYS-02.1 | accepted (human, 2026-11-11) | Migration lines 149-153: the `::bigint` bound checks share an OR chain with their regex guards, against the file's own evaluation-order note; a direct RPC with a fractional version could in principle raise 22P02 instead of returning `invalid`. Not reproduced on local Postgres (a plpgsql probe returned `invalid` for 1.5, -1 and 99999999999). Fix direction: a separate IF after the regex check. Accepted by the human as a known minor issue. |

## Open questions

None. G1–G3 questions are resolved (see Decisions).

## Current state (2026-11-11)

- `feat/81-author-drafts` is rebased onto `upstream/master` a06f062 (HEAD
  876d8b4). Uncommitted: the DeveloperGuide migration link fix (for the docs
  commit), this handoff and the session log (for `chore(logs)`), plus the human's
  `.claude/settings.json`, which is never committed.
- Local Supabase has every upstream migration plus `20261111120000_author_drafts.sql`
  and no fixture data.
- Remaining human steps: amend the docs commit, commit `chore(logs)`, run
  `bun run verify`, force-push the rebased branch to `origin`, open the PR.

## PR

From the fork to `upstream` `master`, filling `.github/pull_request_template.md`:
Closes #81; Requirement IDs from the T-20 Covers; Kind feature; Decisions made
from this handoff's G1–G4 rows; Spec approval #86; Session log
`logs/naa-siuuuu-ff/003-author-drafts-fix-round-close-out.md`; PLAN T-20; Route
high; Handoff this file; Reviews: reviewer pass, security pass, open P0/P1: 0.

## After T-20: next task T-21 (#82)

Issue #82 is open: “generate, preview and decide flaw proposals (T-21)”,
covering AUT-03 and AUT-04 (`workflow/specs/stories/AUT-03-generate-flaw-proposals.md`,
`AUT-04-preview-and-decide-flaws.md`). It adds the SYS-10.3 “Proposal
generation” admin operation and the `inject_flaws` caller: high route
(LLM operation, admin client, migrations). PLAN has no T-21 entry yet, so it
starts at Ready then Plan/G1 (sdd-plan in the main session). Depends on T-20:
branch `feat/82-<slug>` from `upstream/master` after T-20 merges, or stack on
`feat/81-author-drafts` only with the human's approval. Create
`workflow/handoffs/82-<slug>.md` from the template on that branch, never on
this one. T-20 decisions that bind T-21: any accepted draft edit clears the
active proposal set; proposals persist only server IDs (no `key`); proposal
preview is a T-21 page under `/author/challenges/[id]`; the detail page
currently has no “Generate proposals” action.

## Fix round 1 plan

1. **Supplemental tests (new files only; never edit G2 files).** Titles start
   with criterion IDs plus the finding ID. They must fail first against the
   current tree, except where noted.
   - `tests/integration/author/review-fixes.test.ts` (`// @vitest-environment node`,
     reuse `createAuthorFixture("author")`):
     - REV-02/SEC-REV-01: `private.author_challenge_create_requests` has
       `relrowsecurity`, no ACL entry for PUBLIC, and no table or column
       privilege for anon, authenticated or service_role.
       `private.valid_author_draft_fields(jsonb)` has no EXECUTE for PUBLIC,
       anon, authenticated or service_role. These pass already: they define the
       surfaces, they do not demonstrate a bug.
     - SEC-REV-02: direct `update_author_draft` by taA and anon (anon gets an
       rpc error) and a direct stale-version call leave the row unchanged.
       Expected to pass already.
     - REV-05: an HTTP PATCH with `expectedRowVersion: 1000000000` returns
       409 `VERSION_CONFLICT` (currently a 400 from the database regex).
     - REV-01: a direct `create_author_challenge` with U+0000 in title creates no
       row. PostgreSQL `jsonb` rejects `\u0000` (22P05) before the function body
       runs, so assert only that the call errors and no row exists.
   - `tests/unit/author/review-fixes-requests.test.ts` (mock pattern from
     `requests.test.ts`):
     - REV-01: U+0000 in title, description or workingCode on POST and PATCH
       returns 400 with a fieldError on that field (code uses
       "Working code contains invalid characters."), with no rpc call.
     - REV-03: POST and PATCH with categories `["security","logic_bug"]` send
       the rpc payload `["logic_bug","security"]`.
     - REV-05: PATCH with `expectedRowVersion: 2147483647` reaches the rpc.
   - `tests/unit/author/review-fixes-forms.test.tsx`:
     - REV-04: in `EditDraftForm`, adding only surrounding whitespace to the
       title keeps "Save changes" disabled and sends nothing.
2. Run the new tests and record failing-first evidence, then stop for the
   human's `test(author)` supplemental commit. Record its hash and blob hashes.
3. **Fixes:**
   - REV-01: reject `\u0000` in `text()` and `code()` in `src/lib/author/drafts.ts`
     (code: `codeInvalid`; title and description: their missing messages). No SQL
     change is needed because `jsonb` cannot carry U+0000.
   - REV-03: return `orderedCategories()` from `categoryList()` in
     `src/lib/author/drafts.ts`.
   - REV-04: in `changedFields` (`src/components/author/draft-fields.tsx`),
     compare trimmed title and description.
   - REV-05: in the migration, accept `^[1-9][0-9]{0,9}$` and `<= 2147483647`
     for both expected versions. The migration is unmerged, so editing
     `20261110120000_author_drafts.sql` in place is acceptable before the PR
     merges.
4. `bun run db:reset` and `bun run db:types`, delete `node_modules/.vitest-cache`,
   then run: all unit tests, `bun run test:integration tests/integration/author
   tests/integration/domain`, `bunx --no-env-file playwright test tests/e2e/author`,
   lint and typecheck. Confirm the G2 and supplemental baselines are unchanged.
5. Take a tree digest, rerun **both** reviewers as fresh subagents (both
   blocked), passing only their prior finding IDs, and compare digests.
   This is fix round 1 of at most 2.
6. Docs stage (sdd-docs: README/DeveloperGuide for the Author drafts surface),
   then close-out and G4.

### Fix round 1 supplemental test evidence (2026-11-11)

Step 1 is done; written in the main session with sdd-test. Only the three new
files changed; G2 files are unchanged (`git diff 949047e -- tests
vitest.integration.config.mts` empty). Lint and typecheck pass. Local DB holds
no users, challenges, drafts or ledger rows after the run.

| Blob (uncommitted) | Path | Result against the current tree |
| --- | --- | --- |
| 6a3267626d76fe29c1eb1ce8f4a83ea3b19e0a72 | tests/unit/author/review-fixes-requests.test.ts | 8 fail, 4 pass |
| 027c58a720bd8a39f29f91ed2f4f13a1a218c114 | tests/unit/author/review-fixes-forms.test.tsx | 2 fail |
| 4524c79d9e0757310d0206554e6d870835b8d0fc | tests/integration/author/review-fixes.test.ts | 6 fail, 9 pass |

- Failing first, as intended: REV-01 (U+0000 in title, description or code
  returns 503 instead of 400, on POST and PATCH, unit and HTTP integration);
  REV-03 (rpc categories keep request order); REV-04 (whitespace-only title or
  description edit enables "Save changes"); REV-05 integration (10-digit
  expected versions return 400 instead of 409).
- Already passing, as planned: ledger RLS and no PUBLIC/app-role privilege;
  validator not executable by PUBLIC or app roles; SEC-REV-02 TA direct edit
  returns `forbidden`, anon direct edit errors, stale row/draft direct edits
  return `version_conflict`, all leaving the row unchanged; direct create with
  U+0000 errors and creates nothing; REV-05 unit (2,147,483,647 reaches the rpc,
  2,147,483,648 is rejected before it).
- Added beyond the plan: HTTP integration cases for REV-01 (POST per field and
  PATCH code) and REV-05 unit cases above the bound, to show the end-to-end bug
  and pin the upper limit.

The digest helper used for review freezes hashes `git status --porcelain
--untracked-files=all`, `git diff --no-ext-diff --no-textconv --binary HEAD`
and the SHA-256 of each untracked non-`.env*` file.

## Next action

Human: amend the docs commit, commit `chore(logs)`, run `bun run verify`,
force-push and open the T-20 PR. Next agent (main session, orchestrator):
start T-21 per “After T-20” once the human says so.
