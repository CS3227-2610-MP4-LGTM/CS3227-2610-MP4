# Implementation plan

Derive tasks from approved [spec conventions](specs/README.md),
[PRODUCT-SPEC](specs/PRODUCT-SPEC.md), [TECHNICAL-SPEC](specs/TECHNICAL-SPEC.md),
[INTEGRATION-SPEC](specs/INTEGRATION-SPEC.md) and
[AI-SECURITY-SPEC](specs/AI-SECURITY-SPEC.md). Story paths belong in each task's
Reads. This header allocates no tasks.

## Capacity

At most 16 tasks total: Foundations at most 4; Learner, Author and TA at most
4 each. A task covers at most 3 stories of one role, or one foundation area,
and fits one implementer run. One task is one issue, one PR and one loop run.
Done tasks still count. If a feature exceeds capacity, the planner stops and
reports instead of adding tasks. It never creates issues; it lists issues
the human should create.

## Task format

Use permanent, unused `T-nn` IDs under the groups below. Status words:
`todo`, `in-progress`, `blocked`, `done`. Reads names exact spec headings and
story paths; list implementation config paths in the task when needed.

Reserve IDs by group so parallel feature PRs do not collide: Foundations
`T-01`–`T-09`, Learner `T-10`–`T-19`, Author `T-20`–`T-29`, TA `T-30`–`T-39`.
Capacity is counted in tasks, including done tasks, not reserved ID slots;
the limits above remain unchanged.

```markdown
### T-nn: <title>
- **Issue:** #nn
- **Covers:** <requirement and criterion IDs>
- **Route:** low | standard | high
- **Reads:** <spec sections by heading; story files>
- **Tests:** unit | integration | e2e
- **Config paths:** <implementation configuration files allowed to change, or none>
- **Constraints:** <task-specific limits for later stages, or none>
- **Depends on:** T-nn | none
- **Status:** todo | in-progress | blocked | done
```

## Foundations

### T-01: Auth core

- **Issue:** #12
- **Covers:** SYS-05, SYS-06, SYS-07.1 (server reads), SYS-07.2, SYS-08.1,
  SYS-10.1–10.2 with SYS-10.4's provisioning hook, SYS-11 failure categories
  (page presentation is T-02), SYS-12's accounts and profiles rule with
  SYS-12.1–12.2 scoped to that rule, SYS-15.2–15.4, SYS-19.1 and SYS-19.3's
  integration suite.
- **Route:** high
- **Reads:** `workflow/specs/PRODUCT-SPEC.md` §3 Story index → Shared accounts;
  `workflow/specs/TECHNICAL-SPEC.md` SYS-01 — Runtime and server/client boundary,
  SYS-02 — Untrusted input and submitted code, SYS-05 — Credentials and session
  lifecycle, SYS-06 — Profile provisioning and immutable role, SYS-07 — SSR
  cookies and proxy refresh (SYS-07.1–07.2), SYS-08 — Authorization at the data
  boundary (SYS-08.1), SYS-10 — Database enforcement and privileged access
  (SYS-10.1–10.2 and SYS-10.4's provisioning hook), SYS-11 — Authentication and
  authorization failures, SYS-12 — Record access and audit (accounts/profiles
  rule and SYS-12.1–12.2), SYS-15 — Configuration and hosted Auth
  (SYS-15.2–15.4), SYS-16 — Security baseline, SYS-19 — Test strategy
  (SYS-19.1 and integration portion of SYS-19.3);
  `workflow/specs/INTEGRATION-SPEC.md` §1 Scope and contract conventions and
  §2 Domain model and publication lifecycle (`profiles` row only);
  `workflow/specs/stories/ACC-01-sign-up-with-a-role.md` and
  `workflow/specs/stories/ACC-02-sign-in-and-sign-out.md` for required server
  outcomes, with no page implementation.
- **Tests:** unit (`tests/unit/auth/`); integration (`tests/integration/auth/`).
  Cover real local Auth, atomic provisioning/rollback, immutable roles, refresh
  transport/cache headers, verified identity, failure categories, profile
  grants/RLS and email exclusion; use two users per role and an anonymous
  caller for account/profile access checks. Hosted SYS-15.2–15.4 settings need
  human dashboard review evidence; local config does not verify hosted settings.
- **Config paths:** `package.json`, `bun.lock`, `vitest.config.mts`,
  `vitest.integration.config.mts` (new), `supabase/config.toml`,
  `.github/workflows/ci.yml`.
- **Constraints:** No pages or UI copy. `bun run test` stays usable without
  Supabase; integration tests get a separate `test:integration` script using
  Vitest's Node environment and a CI job against local Supabase Auth that the
  `verify` job needs. SYS-10.1 schema checks run in Vitest with `pg` as a
  devDependency against the local database; no pgTAP. The provisioning trigger
  is the only privileged auth path; application auth never uses the admin
  client, while tests may create fixtures through the local admin API. Reuse
  fixtures and budget sign-ups/sign-ins below the local Auth limit of 30 per
  five minutes per IP; test throttling by injected errors. Server results
  distinguish field errors, rejection, throttling, service unavailability,
  account created without a usable session and sign-out provider failure for
  ACC-01/ACC-02; T-02 supplies presentation and client-side unknown outcomes.
  The orchestrator runs every database-backed check; subagents report such
  checks as not run, never passed or failed.
- **Depends on:** none
- **Status:** done

### T-02: Account pages and role navigation

- **Issue:** #39
- **Covers:** ACC-01–ACC-03, SYS-07.1 (browser delivery), SYS-07.3, SYS-09,
  SYS-19.2 and SYS-19.3's e2e suite.
- **Route:** high
- **Reads:** `workflow/specs/PRODUCT-SPEC.md` §3 Story index → Shared accounts
  and §5 Navigation and UI; `workflow/specs/TECHNICAL-SPEC.md` SYS-04 — Shared
  building blocks, SYS-05 — Credentials and session lifecycle, SYS-06 — Profile
  provisioning and immutable role, SYS-07 — SSR cookies and proxy refresh,
  SYS-08 — Authorization at the data boundary, SYS-09 — Authentication with
  Cache Components, SYS-10 — Database enforcement and privileged access,
  SYS-11 — Authentication and authorization failures, SYS-12 — Record access
  and audit (accounts/profiles rule), SYS-16 — Security baseline,
  SYS-17 — Simple, accessible UI, SYS-19 — Test strategy (SYS-19.2 and e2e
  portion of SYS-19.3); `workflow/specs/INTEGRATION-SPEC.md` §1 Scope and
  contract conventions; `workflow/specs/stories/ACC-01-sign-up-with-a-role.md`,
  `workflow/specs/stories/ACC-02-sign-in-and-sign-out.md` and
  `workflow/specs/stories/ACC-03-role-based-landing-and-navigation.md`.
- **Tests:** unit (`tests/unit/account/`); e2e (`tests/e2e/account/`). Cover
  all-role account journeys, field/pending/failure states, role navigation and
  empty landings, direct protected access and recovery, cookie attributes,
  refresh/deletion and account transitions through back, prefetch and reload
  against a Cache Components production build and local Supabase Auth.
- **Config paths:** `package.json`, `bun.lock`, `playwright.config.ts`,
  `next.config.ts`, `.github/workflows/ci.yml`.
- **Constraints:** Consume T-01's auth results and stored-role authorization;
  add the account pages, shared navigation, role landings/empty states and
  denial/profile/service recovery screens defined by ACC-01–ACC-03. Detailed
  role-story list contents and downstream interactions belong to later tasks.
  Add a local-Auth production-build e2e CI job required by `verify`, preserving
  T-01's integration job. Keep fixtures within the local Auth rate limit and
  inject throttling failures. The orchestrator runs every database-backed
  check; subagents report such checks as not run, never passed or failed.
- **Depends on:** T-01
- **Status:** done

### T-03: Domain schema

- **Issue:** #37
- **Covers:** INTEGRATION-SPEC §1 persisted bounds, §2 domain records and
  schema invariants (excluding `profiles` and `ai_usage_records`), and §5
  Flags source/shape and uniqueness. SYS-10.1 on every new application table
  in both schemas, SYS-10.2 for stored-role RLS and restricted reads, and
  SYS-10.4 for denial of privileged use on this schema. SYS-12.1 covers read
  rules and write denial through direct database access for these records.
  SYS-12.3 covers database denial of forged audit writes, nonblank reasons,
  and preservation and uniqueness of audit entries. SYS-12.4 covers direct
  submission write denial and schema preservation of pinned code, answer
  keys, original grades and Learner history reads across edits, unpublishing
  and archiving. SYS-12.5 covers denial of direct Learner hint-cache access,
  forged flags/resolutions and non-TA summary access. SEC-01.1 covers only
  direct database protection of private records and server-generated writes.
- **Route:** high
- **Reads:** `workflow/specs/INTEGRATION-SPEC.md` §1 Scope and contract
  conventions, §2 Domain model and publication lifecycle (including SYS-12
  decision: immutable published revisions and Code, proposals and locations),
  §3 Shared response types, §5 Matching and score, and §5 Flags;
  `workflow/specs/TECHNICAL-SPEC.md` §1 Purpose, boundaries and assumptions
  (ASM-01), SYS-10 — Database enforcement and privileged access,
  and SYS-12 — Record access and audit; `workflow/specs/AI-SECURITY-SPEC.md`
  SEC-01 — Authorize and minimize model access (SEC-01.1).
- **Tests:** integration against local Supabase (`tests/integration/domain/`,
  with `tests/integration/auth/` as a regression check). Drive one access
  matrix over one fixture with two accounts per role and an anonymous caller.
  Create distinct domain accounts through the local Auth admin API using
  T-01's harness and seed domain rows with `pg` in a rollback transaction.
  Exercise real restricted database roles and user claims for scoped reads
  and denied writes, including forged generated rows. Test catalog grants and
  RLS in both schemas, default table/function/sequence privileges, and zero
  table access for `service_role`. Use rolled-back constraint probes to test
  wrong-role owners, cross-record IDs, bounds, uniqueness and immutable or
  append-only rows. Roll back domain rows before deleting fixture accounts.
  Keep assertions scoped to fixture IDs and preserve the T-01 Auth cascade.
  The orchestrator runs all database-backed checks with per-command
  escalation. Subagents report those checks as unrun.
- **Config paths:** `vitest.integration.config.mts` (include the domain suite
  and preserve serial execution), `package.json` (only if needed to include
  new private relations in local type generation).
- **Constraints:** Use a new migration and regenerate
  `src/lib/supabase/database.types.ts` from local Supabase. Represent every
  stored ID relationship with a foreign key, including proposal identity and
  same-parent references. Bind each ownership/actor reference to its required
  stored role. Use non-cascading account-to-domain references and keep
  immutability triggers on domain rows so the existing Auth/profile cascade
  still works for accounts without domain rows. Keep revision answers and
  flaws physically separate from learner-readable revisions. Store only
  grade fields that `LearnerGrade` may expose in the Learner-readable grade
  record. Store matching and per-flaw assessments in a separate table linked
  by a foreign key and readable only by TAs.
  Enforce `auditOrder` uniqueness across overrides and resolutions in each
  submission's stream. Use explicit
  grants only. Read role checks from `private.profile_roles`, apply explicit
  RLS and revokes to new `private` tables, and revoke default function and
  sequence privileges. Give `anon` and `service_role` no access to any new
  table. Give `authenticated` only permitted reads. Add no write grants or
  policies for these roles, no server entry points, and no pages. Proposals,
  hints and summaries fail closed for writes. A team spec PR settles their
  server-generation provenance before T-04.
  The remaining portions of the Covers criteria, entry points, response
  projections, write paths and their SYS-10.3 uses belong to the role tasks
  that own those entry points; T-04 (#38) owns usage records and the SYS-12.5
  usage-reset denial.
- **Depends on:** T-01
- **Status:** done

### T-04: Shared LLM provider and usage accounting

- **Issue:** #38
- **Covers:** SYS-01.1 and SYS-02.1–02.2 at the shared LLM boundary;
  SYS-03.1–03.3; SYS-10.1–10.4 and SYS-12.1 for AI usage accounting only;
  SYS-12.5's denial of usage resets; SYS-13.1 and SYS-13.3, SYS-15.1,
  SYS-16.1, SYS-18.1–18.2 and SYS-19.1/19.3–19.4 for this foundation.
  INTEGRATION-SPEC §4's four input/output contracts and snapshot validation,
  with §1 bounds and §2 proposal-location semantics. SEC-01.1–01.2's shared
  authorization gate, request minimization and instruction/data separation;
  SEC-02.1 and SEC-02.2's captured-snapshot checks; SEC-03.1's shared hint and
  feedback checks; SEC-04.1–04.2, SEC-05.1–05.3 and SEC-06.1 for provider
  execution and durable accounting. Role-entry-point authorization, generated
  result persistence, grade uniqueness/flags, browser rendering and cached
  hint reads complete the corresponding criteria in later role tasks.
- **Route:** high
- **Reads:** `workflow/specs/PRODUCT-SPEC.md` §3 Story index and §4 Product
  decisions → Flaw proposals and answer keys, Hints and attempts, Grading,
  Moderation flags, Challenge input and Shared vocabularies;
  `workflow/specs/TECHNICAL-SPEC.md` SYS-01 — Runtime and server/client boundary,
  SYS-02 — Untrusted input and submitted code, SYS-03 — LLM boundary,
  SYS-10 — Database enforcement and privileged access (including the current
  SYS-10.3 named-use register), SYS-12 — Record access and audit (AI usage
  records and the generated-material rules defining the boundary's callers),
  SYS-13 — Environment isolation, SYS-15 — Configuration and hosted Auth
  (LLM configuration rows and SYS-15.1 only), SYS-16 — Security baseline,
  SYS-18 — Resource use, SYS-19 — Test strategy;
  `workflow/specs/AI-SECURITY-SPEC.md` SEC-01 — Authorize and minimize model
  access, SEC-02 — Validate model output before use, SEC-03 — Protect
  learner-facing hints and feedback, SEC-04 — Bound SoC requests and usage,
  SEC-05 — Reserve and settle usage atomically, SEC-06 — Contain failures and
  keep diagnostics safe; `workflow/specs/INTEGRATION-SPEC.md` §1 Scope and
  contract conventions (including Shared values and bounds and Pasted-code
  cap), §2 Domain model and publication lifecycle (`ai_usage_records`, the
  SYS-10.3 provenance reference, captured draft/revision invariants and Code,
  proposals and locations), §3 API contracts → Transport, concurrency and
  errors and Shared response types (`LearnerGrade` feedback rule only),
  §4 Server-only LLM contracts (all four operations), and §5 Category progress
  and recommendations (`CategoryProgress` shape only). No story implementation.
- **Tests:** unit (`tests/unit/server/llm/`); integration
  (`tests/integration/llm/`), with existing auth/domain integration regressions.
  Unit tests cover strict envelopes, unknown fields, all four exact input
  projections, output cardinality/identity/evidence/range checks, assembled
  candidate bounds, malicious text retained as data, server-owned instructions
  and capabilities, and rejection of redirects. Exercise deterministic fake
  success, malformed output and failures; full Unicode NFKC/case-fold overlap
  checks across every retained flaw; markup/link/line-reference rejection;
  permitted short protected values and harmless emphasis. Test each payload,
  token, byte, deadline and attempt boundary at and one beyond the limit,
  including multibyte text, conservative full-request measurement, lower
  effective ceilings, bounded response consumption and fake-clock UTC rollover.
  Assert safe errors/logs/traces with sentinel secrets and private text,
  client-import rejection, and no live/non-loopback dispatch in local/test/CI.
  Integration tests drive the shared boundary with persisted authorized fixture
  snapshots, two users per role and an anonymous caller; denied role, owner,
  ID and state cases create neither reservations nor provider attempts. Verify
  own-only usage/budget reads, direct client write/reset/spoof denial, RLS,
  explicit grants, admin-only accounting functions and no admin table access.
  Use independent committed database connections to race different keys at the
  last account/environment slot, attempt or token unit and duplicate keys at
  admission/settlement; assert only admitted fake attempts dispatch. Exercise
  mixed operations/accounts, persisted state across boundary instances, window
  rollover with active slots, before/after-dispatch and settlement failures,
  full uncertain charges, proven-unused release, once-only settlement, expiry
  and late-result rejection. Cover invalid-output retry success/failure,
  denied retry reservation, transport failure/timeout without retry, replay
  without dispatch and accounting unavailability failing closed. Use synthetic
  payloads, injected clocks and the fake provider; no live network calls.
- **Config paths:** `src/server/llm/config.ts` (new), `vitest.config.mts`,
  `vitest.integration.config.mts` (include the LLM suite and preserve serial
  execution), `.github/workflows/ci.yml` (explicit fake/local settings only).
  `package.json` and `bun.lock` only if a justified dependency is necessary;
  retain existing scripts and CI suites. Never read or edit `.env*`.
- **Constraints:** One foundation area and one implementer run: implement the
  server-only provider interface, deterministic fake adapter, all four strict
  contracts, shared prompt/input/output safety checks and durable accounting
  together in `src/server/llm/`. Reuse T-01's verified identity/stored-role
  foundation and T-03's persisted records. Require server-verified operation
  authorization and a captured resource snapshot before request construction
  or reservation; never accept caller-owned actors, accounting fields or model
  instructions. Keep all retained flaws available to the safety validator even
  when only matched comments are sent to assessment. A no-match assessment
  invokes no provider and consumes no quota. Return validated results and retry
  metadata for role callers; matching, scoring and grade/retry-flag persistence
  stay with the grading task. Role tasks also own resource entry points,
  idempotent domain mutations, proposal/publication/summary persistence,
  browser rendering and SEC-03.2 cached-hint reads.
  Add a new migration for usage records, durable reservations/events and
  dedicated atomic accounting functions under SYS-10.3; regenerate
  `src/lib/supabase/database.types.ts` from local Supabase. Admin access is
  function-only, with no direct table/column grants; expose only permitted
  own-account usage fields. Atomically reserve both scopes before every attempt,
  retain reservation-time UTC windows, use the 35-second operation expiry and
  enforce all SEC-04 ceilings. Only invalid output permits one automatic retry
  against the same snapshot and deadline; uncertain dispatch/usage charges the
  maximum reservation. No database transaction spans a provider call. Use real
  committed local transactions for races; rollback-only probes cannot establish
  cross-connection accounting correctness. Clean up fixture-owned records.
  The approved provenance register supersedes T-03's historical deferral, but
  adds no role persistence functions here. Live use remains fail closed until
  an approved SoC destination/model, measurement, allocation and enforceable
  limits exist; do not invent configuration names or enable live calls.
  Validate settings on use without values in diagnostics. Read the relevant
  `node_modules/next/dist/docs/` guide before any Next.js code. The orchestrator
  runs every database-backed check; specialists report those checks as unrun.
- **Depends on:** T-01, T-03
- **Status:** done

## Learner

### T-10: Browse challenges and view a challenge as a PR

- **Issue:** #49
- **Covers:** LRN-01.1–01.7, LRN-02.1–02.2 and LRN-02.5–02.7.
  LRN-02.3 for inert rendering and LRN-02.4 for opening a read-only workspace
  without creating an attempt and retaining the opened revision. SYS-02.1–02.2,
  SYS-04.1–04.2, SYS-08.1–08.3, SYS-09, SYS-10.1–10.2, SYS-10.4, SYS-11 and
  SYS-12.1 apply to the new Learner reads and rendering where relevant.
  SYS-17.1 and SYS-17.3 apply to Learner UI keyboard access, focus, labels and
  phone-width layout.
- **Route:** high
- **Reads:** `workflow/specs/PRODUCT-SPEC.md` §3 Story index → Learner,
  §4 Product decisions → Challenge input and Shared vocabularies, and
  §5 Navigation and UI. `workflow/specs/TECHNICAL-SPEC.md` SYS-02 — Untrusted
  input and submitted code, SYS-04 — Shared building blocks, SYS-08 —
  Authorization at the data boundary, SYS-09 — Authentication with Cache
  Components, SYS-10 — Database enforcement and privileged access, SYS-11 —
  Authentication and authorization failures, SYS-12 — Record access and audit
  (Learner-facing challenge material, private answers and submissions),
  SYS-17 — Simple, accessible UI and SYS-19 — Test strategy.
  `workflow/specs/INTEGRATION-SPEC.md` §1 Scope and contract conventions
  (including Shared values and bounds and Pasted-code cap for display and line
  conventions), §2 Domain model and publication lifecycle → SYS-12 decision:
  immutable published revisions and Code, proposals and locations, §3 API
  contracts → Transport, concurrency and errors, Shared response types and
  Learner surface, §6 Shared deterministic seed fixtures (C1: Checkout totals,
  C2: Safe quotient, Submissions and expected outcomes and Derived fixture
  scenarios for relevant reads), and §7 Integration verification (live Learner
  projection and access checks).
  `workflow/specs/stories/LRN-01-browse-challenges.md`,
  `workflow/specs/stories/LRN-02-view-a-challenge-as-a-pr.md` and
  `workflow/specs/stories/ACC-03-role-based-landing-and-navigation.md`
  (existing workspace, access recovery and unfiltered empty state).
- **Tests:** unit (`tests/unit/learner/`) for strict query and cursor validation,
  exact new-file projection with and without trailing LF, and inert rendering.
  Use jsdom component tests there, following `tests/unit/account/`, for loading,
  superseded responses, disabled pagination while pending, empty/invalid/error
  states and retry, focus moves, announcements and retention of the open
  workspace's loaded revision after a live pointer change.
  Local Supabase integration (`tests/integration/domain/learner-browse.test.ts`)
  for the protected list/detail and first-attempt reads, bounded AND filtering
  and tie-safe cursor order. Use published C1/C2 and derived fixtures with two
  users per relevant role and an anonymous caller. Call both Route Handlers for
  anonymous (401), wrong-role (403) and invalid-query (400) requests. For missing
  and unpublished/archived challenges, assert 404 and 403 respectively on detail
  and omission from the catalogue. After the live pointer changes, assert detail
  returns the live revision ID with its matching source. Exercise server entry
  points and direct user-scoped database calls, including wrong role,
  cross-account attempt isolation, old revisions, forbidden versus absent
  challenges without owned submissions, and private table, column and join
  denial. Cover own first attempts across revisions, pending or failed grading,
  and a second attempt's presence. E2e (`tests/e2e/learner/`) uses the production
  build for filtered URL restoration with pagination and back/forward,
  forbidden versus missing detail, the first-attempt link, and keyboard
  navigation and source access at 320 CSS pixels without page-level horizontal
  scrolling. The orchestrator runs all database-backed checks with per-command
  escalation. Specialists report them as unrun.
- **Config paths:** none.
- **Constraints:** Extend T-02's Learner pages and reuse its navigation and
  access recovery. Add the `GET /api/v1/challenges` and
  `GET /api/v1/challenges/:id` Route Handlers per INTEGRATION-SPEC §3
  (“Transport, concurrency and errors” and “Learner surface”). The handlers and
  pages share one validated server read contract.
  Verify session and stored Learner role at every protected entry point and
  prevent cross-request caching. Use T-03's user-scoped RLS for permitted data.
  Add a migration and regenerate `src/lib/supabase/database.types.ts` for a
  narrow Learner-scoped database read boundary. Project the sorted, unique
  approved category values for the live revision and filter by category before
  pagination. Limit the access check to the decision needed for 403 versus 404.
  Enforce stored-role and live-pointer rules at this database boundary and test
  explicit execution grants. Keep private flaw, answer and hint tables behind
  existing policies. Use the signed-in Learner's client for application reads.
  Look up attempt one by the verified Learner and challenge across revisions,
  regardless of grading state, with failure distinct from an absent attempt.
  A detail retry repeats both the live revision and first-attempt reads.
  Keep the loaded live revision ID and source together for the open workspace.
  Fresh reads use the live pointer and do not fall back to historical code.
  Build the shared SYS-04 renderer around the authorized `CodeDiff` DTO so
  Author and TA can reuse it with their own real-diff projections. This task
  delivers the Learner new-file projection only. LRN-03 and LRN-04 own comment
  and submission controls and stale submission handling. History and retry
  remain with their owning stories. Read the relevant `node_modules/next/dist/docs/`
  guide before writing Next.js code.
- **Depends on:** T-02, T-03
- **Status:** done

## Author

## TA
