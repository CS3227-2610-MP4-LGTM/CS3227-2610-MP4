# #12 — auth-core

- **Route:** high
- **PLAN task(s):** T-01 (this loop); T-02 is the dependent #39 loop
- **Branch:** feat/12-auth-core
- **Base commit:** 74377f71218dde87d6b8afd315b79ca5cc56485c (`upstream/master`)
- **Status:** done

## Goal

Deliver the auth core without pages: SYS-05, SYS-06, SYS-07.1 (server reads), SYS-07.2,
SYS-08.1, SYS-10.1–10.2 with SYS-10.4's provisioning hook, SYS-11 failure
categories, SYS-12's accounts/profiles rule with SYS-12.1–12.2,
SYS-15.2–15.4, SYS-19.1 and SYS-19.3's integration suite.

## Stages

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | main | done | Issue/base/criteria/dependency checks and escalated LGTM doctor/Auth health passed; see below. | unavailable |
| Plan / G1 | planner / high | done | Human approved with edits; verified HEAD `b05e7ee48b6ae19c28c06aede830f60f2179f6d2`, parent is the recorded base; PLAN-only commit with Agent trailer. Scope/config/capacity checked (2/4 Foundations, 2/16 total). | 538754 |
| Tests / G2 | test-writer / medium | done | Human approved commit `7b9211e8ab101619a286d9d3dddb9a03ab205f34` verified at HEAD, parent G1. Committed tests/configs match working files; baseline hashes below. Added tab/newline-only metadata case loads and fails as expected before implementation. | 3433783 |
| Implement | implementer / medium | done | Main: 62 targeted unit tests and 31 integration tests passed, lint/typecheck/schema lint passed; G2 acceptance files unchanged. Local restart/migration/types complete; see evidence below. | 3370077 |
| Review | reviewer / medium + security-reviewer / high | done | Fresh-context reviewers found no actionable findings. Whole-batch before/after digest matched; see evidence below. Fix rounds: 0. | reviewer 337606; security-reviewer 567789 |
| Docs | docs / low | done | Initial guide/README pass plus requested G4 fix limited to two guide section bodies; main checked preservation, claims, word counts and all 34 repository links/anchors. | 2344218 |
| Close-out / G4 | main | awaiting-decision | All agent stages pass; T-01 done. Human verify/e2e, CI Node 24 and hosted Auth settings remain unverified. No commits, pushes or PR operations by agents. | 17998973 |

## Ready evidence

- Clean initial tree on the requested branch; HEAD and `upstream/master` both
  resolve to the base above. No branch creation needed.
- Escalated `gh issue view 12 --repo CS3227-2610-MP4-LGTM/CS3227-2610-MP4
  --json state,title,body`: OPEN. Issue #39 is also OPEN, names ACC-01–ACC-03,
  and explicitly depends on #12; it supplies T-02's issue number.
- Heading discovery and bounded `git show 74377f7:<spec>` reads verified all
  requested SYS IDs/criteria and ACC-01–ACC-03 exist at the approved base.
  T-01 has no dependencies. T-02 depends on T-01; no implementation starts here.
- Initial sandbox doctor failed Docker/CLI/stack checks. Escalated doctor
  confirmed Docker, pinned CLI 3.0.0, config and `.env.local` existence (no
  environment file read), but the LGTM stack was stopped. Escalated
  `bun run db:start` launched with output redirected to a temporary log to
  avoid printing local keys.
- The first escalated health probe returned GoTrue v2.197.0, but container/port
  inspection identified it as the unrelated `homebrew` stack, not LGTM.
  Escalated `bunx supabase stop --project-id homebrew` completed successfully,
  preserving its data and freeing ports 54321/54322. LGTM `db:start` then
  completed with exit 0. Final escalated doctor exited 0 with every check OK;
  final escalated `curl --fail --silent --show-error
  http://127.0.0.1:54321/auth/v1/health` exited 0 and returned GoTrue v2.197.0.
  These final results are LGTM evidence; the first probe alone was not.
- Database-backed commands belong to the orchestrator in every later stage.
  Subagents must report them as **not run**, never passed or failed; they may
  lack approval support. Request escalation per blocked database command.
- After the planner returned, main ran
  `bun workflow/scripts/rollout-summary.ts --list 5` and
  `bun workflow/scripts/rollout-summary.ts --id 01a1b13e-d7c2-7e13-8892-ac65a3b86035`;
  both exited 0. The planner has its own readable rollout with thread ID
  `01a1b13e-d7c2-7e13-8892-ac65a3b86035`, distinct from main thread
  `01a1b13a-3592-7441-9de9-92b21b2b4865`. It shares main's **session ID**
  `01a1b13a-3592-7441-9de9-92b21b2b4865`; these are different identity fields.
  The explicit thread lookup returned `tokens.total_tokens: 538754`, copied
  verbatim into Plan's Tokens column without summing or estimating.
- `.node-version` requires Node 24. Human authorized installed Node v25.6.1
  for targeted session checks; CI's Node 24 remains the gate. Bun is 1.4.3.

## Task constraints

Use [T-01 in PLAN](../PLAN.md#t-01-auth-core) as the single source for task
scope, Reads, configuration paths and Constraints in every later dispatch.

## Tests evidence and G2 review

- Test-writing checkpoint was the human plan commit `b05e7ee48b6ae19c28c06aede830f60f2179f6d2`.
  Specialist changes are limited to `tests/unit/auth/`, `tests/integration/auth/`,
  `vitest.config.mts` and new `vitest.integration.config.mts`. Main executed the
  specialist's necessary dependency install after its temp-directory permission
  failure: `pg` and `@types/pg` 8.23.1 are devDependencies only, with synchronized
  `bun.lock`. No scripts, runtime dependencies, production code, migrations or
  CI were changed. Main-owned bookkeeping is T-01's PLAN Status and this handoff.
- Test-writer returned the criterion map at G2; the uncommitted
  `tests/unit/auth/acceptance-map.md` was removed at the human's request to
  avoid a stale committed map. Interfaces and integration command are preserved
  below. Expanded test titles begin with SYS criterion IDs. Browser delivery
  and unknown client outcomes stay T-02.
- Main baseline `bun run test tests/unit/lib/supabase/env.test.ts
  tests/unit/server/supabase/env.test.ts`: **2 files / 6 tests passed**.
- Main final `bun --no-env-file run test tests/unit/auth`: **49 tests,
  46 failed / 3 passed**. Expected failures: introduced `@/server/auth/service`,
  `@/server/auth/account` and `@/proxy` do not exist; `test:integration` script and
  required local-Auth CI job do not exist. The three local Auth settings checks
  pass. Unit tests use mocks/static configuration and require no Supabase.
- Main escalated `bunx --no-env-file vitest run --config vitest.integration.config.mts`:
  **30 tests, 29 failed / 1 passed**. Local Auth/pg fixture setup and cleanup
  succeeded. Expected failures show missing `public.profiles`/provisioning
  hook, accepted invalid direct-Auth metadata and missing introduced application
  interfaces. Invalid credentials are already rejected consistently and pass.
- After final mutation-denial and cookie-chunk assertion changes, main escalated
  `bunx --no-env-file vitest run --config vitest.integration.config.mts -t
  'SYS-06.4 user-scoped|SYS-07.1'`: **2 failed / 28 skipped**. Failures remain
  missing `public.profiles` and `@/proxy`; setup/cleanup succeeded. The initial
  full run used 20 sign-up/sign-in attempts (rollback signup was unreachable),
  and this focused run added six fixture sign-ins: 26 recent attempts, below 30.
  No throttling was induced. A complete implemented run budgets at most 21.
- Main `bun --no-env-file run lint`: **passed**. Main
  `bun --no-env-file run typecheck`: **failed**, only TS2307 for the three
  introduced module paths above; Next type generation succeeded. Existing-module
  API import and Vitest collection errors were corrected before G2; they are
  not counted as failing-first acceptance evidence. `git diff --check` passed.
- Node **v25.6.1**, Bun **1.4.3**, Vitest **5.0.5** used for targeted checks.
  CI's Node 24 gate, build, full verify and e2e remain **unrun/unverified**;
  hosted SYS-15.2–15.4 settings remain **human review required**.
- All database-backed checks were executed by main with escalation. Test-writer
  correctly reported them **not run**. Test fixtures use local CLI JSON captured
  in memory, reject non-loopback services, and neither read `.env*` nor print keys.
- Test-writer thread `01a1b14d-b3ca-76a1-af95-9bf48ffd31e4` has a readable
  rollout. Main ran `bun workflow/scripts/rollout-summary.ts --id
  01a1b14d-b3ca-76a1-af95-9bf48ffd31e4` after completion; its exact
  `tokens.total_tokens` is **3433783**, copied into Stages without estimation.
- G2 human commit `7b9211e8ab101619a286d9d3dddb9a03ab205f34` adds the
  tab/newline-only display name as invalid direct-Auth metadata case 6.
  Main `bunx --no-env-file vitest list --config vitest.integration.config.mts`
  exited 0. Main escalated `bunx --no-env-file vitest run --config
  vitest.integration.config.mts -t 'SYS-06.2.* 6$'` loaded 31 cases and ran
  that case: **1 expected failure / 30 skipped**, because Auth currently
  accepts the whitespace-only name (`result.error` is null). Setup/cleanup
  succeeded. Database trimming must match server validation. With this added
  case, the old complete-run budget becomes 22 attempts before any local limit
  change; the committed test's 21-attempt comment is historical and unmodified.

### Interfaces defined by tests

`src/server/auth/service.ts`:

- `signUp(input: unknown): Promise<AuthResult>` validates displayName/email/password/role;
  Supabase creation metadata uses `display_name` and `role`.
- `signIn(input: unknown): Promise<AuthResult>` validates email/password.
- `signOut(): Promise<{ status: "signed_out" | "sign_out_unconfirmed" }>` clears
  local auth cookies and calls local provider scope.
- `AuthResult` is `{status:"authenticated"|"created_without_session"|"rejected"|"throttled"|"unavailable"}`
  or `{status:"invalid",fieldErrors: Record<string,"required"|"invalid"|"too_short"|"too_long">}`.
  Tests require all applicable field errors, without UI messages/raw provider data.

`src/server/auth/account.ts`:

- `getAccount(requiredRole?: "learner" | "author" | "ta")` returns a Promise of
  `{status:"ok",account:{id,displayName,role}}` or
  `{status:"unauthenticated"|"forbidden"|"unavailable"}`.
- `readProfile(id: string)` returns a Promise of `{status:"ok",profile:{id,displayName,role}}`
  for self; TA reads of another learner return `{status:"ok",profile:{id,displayName}}`;
  denied/failed cases preserve the same failure categories. Both functions use
  verified identity and user-scoped profile access.
- `authErrorResponse(result: {status:"unauthenticated"|"forbidden"|"unavailable"}): Response`
  projects failures to 401/403/503 with `error.code`
  UNAUTHENTICATED/FORBIDDEN/SERVICE_UNAVAILABLE and no protected `data`.
  This is an HTTP projection, not a new route/page.

`src/proxy.ts`:

- `proxy(request: NextRequest): Promise<NextResponse>` refreshes transport,
  forwards cookies to downstream server reads, and preserves SSR response cache headers.
- `config` is statically analyzable and covers auth/session page/action/handler paths.

Integration run command (orchestrator only, with Docker/loopback permissions):

```sh
bun --no-env-file x vitest run --config vitest.integration.config.mts
```

### Approved G2 baseline (SHA-256)

Verified against committed files at `7b9211e8ab101619a286d9d3dddb9a03ab205f34`,
including staged/working-tree comparison. Preserve the acceptance tests through
implementation and fix rounds; only the human changed the core integration
hash from the pre-G2 review snapshot by adding the whitespace case.

| Path | SHA-256 |
| --- | --- |
| `tests/unit/auth/account.test.ts` | `906f8f5dbd133b833d0127f14bc4c92d903254e127ca7b449d5bfc676822cfad` |
| `tests/unit/auth/delivery.test.ts` | `40fece3025c8daa00d242d17c73d8cda37c9a614d084d9284c1e6d13e66f6a64` |
| `tests/unit/auth/proxy.test.ts` | `6e7c4db01bb9d82b0512a20d2b95376f40d3d1727e9d70f494b172bb3bbd830a` |
| `tests/unit/auth/service.test.ts` | `69afa162383ef12a9b45f14c3180f9100a27e5cc164ee60ce94405f459533be0` |
| `tests/integration/auth/core.test.ts` | `4d8e8ffb34ca4ee844093293bc04381cbde196ce5fa6bb0bc41b956a29139f73` |
| `tests/integration/auth/local.ts` | `01cf48024aadf22ba48a4efa0287a24c742b3180552e1a608215be22155b8b8a` |
| `vitest.config.mts` | `2d75484dc3048d0f0f17fe02998a0ea0ca81fcb343ce3c4126cca0491227584b` |
| `vitest.integration.config.mts` | `4a7733f2718126f5fa09af3bd12531b0c27fdb111fe914ec5967e683f697f327` |

## Implementation evidence

- New server-only validation, auth service and account helpers plus `src/proxy.ts`
  implement the test-defined interfaces; no pages or auth admin-client flow.
- Migration `20261106151000_auth_core.sql` adds atomic private-trigger provisioning,
  ECMAScript-equivalent display-name trimming/code-point bounds, immutable
  profiles/RLS and a private role projection constrained by `(id, role)` FK.
  It revokes default/public-table grants for anon/authenticated/service_role.
- Main restarted LGTM with local `sign_in_sign_ups = 300` (stop/start exit 0,
  data preserved), applied the new migration via local `migration up`, and
  regenerated types. All commands used escalation and only local services.
- Main `bun --no-env-file run test tests/unit/auth tests/unit/server/auth
  tests/unit/lib/supabase/env.test.ts tests/unit/server/supabase/env.test.ts`:
  **7 files, 62 tests passed**. Main escalated `bun --no-env-file run
  test:integration`: **31/31 passed**, including the human whitespace case.
- Main lint/typecheck and escalated `supabase db lint --fail-on error`:
  **passed**, no schema errors. `git diff --check` passed after regenerated
  types were normalized by `db:types` (Bash pipefail + trailing-blank stripping).
- `test:integration` runs Vitest's separate Node config. CI has a local Auth/API
  integration job required by `verify`; unit defaults still exclude integration.
- Main verified no staged/working changes to G2 acceptance tests. The only added
  tests are supplementary internal normalization/Unicode cases outside the
  committed baseline. Specialist scope matched the named src/migration/config
  paths; no specialist handoff, PLAN, spec or guide edits.
- Implementer thread `01a1b167-a12d-7f93-ae53-e78052013323` completed;
  explicit rollout lookup returned `tokens.total_tokens: 3370077`, copied verbatim.
  It reported all database-backed checks as not run by that agent.
- CI Node 24, full verify/e2e and hosted dashboard settings remain unverified.

## Review evidence

- Correctness reviewer `01a1b16d-f9fb-7d80-ba27-b9853c0340fe` and security
  reviewer `01a1b16e-4293-7fb2-8563-8bbeb5568bf4` ran with fresh context,
  no handoff reads and no writes. Both returned `Status: completed`, no
  supported findings and no blocking criterion failures. Fix rounds: **0**.
- Correctness reviewer independently passed **56 unit tests**; security review
  inspected all changed auth/data boundaries, SQL grants/RLS/provisioning,
  sanitized failures and CI wiring. AI controls are inapplicable to this core
  auth task. Both reported DB-backed checks **not run**, as required; main's
  31/31 integration evidence above covers local runtime behavior.
- SHA-256 of concatenated Git status, binary HEAD diff and all seven untracked
  non-secret file paths/lengths/bytes, before **and** after the whole batch:
  `df0fc1d907d1d24507f5a9242a2485239a68348b5104b9cfcb36c4c126e43e6f`.
  No main bookkeeping writes occurred between snapshots. Digests matched.
- Main explicit rollout lookups copied totals verbatim: correctness **337606**;
  security **567789**. Hosted settings, CI Node 24 and full verify/e2e remain
  unverified human checks, not claimed as reviewer runtime passes.

## Docs and close-out evidence

- Docs changed only `docs/DeveloperGuide.md` and `README.md`. Main compared
  guide claims with implementation/config/CI, independently checked all **31**
  repository-relative/upstream link paths and Markdown anchors, and ran
  `git diff --check`: all passed. No page or browser-journey availability is
  claimed for T-01; that work remains T-02.
- The lasting explicit-grants decision is documented in
  [Explicit grants for domain and LLM migrations](../../docs/DeveloperGuide.md#explicit-grants-for-domain-and-llm-migrations).
  Include this and the permanent task-ID ranges in the PR's **Decisions made**.
- Docs thread `01a1b171-0c3a-7922-8c84-8be0404ff03e` completed its G4 rerun;
  main's explicit rollout lookup returned cumulative
  `tokens.total_tokens: 2344218`, copied verbatim without summing runs.
- Human-requested G4 docs fix changed only the bodies of **Auth foundation**
  and **Auth tests and settings**. Main verified both headings, the entire
  Explicit grants section and every other guide byte were preserved. The fix
  removed future-task/fake-LLM claims, linked SYS-05/SYS-06 rather than restating
  validation, and documented the own-row `private.profile_roles` convention
  for RLS role checks. Main compared claims with code/config/SQL and checked
  all **34** README/guide repository links/anchors: passed, as did diff-check.
  Word counts use whitespace-delimited Markdown bodies, excluding headings:
  Auth foundation **213 → 171**; Auth tests and settings **226 → 181**
  (combined **439 → 352**). No runtime or database checks were rerun for this
  documentation-only fix; prior implementation/review evidence remains valid.
- Final main comparison against `7b9211e` verified all committed acceptance
  test/helper files remain unchanged and their hashes match the G2 baseline.
  Only supplementary internal unit tests were added. No dependencies were
  added during implementation; pg/types remain test-only G2 devDependencies.
- Main close-out rollout lookup for `01a1b13a-3592-7441-9de9-92b21b2b4865`
  returned `tokens.total_tokens: 17998973`; recorded verbatim as the available
  close-out snapshot, without estimating or summing specialist totals.
- T-01 is **done** for agent stages. G4 human checks are still **unverified**:
  `bun run verify`, `bun run test:e2e`, CI Node 24, hosted SYS-15.2–15.4 dashboard
  settings and the human commits/session log/PR. The production build was not
  run separately in this session. Local stack is running with the migrated
  schema and authorized local-only rate limit of 300; hosted limits unchanged.

## Decisions

| Date | Who decided | Decision and one-line reason |
| --- | --- | --- |
| 2026-11-06 | Human | Split auth into T-01 core (#12, no pages) and dependent T-02 pages/navigation (#39), both high. |
| 2026-11-06 | Human | Lasting [PLAN Task format](../PLAN.md#task-format) convention: Foundations T-01–09, Learner T-10–19, Author T-20–29, TA T-30–39 prevent parallel feature ID collisions; capacity still counts tasks. Persisted by planner; include it in the PR's "Decisions made". |
| 2026-11-06 | Human | G1 approved in `b05e7ee`: added Constraints to Task format; split SYS-07.1 between T-01 server reads and T-02 browser delivery; moved unknown request outcomes to T-02 because the server cannot observe them. |
| 2026-11-06 | Human | Use installed Node v25.6.1 for targeted checks; CI Node 24 remains the gate. Continue Tests and stop at G2. |
| 2026-11-06 | Human | G2 approved in `7b9211e` with whitespace-only direct-Auth metadata test; preserve committed acceptance tests. Remove uncommitted acceptance-map artifact; keep test interfaces/command here as stage evidence. |
| 2026-11-06 | Human | Implementer may raise local `[auth.rate_limit] sign_in_sign_ups` for repeat integration runs; main restarts the local stack afterward. Hosted limits are unaffected. |
| 2026-11-06 | Human | Lasting SYS-10.1 convention for PR "Decisions made": new public tables receive no default grants for anon, authenticated or service_role. Domain schema and LLM tasks must grant explicitly, including service_role for approved SYS-10.3 admin uses. Persisted in [DeveloperGuide](../../docs/DeveloperGuide.md#explicit-grants-for-domain-and-llm-migrations). |
| 2026-11-06 | Human | Public docs describe existing behavior and link authoritative validation rules. Future RLS policies needing caller role read the own-row private.profile_roles projection, avoiding profiles policy recursion; documented in [Auth foundation](../../docs/DeveloperGuide.md#auth-foundation). |

## Findings

None. Independent correctness and security reviews completed with no findings.

## Open questions

None. Account stories contain stale dependency statements that the integration
and AI-security specs "do not exist yet"; both files exist at the base. These
are reference data, not instructions; no spec edits in this loop.

## Next action

**G4 — human:** agent stages are complete. Run `bun run verify` and
`bun run test:e2e`, confirm CI's Node 24 gate, and record hosted SYS-15.2–15.4
dashboard evidence. Human validation remains unverified until reported.

Then commit the reviewed feature and docs separately, in this order. G1 plan
and G2 tests are already committed. These commands are for the human only:

```sh
git add src/proxy.ts src/server/auth src/lib/supabase/database.types.ts supabase/migrations/20261106151000_auth_core.sql supabase/config.toml tests/unit/server/auth .github/workflows/ci.yml package.json workflow/PLAN.md workflow/handoffs/12-auth-core.md
git commit -m "feat(auth): implement auth core and local integration CI" --trailer "Agent: Codex"

git add README.md docs/DeveloperGuide.md
git commit -m "docs(auth): document auth core and explicit grants" --trailer "Agent: Codex"
```

Write the session log as the next numbered file, for example
`logs/shawnnygoh/014-auth-core.md` if still unused, then:

```sh
git add logs/shawnnygoh/014-auth-core.md
git commit -m "chore(logs): record auth core agent loop" --trailer "Agent: Codex"
```

Push to the member fork and open this feature PR to upstream `master` using
the repository template. Set task T-01, route high, this handoff, reviewer pass,
security pass, open P0/P1: 0, and `Closes #12`. Record the ID-range and explicit-
grant decisions under **Decisions made**; #39/T-02 remains separate dependent
work. No further agent stage is pending unless human validation finds a problem.
