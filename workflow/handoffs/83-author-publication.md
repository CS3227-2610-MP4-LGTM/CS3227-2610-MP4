# #83 — author-publication

- **Route:** high
- **PLAN task(s):** T-22 (committed at G1 in bf2af9e)
- **Branch:** feat/83-author-publication (created from `upstream/master` by the agent, local only)
- **Base commit:** a91e5e22d9586dc9274e53578bb543db7e1bf6f0 (`upstream/master`, after T-21 merged as PR #94)
- **Status:** done (G4 pending)

Keep at `workflow/handoffs/<issue>-<slug>.md`. Only the orchestrator updates it.
Record the current state, not a transcript. Omit command output, stack traces
and attempt history unless the next stage needs them to continue, such as a
test that still fails.

## Goal

Let an Author publish an eligible draft as a new immutable revision with one
validated hint per retained flaw, and inspect the published revision
(AUT-05.1–05.7), through `POST /author/challenges/:id/publish`,
`GET /author/challenges/:id/revisions/:revisionId` and the SYS-10.3
“Publication” named use.

## Stages

After each stage, the orchestrator records each agent's `tokens.total_tokens`
from `bun workflow/scripts/rollout-summary.ts --id <thread-id>` when that
thread has a readable rollout and a known total; otherwise record `unavailable`.
At close-out, record the orchestrator's own session total using the same rule.

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | main (Claude Code) / default | done | 2026-11-11: #83 OPEN (labels feat, role: author). Dependency T-21 done (PR #94 merged at a91e5e2, human reported verify and e2e passed); T-04 and T-05 done. Specs unchanged between 22442cc and a91e5e2 (`git diff --stat` on `workflow/specs` empty), so T-21's ID checks still hold; additionally read at a91e5e2: AUT-05.1–05.7 in the story file, AUT-03.2, AUT-04.4, SEC-03 with SEC-03.1–03.2, the SYS-10.3 “Publication” row, INTEGRATION-SPEC §2 “SYS-12 decision: immutable published revisions”, §3 Author surface (publish and revision routes, `AuthorPublication`) and §4 “Publication hints: `operation: generate_hints`”. PLAN capacity: 15 of 17 used, Author 2 of 4, so T-22 fits. Route high: LLM operation, admin client (SYS-10.3), migration and SEC requirements. | unavailable |
| Plan / G1 | main (Claude Code) / default, sdd-plan | done | 2026-11-11: only `workflow/PLAN.md` changed (T-22 entry added after T-21, before `## TA`; existing tasks untouched). Capacity after T-22: 16 of 17, Author 3 of 4. All fields filled; Reads use exact spec headings. Foundations found: the boundary already captures `generate_hints` input from the active set and applies the SEC-03 checks (`src/server/llm/boundary.ts`, `safety.ts`); the revision tables and `private.valid_revision_diff` exist; no publish function, route or page exists yet. G1: human committed bf2af9e `docs(plan)` (PLAN.md only, `Agent: Claude` trailer) and accepted the three plan choices below. | unavailable |
| Tests / G2 | main (Claude Code) / default, sdd-test | done | 2026-11-11: seven new files and one changed file, all under `tests/`; nothing else changed. Unit (`bun run test tests/unit/author`): 65 fail, 252 pass (all earlier Author tests still pass). Every failure is a missing T-22 module, export, Route Handler or the “Publish challenge” button; four new tests pass already because no publication action exists yet (three “offers no publication” cases and “pending generation disables publication”). Integration (`bun run test:integration tests/integration/author/publication.test.ts`, local Supabase): 59 fail (58 “Missing T-22 Route Handler”, one missing `private.author_publication_requests`), one passes (the admin role has no direct privilege on revision tables, a baseline guard); all arrangement code runs up to the publish call. `drafts.test.ts` and `review-fixes.test.ts` still pass (45) with the fixture change. E2E (`bun run test:e2e tests/e2e/author/publication.spec.ts`, production build, fake AI): 2 fail, waiting for the “Publish challenge” button and the access-denied text. `bun run lint` and `bun run typecheck`: clean. `tests/integration/author/fixture.ts` changed only in `dispose` (removes revisions published through the API). SHA-256 before G2: publication-requests.test.ts 09baac90…15e7caab, publication-client.test.ts 50ee0ad0…bba2eadd, publish-challenge.test.tsx cbc064eb…b2dd8f81, publication-views.test.tsx c265331b…b649608a, proposal-preview-publication.test.tsx 37117c98…971101b5, integration publication.test.ts 2e8e199e…c8f3b068, fixture.ts a0606b34…e1b44a34, e2e publication.spec.ts 3fd7f5d1…8623bf37. G2: human committed b349ad6 `test(author)` (these eight files only, `Agent: Claude` trailer); hashes match. | unavailable |
| Implement | main (Claude Code) / default, sdd-implement | done | 2026-11-11 (two sessions): committed tests unchanged since b349ad6 (`git diff b349ad6 -- tests/` empty, no untracked test files). Server and database: migration `supabase/migrations/20261113120000_author_publication.sql` (ledger `private.author_publication_requests`; `public.persist_author_publication(jsonb)`, `service_role` only; owner-only Author read policies on `revision_answers`, `revision_flaws`, `flaw_hints`), regenerated `database.types.ts`, `src/server/author/publication.ts`, `publicationErrorResponse` in `responses.ts`, both Route Handlers, `src/lib/author/publication.ts` (adds `formatPublishedAt`), client `publishChallenge`/`readRevision`, `writeRequest` exported from `proposals.ts`. UI: `publish-challenge.tsx`, new `publication-result.tsx` and `published-revision.tsx`; `ProposalPreview` gains `publish`/`onPublished` and renders `PublishChallenge` inside the shown final preview, with generation and publication mutually disabled (also decisions and preview while publishing); `GenerateProposals` disables its buttons when `disabled`; `author-routes.tsx` adds `ReadFailure`, `RevisionLoader`, `PublicationRoute`, `RevisionRoute` and wires publication into `ProposalsRoute`; pages `src/app/author/challenges/[id]/publication/page.tsx` and `.../revisions/[revisionId]/page.tsx`. Checks run by the orchestrator: `bun run test` 88 files, 1222 pass; `bun run test:integration` 27 files, 526 pass (whole suite, local Supabase); `bun run test:e2e tests/e2e/author/` 8 pass; `bun run lint` and `bun run typecheck` clean. Not run: full `bun run test:e2e`, `bun run verify` (G4). | unavailable |
| Review | ONE fresh verifier subagent (sdd-review + sdd-security-review) | done (decision pending) | 2026-11-11: tree digest `a589c4d0cde5922f` before and after (match). `completed`. No P0–P2; four P3 (REV-01–REV-03, SEC-REV-01), none blocking. Verifier ran unit Author 317 pass, eslint, `tsc --noEmit` (no typegen); integration and e2e not run by the verifier (the orchestrator ran them at Implement: 526 and 8 pass). It did not read handoffs, so the T-21 REV-06 binding was checked by the orchestrator: publication does not trust the preview `draftVersion`; `persist_author_publication` `complete` rechecks both versions and rebuilds the candidate from stored proposals under the challenge-row lock. One decision raised (REV-03, see Open questions). | unavailable (verifier 133,525 subagent tokens, from the task notification) |
| Tests (SEC-REV-01, G3) | main (Claude Code) / default, sdd-test | done | 2026-11-11: one new `it` in `tests/integration/author/publication.test.ts`, `SYS-12.1 TAs keep direct read access to a published revision's answers, flaws and hints`; passes against current code (regression guard, no mutation check). G3: human committed 5a3eaac `test(author)` (that file only, `Agent: Claude` trailer); SHA-256 32c6d61e…41fe56d4fb37 matches. | unavailable |
| Implement (fix round 1) | main (Claude Code) / default, sdd-implement | done | 2026-11-11: tests unchanged since 5a3eaac. REV-01: migration checks hint element types in a separate statement before `item - hint_fields`; `check_violation`/`not_null_violation` on the `revision_flaws` insert raise `NOT_PUBLISHABLE`, on the `flaw_hints` insert `INVALID_AI_OUTPUT`. REV-02: `complete` requires the ledger `request_fingerprint` to equal `[expectedRowVersion,expectedDraftVersion]` built from `p_input` (else `VALIDATION_ERROR`); `publication.ts` now passes the admitted `body` versions to `complete` (already proven equal to the reloaded draft). `db:reset` + `db:types`. Checks: integration Author 4 files 168 pass; unit Author 317 pass; lint and typecheck clean. No supplementary tests for REV-01/02 (the paths need a tampered call after a completed operation). | unavailable |
| Review (round 2) | ONE fresh verifier subagent (sdd-review + sdd-security-review) | done | 2026-11-11: tree digest `69b6d94454004ad0` before and after (match). `completed`. REV-01, REV-02 and SEC-REV-01 resolved; REV-03 waived by the human decision; no new findings. Verifier ran unit Author 317 pass, eslint, `tsc --noEmit`; integration and e2e not run by it (the orchestrator ran integration Author 168 pass after the fix). Non-finding note: the first hint check still ORs a non-array `hints` with `jsonb_array_elements`; unreachable because the server sends Zod-validated arrays. | unavailable (verifier 67,866 subagent tokens, from the task notification) |
| Docs | main (Claude Code) / default, sdd-docs | done | 2026-11-11: only `docs/DeveloperGuide.md` changed in the stage. New `### Author publication` with `#### Author publication contracts` and `#### Author publication checks` after `#### Author proposal checks`; the proposals section's stale “Publishing is not part of this screen yet.” now links to it. Quoted strings checked against `publicationMessages` in `src/lib/author/publication.ts` and `publish-challenge.tsx`, `publication-result.tsx`, `author-routes.tsx`; status codes against `responses.ts`, the publish Route Handler (201) and `readAuthorRevision` (403/404); database claims against the migration. Links outside `docs/` use full upstream blob/master URLs; no Jekyll-sensitive sequences added. REV-03 human decision documented. No checks rerun (docs only). | unavailable |
| Close-out / G4 | main (Claude Code) / default | done (G4 pending) | 2026-11-11: T-22 `Status: done` in `workflow/PLAN.md`; handoff `done`. `bun run verify` and full `bun run test:e2e` not run by the agent; they are G4 human checks and remain unverified. Orchestrator session total: unavailable (no readable rollout for Claude Code). | unavailable |

## Decisions

| Date | Who decided | Decision and one-line reason |
| --- | --- | --- |
| 2026-11-10 | Human | Author work is T-20–T-23 (#81–#84), all high route and chained. |
| 2026-11-10 | Human | Agents may run `gh issue create` and Docker commands. Commit, push, rebase and PR creation stay with the human. |
| 2026-11-11 | Human | The agent checks gate commits itself with `git log`/`git show`. |
| 2026-11-11 | Human | Generator–verifier workflow: the main session runs Plan, Tests, Implement, fixes and Docs with the stage skills; each review uses ONE fresh verifier subagent applying sdd-review and sdd-security-review. |
| 2026-11-11 | Human (G1) | Committed the plan unchanged, accepting: “Publication result” at `/author/challenges/[id]/publication` and the revision view at `/author/challenges/[id]/revisions/[revisionId]`; a successful publication increments rowVersion only; the draft and its decided set stay in place after publication. |
| 2026-11-11 | Human (G3, T-22 review) | REV-03: allow republishing an unchanged candidate for now (a new identical revision); list it under the PR's “Decisions made”. Fix REV-01, REV-02 and SEC-REV-01 in this feature. |
| 2026-11-11 | Human (T-21) | Binding for T-22: T-21's `GET .../preview` and `src/lib/author/preview.ts` diff derivation are reused; T-22 must not trust the preview `draftVersion` alone (REV-06). |

## Interfaces defined by tests

- Route Handlers: `src/app/api/v1/author/challenges/[id]/publish/route.ts` (`POST`; 200 or 201 with
  `AuthorPublication`) and `.../[id]/revisions/[revisionId]/route.ts` (`GET`;
  `{ publication, challenge, answerKey, hints }`). An ineligible candidate is 409 `INVALID_STATE` with
  the AUT-05.1 message.
- `src/components/author/client.ts`: `publishChallenge(id, versions, key, accountId?)` and
  `readRevision(id, revisionId)`. Publication statuses: `ok`, `ineligible` (409 with the AUT-05.1
  message), `invalid_output`, `timeout`, `failed` (502), `limited`, `too_large`, `conflict`
  (`VERSION_CONFLICT` or the archived message), `uncertain` (in-progress or lost reply), plus access
  failures. Revision read: `ok`, `forbidden`, `not_found`, `unavailable`.
- `src/components/author/publish-challenge.tsx`:
  `PublishChallenge({ draft, flaws, publish, onPublished, reload })`. Buttons “Publish challenge”,
  “Check publication”, “Try publishing again”, “Reload draft”; link “Back to proposal preview”.
- `src/components/author/publication-result.tsx`: `PublicationResult({ publication })` with h1
  “Publication result” (focused), a `<time dateTime={publishedAt}>`, “View published challenge” and
  “Back to challenges”.
- `src/components/author/published-revision.tsx`: `PublishedRevision({ revision })`.
- `ProposalPreview` gains optional `publish` and `onPublished` props; “Publish challenge” shows only
  with the shown final preview.
- Pages `/author/challenges/[id]/publication` and `/author/challenges/[id]/revisions/[revisionId]`.
  Denial shows “This challenge isn't available to your account.”
- Database: each admin function the publication path calls (other than `llm_accounting`) is
  `SECURITY DEFINER` with `search_path=""`, executable only by `service_role`, and receives the
  validated hints as an array of objects with a `text` field; it raises `INVALID_AI_OUTPUT` for a
  missing, extra, over-length or blank hint. Ledger `private.author_publication_requests` (RLS on, no
  grants, an `actor_id` column so the fixture cleanup finds it). Users cannot write revision tables or
  the published pointer directly. A successful publication increments rowVersion only.

## Findings

| ID | P | Location | Criterion | Finding and fix direction | Blocking |
| --- | --- | --- | --- | --- | --- |
| REV-01 | P3 | migration `persist_author_publication` hint structure check (~:195-203, 242-247), flaw insert (~:256) | SEC-02.1, AUT-05.4 | `OR` evaluation order is not guaranteed, so a non-object hint item can raise “cannot delete from scalar” before the type check; a `check_revision_flaw` violation is uncaught. Both become 503 `SERVICE_UNAVAILABLE` instead of `INVALID_AI_OUTPUT`/`NOT_PUBLISHABLE`. Defence in depth only (input is server-validated). Fix: check element types in a separate `EXISTS`/`CASE` first; catch `check_violation` on the inserts. | No |
| REV-02 | P3 | migration `complete` (~:174-179) | SYS-10.3 | `complete` checks the `p_input` versions but does not bind them to the ledger `request_fingerprint`. Not exploitable (server passes matching values). Fix: require the versions to equal the claimed fingerprint. | No |
| REV-03 | P3 | `proposal-preview.tsx` publish action; migration eligibility | AUT-05.7 | After publication the draft stays in place, so “Publish challenge” stays available and a new key republishes an unchanged candidate as an identical new revision, spending AI quota. Human decided at G3: allowed for now; record in the PR. | No (decided) |
| SEC-REV-01 | P3 | `tests/integration/author/publication.test.ts:867` | SYS-12.1 | The replaced read policies keep the TA branch, but no test asserts TA reads of answers, flaws and hints. Fix: a human-approved test change adding `taA` expecting 1 row. | No |

## Open questions

Test choices the specs do not settle (for G2; say if any should change):

1. A timeout shows “Check publication” first; once the check confirms the failure, “Try publishing
   again” appears. Other confirmed failures (invalid hints, unavailable) offer “Try publishing again”
   at once; the limit and too-large failures leave it unasserted.
2. SEC-03's semantic checks (overlap, line references, markup, links) are tested through the server
   boundary. The database function is tested only for structural tampering (missing, extra,
   over-length or blank hints), because repeating the Unicode overlap rule in SQL would duplicate
   `src/server/llm/safety.ts`.
3. The uncertain state has no specified message, so only “Check publication” is asserted.

Review decision: answered at G3 (see Decisions).

## Next action

G4 (human): run `bun run verify` and `bun run test:e2e`; commit `feat(author)` (implementation plus
this handoff and the PLAN status), then `docs(author)` (Developer Guide), write the session log and
commit `chore(logs)`, push to `origin` and open the PR to `upstream` `master`. List under “Decisions
made”: REV-03 republishing allowed; owner-only Author read policies on revision answers, flaws and
hints; `publicationMessages.uncertain` wording. Never commit `.claude/settings.json`.

Points the reviewer or human should know (not yet decided by a human):

- The migration replaces `read_revision_answers`, `read_revision_flaws` and `read_flaw_hints`. The old
  policies let any Author read another Author's private answers for a live revision; the committed
  test `SYS-12.1 other Authors, Learners and anonymous callers cannot read…` requires owner-only.
  TA access is unchanged.
- `publicationMessages.uncertain` (“We couldn't confirm publication.”) is not spec text; AUT-05.5
  names only the “Check publication” action.
- “Try publishing again” is also offered after the limit failure; the tests leave that open.
- The ledger failure code `NOT_PUBLISHABLE` is internal; it maps to 409 `INVALID_STATE` with the
  AUT-05.1 message.

Uncommitted on the branch: all implementation files above and this handoff. They go in the
`feat(author)` commit at G4. Never commit `.claude/settings.json`.
