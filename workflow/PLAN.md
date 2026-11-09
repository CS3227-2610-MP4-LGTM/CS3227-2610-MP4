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

### T-11: Manage line comments and submit a first review

- **Issue:** #50
- **Covers:** LRN-03.1–03.6 and LRN-04.1–04.6 for first attempts. Preserve
  LRN-02.4–02.6's revision and workspace eligibility rules and apply ACC-03.4
  for session expiry. SYS-02.1–02.2, SYS-04.1–04.2, SYS-08.1–08.3, SYS-09,
  SYS-10.1–10.2 and SYS-10.4, SYS-11.1–11.4, SYS-12.1 and SYS-12.4,
  SYS-14.3, SYS-17 and SYS-19 apply to the new Learner write and result read.
- **Route:** high
- **Reads:** `workflow/specs/PRODUCT-SPEC.md` §3 Story index → Learner,
  §4 Product decisions → Hints and attempts, and §5 Navigation and UI.
  `workflow/specs/TECHNICAL-SPEC.md` SYS-02 — Untrusted input and submitted
  code, SYS-04 — Shared building blocks, SYS-08 — Authorization at the data
  boundary, SYS-09 — Authentication with Cache Components, SYS-10 — Database
  enforcement and privileged access, SYS-11 — Authentication and authorization
  failures, SYS-12 — Record access and audit (Learner-facing challenge material,
  private answers and submissions), SYS-14 — Delivery and database evolution
  (SYS-14.3), SYS-17 — Simple, accessible UI and SYS-19 — Test strategy.
  `workflow/specs/INTEGRATION-SPEC.md` §1 Scope and contract conventions →
  Shared values and bounds and Pasted-code cap, §2 Domain model and publication
  lifecycle (submission and comment records) → SYS-12 decision: immutable
  published revisions and Code, proposals and locations, §3 API contracts →
  Transport, concurrency and errors, Shared response types and Learner surface,
  §6 Shared deterministic seed fixtures → C1: Checkout totals, C2: Safe
  quotient, Submissions and expected outcomes and Derived fixture scenarios,
  and §7 Integration verification (submission contracts, access and projection).
  `workflow/specs/stories/LRN-03-manage-line-comments.md`,
  `workflow/specs/stories/LRN-04-submit-a-final-review.md`,
  `workflow/specs/stories/LRN-02-view-a-challenge-as-a-pr.md` (LRN-02.4–02.6),
  `workflow/specs/stories/ACC-03-role-based-landing-and-navigation.md`
  (ACC-03.2, ACC-03.4–03.7),
  `workflow/specs/stories/ACC-02-sign-in-and-sign-out.md` (ACC-02.5–02.7),
  and PR #43's Decisions made for inherited write rules.
- **Tests:** unit (`tests/unit/learner/`) for strict request and response shapes,
  UTF-8 body limits before parsing, comment normalization, text/count and line
  bounds, and account and failure mapping. Component tests cover inert text,
  line actions, editor exclusivity, ordering, validation, focus, announcements,
  empty-review confirmation and cancellation, guard activation for drafts and
  editor text, draft retention or discard on departure, expiry bypass, and
  submission states (pending, uncertain, replay, definitive failures and
  conflict). Assert frozen key/payload reuse and new keys on explicit
  resubmission after a recorded failure.
  Local Supabase integration (`tests/integration/domain/`) extends
  `tests/integration/domain/learner-browse-fixture.ts`. Exercise the POST, the
  result read and direct user-scoped database access with two accounts per
  relevant role and an anonymous caller. Check explicit function execution
  grants, account, ledger and answer isolation, direct validation of every
  bound, forged IDs/actors/fingerprints, denial of table writes and late comments,
  and owning Learner access to pinned code and ordered comments after republish,
  unpublish and archive. Check all-or-nothing writes, valid empty and same-line
  reviews, server IDs and ordinals, no grading run, stale and unavailable
  challenges, actor and resource key isolation, duplicate keys and concurrent
  distinct keys, replay of recorded success and failure after state changes,
  changed payload conflict, and serialization with lifecycle writes.
  Production-build e2e (`tests/e2e/learner/`) covers keyboard submission at phone
  width through the read-only result without a leave warning, both dialog
  choices for workspace links, role navigation links, sign-out and browser Back,
  and the native reload warning where supported. The orchestrator runs every
  database-backed check with per-command escalation. Specialists report them
  as unrun. Ask before using another project's local Supabase stack or ports.
- **Config paths:** none.
- **Constraints:** Extend T-10 (#57) in
  `src/components/learner/challenge-workspace.tsx` and `src/server/learner/`.
  Keep all draft state in page memory, including the active editor and frozen
  request. One shared guard intercepts every in-app departure with draft
  comments or unsaved editor text, including workspace links, shared role
  navigation links, sign-out and browser Back/Forward. Use LRN-03.4's “Leave
  this review?” dialog with “Keep reviewing” and “Leave review”. Reload/close
  use the native warning where supported. Successful submission and
  unrefreshable session expiry bypass the guard. Keep `CodeDiffView` generic
  so Author and TA can use their own projections without comment controls.
  Before writing Next.js code, read the installed `node_modules/next/dist/docs/`
  guides, including Link → Blocking navigation and Route Handlers.
  Add `POST /api/v1/challenges/:id/submissions` per INTEGRATION-SPEC §3 with
  a pending `SubmissionView` on 201. Any page or Server Action path reuses the
  same validated submission contract. Verify the session and stored Learner
  role on each protected entry point and prevent cross-request caching. Accept
  first attempts only and reject `previousSubmissionId` until T-13 (LRN-06).
  Add a migration and regenerate `src/lib/supabase/database.types.ts`, including
  the private schema. Inherit PR #43's restrictions on direct table grants.
  One user-scoped database call verifies the caller, serializes publication
  and live revision checks on the challenge row, and creates the submission
  and all comments together. On direct calls, the function itself enforces
  UUIDs, strict first-attempt payload and comment shapes, 0–50 comments,
  trimmed nonblank text of at most 2,000 Unicode code points, and positive
  integer lines within flawed code. HTTP checks the 128 KiB cap on the raw
  UTF-8 body before parsing. Assign IDs and zero-based ordinals on the server.
  No path appends comments to an existing submission. Grant execution
  explicitly to `authenticated` and deny `PUBLIC`, `anon` and `service_role`.
  Use a private ledger for submission-create requests only. Scope UUID keys by
  actor, method and resource. The callable function computes the fingerprint
  from its validated arguments in canonical form and accepts no caller-supplied
  fingerprint. Commit database-decided outcomes in the submission-create
  transaction. Success commits with the submission and all comments.
  A definitive failure commits its outcome without creating a submission or
  comments. HTTP validation failures rejected before the database call leave
  the ledger and domain records untouched.
  Preserve recorded outcomes on replay and distinguish in-progress requests
  from definitive rejection.

  The LRN-04.5 and LRN-04.6 outcomes use these INTEGRATION-SPEC §3 mappings.

  | Condition | HTTP and code |
  | --- | --- |
  | Stale live revision | `409 VERSION_CONFLICT` |
  | Challenge no longer published or archived | `409 INVALID_STATE` |
  | Attempt allowance exhausted or attempt ineligible | `409 ATTEMPT_LIMIT` |
  | UTF-8 JSON body too large | `413 PAYLOAD_TOO_LARGE` |
  | Invalid comment input | `400 VALIDATION_ERROR` |
  | Other definitive submission service failure | `503 SERVICE_UNAVAILABLE` |
  | Throttling | `429 RATE_LIMITED` |
  | Idempotency conflict | `409 IDEMPOTENCY_CONFLICT` |

  Route the recorded lifecycle failure to “This challenge is no longer
  available for submission.” in the review, with its draft intact. For each
  reused status and code, the server and client share distinct exported error
  message constants for each case. `409 INVALID_STATE` covers lifecycle
  rejection and an in-progress duplicate. `503 SERVICE_UNAVAILABLE` covers
  definitive submission failure and account service outage. The server emits
  the applicable constant in `error.message`, the client matches it exactly,
  and tests assert the exact messages. Free-form text is never matched.
  Account failures follow SYS-11 and ACC-03 recovery. A 503 is a definitive
  submission failure only when the write is known to have failed. An
  interruption or otherwise unknown write outcome follows LRN-04.4.

  Add an owning Learner-only `/learner/history/:submissionId` page showing the
  pinned Learner code projection, submitted comments read-only and plain pending
  status. Create zero grading runs on submission. `GET /api/v1/submissions/:id`,
  grade display and grading initiation, including the SYS-10.3 Submission
  grading use, belong to T-12 (LRN-05).
- **Depends on:** T-10 (with T-02 and T-03 through T-10).
- **Status:** todo

## Author

## TA

### T-30: Inspect submissions and retained assessment evidence

- **Issue:** #53
- **Covers:** TA-01.1–TA-01.8; SYS-02.1–02.2, SYS-04.1–04.2,
  SYS-08.2–08.3, SYS-09.1–09.3, SYS-11.1–11.4, SYS-12.1–12.2 and
  SYS-12.4 for TA inspection; SYS-17 and SYS-19 for these screens.
- **Route:** high
- **Reads:** `workflow/specs/PRODUCT-SPEC.md` §3 Story index → TA, §4 Product
  decisions → Grading and §5 Navigation and UI;
  `workflow/specs/stories/TA-01-inspect-submissions.md`;
  `workflow/specs/TECHNICAL-SPEC.md` SYS-01 — Runtime and server/client boundary,
  SYS-02 — Untrusted input and submitted code, SYS-04 — Shared building blocks,
  SYS-08 — Authorization at the data boundary, SYS-09 — Authentication with
  Cache Components, SYS-10 — Database enforcement and privileged access,
  SYS-11 — Authentication and authorization failures,
  SYS-12 — Record access and audit, SYS-16 — Security baseline,
  SYS-17 — Simple, accessible UI, SYS-19 — Test strategy;
  `workflow/specs/INTEGRATION-SPEC.md` §1 Scope and contract conventions,
  §2 Domain model and publication lifecycle (pinned revisions and Code,
  proposals and locations), §3 API contracts → Transport, concurrency and
  errors, Shared response types and TA surface (submission reads),
  §5 Deterministic grading, moderation and progress → Matching and score,
  and §7 Integration verification.
- **Tests:** unit (`tests/unit/ta/inspection/`); integration
  (`tests/integration/ta/inspection/`); e2e (`tests/e2e/ta/inspection/`). Cover
  bounded/filter-bound cursors and URL restoration, pending/running/failed
  versus completed-zero grades, empty comments, duplicate/unmatched/missed
  evidence, private answer projections, inert code/text, all read/recovery
  states and retained R1 evidence after publication/lifecycle changes. Exercise
  direct entry points and database reads with two users per role and an
  anonymous caller; verify no emails, wrong-role disclosure or provider calls.
  Browser checks include account transitions, keyboard use and phone width.
- **Config paths:** `vitest.integration.config.mts` (include the TA suite while
  preserving existing suites and serial execution).
- **Constraints:** Own `/ta/submissions`, `/ta/submissions/:submissionId` and
  their validated server read contracts. Reuse the shared SYS-04 renderer owned
  by learner issue #49; add TA real-diff projection without a second renderer.
  Show original and effective grades from stored evidence; do not regrade or
  implement grading, publication or learner submission flows. T-31 owns detailed
  flag/resolution and override histories/forms referenced by TA-01.5; provide
  their stored DTO fields and composition points here. Preserve validated queue
  and learner return context under TA-01.8; T-32 supplies the learner destination,
  so neither task waits on the other's implementation for its own tests.
  Seed persisted records through the local fixture harness rather than require
  the full Author/Learner flows. Use INTEGRATION-SPEC's shared fixture identities
  and outcomes; read only the §6 fixture scenarios needed by each test.
  Read the relevant `node_modules/next/dist/docs/` guide before Next.js code.
  The orchestrator runs database-backed checks; specialists report them as unrun.
- **Depends on:** T-02, T-03; shared renderer from #49 (learner task T-10 is
  not yet entered in this PLAN; no dependency on its downstream learner tasks).
- **Status:** done

### T-31: Resolve flags and append justified grade overrides

- **Issue:** #54
- **Covers:** TA-02.1–TA-02.8, TA-03.1–TA-03.8; SYS-02.1–02.2,
  SYS-08.2–08.3, SYS-09, SYS-10.1–10.2 and SYS-10.4 for moderation writes,
  SYS-11, SYS-12.1–12.5 (moderation records, historical access and effective
  grade only), SYS-16.2, SYS-17 and SYS-19 for these surfaces.
- **Route:** high
- **Reads:** `workflow/specs/PRODUCT-SPEC.md` §3 Story index → TA,
  §4 Product decisions → Grading and Moderation flags and §5 Navigation and UI;
  `workflow/specs/stories/TA-02-resolve-flagged-submissions.md` and
  `workflow/specs/stories/TA-03-override-a-grade.md`;
  `workflow/specs/TECHNICAL-SPEC.md` SYS-02 — Untrusted input and submitted code,
  SYS-08 — Authorization at the data boundary, SYS-09 — Authentication with
  Cache Components, SYS-10 — Database enforcement and privileged access,
  SYS-11 — Authentication and authorization failures,
  SYS-12 — Record access and audit, SYS-16 — Security baseline,
  SYS-17 — Simple, accessible UI, SYS-19 — Test strategy;
  `workflow/specs/INTEGRATION-SPEC.md` §1 Scope and contract conventions,
  §2 Domain model and publication lifecycle (audit records and auditOrder),
  §3 API contracts → Transport, concurrency and errors, Shared response types
  and TA surface (flags, overrides and resolutions), §5 Deterministic grading,
  moderation and progress → Matching and score and Flags,
  and §7 Integration verification.
- **Tests:** unit (`tests/unit/ta/moderation/`); integration
  (`tests/integration/ta/moderation/`); e2e (`tests/e2e/ta/moderation/`). Cover
  each flag kind, open/resolved filters, pagination, corrections, reason and
  integer-score boundaries, unchanged originals/keys/hints/category evidence,
  historical moderation and shared effective-grade projections. Race distinct
  overrides and resolutions on independent committed local connections:
  preserve all entries with unique submission-wide auditOrder and timestamp-tie
  ordering. Race duplicate keys, reject changed-payload replays and forged
  actors/times/order, and verify lost-response recovery, state/access failures,
  no automatic replay after sign-in and no provider calls. Check permitted
  Learner reads and denied Author/anonymous writes through endpoints and direct
  database access with two users per role; exercise keyboard/phone-width forms.
- **Config paths:** none; reuse T-30's TA integration-suite inclusion.
- **Constraints:** Own `/ta/flags`, both moderation POST contracts and the
  flag/resolution and override histories/forms composed into T-30 detail.
  Add only constrained user-scoped moderation append paths, explicit grants
  and atomic audit/idempotency persistence in a new migration; regenerate
  `src/lib/supabase/database.types.ts`. No admin-client use is authorized for
  human moderation. Derive attribution/time/order server-side and serialize
  the submission's shared audit stream. Keep direct forged writes denied;
  corrections append, never edit/delete. Resolution changes no grade; overrides
  change only effective score/pass status and never remove/regenerate flags.
  Reuse shared grade projection for owning-Learner reads and test it with
  fixtures; Learner result/history UI remains outside this task. Flag creation
  and grading remain with learner issues #51/#52, without a completion dependency
  because persisted flags/grades can be seeded. Reuse T-30's fixture harness.
  Read the relevant Next.js guide before code; the orchestrator runs all
  database-backed checks and specialists report them as unrun.
- **Depends on:** T-30
- **Status:** done

### T-32: Learner directory, category progress and rule-based recommendations

- **Issue:** #55
- **Covers:** TA-04.1–TA-04.2 (learner list/detail shell), TA-05.1–TA-05.7;
  SYS-02.1–02.2, SYS-04.1, SYS-08.2–08.3, SYS-09, SYS-11,
  SYS-12.1–12.2 and SYS-12.4 (permitted identity and historical evidence),
  SYS-17 and SYS-19 for these reads and screens.
- **Route:** high
- **Reads:** `workflow/specs/PRODUCT-SPEC.md` §3 Story index → TA,
  §4 Product decisions → Hints and attempts, Recommendations and Shared
  vocabularies and §5 Navigation and UI;
  `workflow/specs/stories/TA-04-learner-performance-summary.md` (TA-04.1–.2
  and shared learner-shell navigation only) and
  `workflow/specs/stories/TA-05-category-progress-and-recommendations.md`;
  `workflow/specs/TECHNICAL-SPEC.md` SYS-02 — Untrusted input and submitted code,
  SYS-04 — Shared building blocks, SYS-08 — Authorization at the data boundary,
  SYS-09 — Authentication with Cache Components,
  SYS-10 — Database enforcement and privileged access,
  SYS-11 — Authentication and authorization failures,
  SYS-12 — Record access and audit, SYS-17 — Simple, accessible UI,
  SYS-19 — Test strategy; `workflow/specs/INTEGRATION-SPEC.md`
  §1 Scope and contract conventions, §2 Domain model and publication lifecycle
  (retained submissions/revisions and original matching), §3 API contracts →
  Transport, concurrency and errors, Shared response types (ChallengeCard) and
  TA surface (learners, progress and recommendations), §5 Deterministic grading,
  moderation and progress → Category progress and recommendations,
  and §7 Integration verification.
- **Tests:** unit (`tests/unit/ta/progress/`); integration
  (`tests/integration/ta/progress/`); e2e (`tests/e2e/ta/progress/`). Cover all
  five categories, null versus zero, retained first-attempt history, failed and
  retry exclusion, override invariance, unrounded weakness ties and candidate
  ordering, no observed/eligible results, bounds and any-prior-attempt exclusion.
  Refresh after attempts/publication/lifecycle changes; test independent section
  failures and retained-content labels. Cover learner pagination, duplicate
  names, no email, missing/wrong-role IDs, direct endpoint/database access with
  two users per role and anonymous caller, supporting-submission round trips,
  keyboard/phone-width states and zero mutation/provider activity on reads.
- **Config paths:** none; reuse T-30's TA integration-suite inclusion.
- **Constraints:** Own `/ta/learners`, `/ta/learners/:learnerId`, learner identity
  reads and the directory/detail shell allocated by TA-04.1–.2. Provide the
  separate Performance summary composition region for T-33, which owns its
  read/generation states; do not present a fabricated summary or generation
  action before that feature exists. Own one shared CategoryProgress aggregation
  from original matching across all eligible history, reused by T-33's summary
  snapshot. Deterministic guidance loads independently of summary generation;
  recommendation cards offer no Learner-only review action. Implement only the
  TA progress/recommendation read contracts, not challenge publication, grading
  or Learner browsing. Use T-30 fixture records, adding stable synthetic
  recommendation/tie cases under the shared contract; no dependency on Author
  or downstream Learner implementation. T-33 later composes into this shell
  without reimplementing directory, aggregation or recommendation rules.
  Read the relevant Next.js guide before code; the orchestrator runs all
  database-backed checks and specialists report them as unrun.
- **Depends on:** T-30
- **Status:** todo

### T-33: Generate and retain evidence-linked learner performance summaries

- **Issue:** #56
- **Covers:** TA-04.3–TA-04.8; SYS-01.1, SYS-02.1–02.2, SYS-03.1–03.3,
  SYS-08.2–08.3, SYS-09, SYS-10.1–10.4 (named TA summary persistence),
  SYS-11, SYS-12.1–12.2 and SYS-12.5 (TA-only summary access), SYS-13.1/13.3,
  SYS-16–SYS-19 for summary entry points; SEC-01.1–01.2, SEC-02.1–02.2,
  SEC-04.1–04.2, SEC-05.1–05.3 and SEC-06.1 for this caller/persistence flow,
  reusing rather than rebuilding T-04's provider/accounting enforcement.
- **Route:** high
- **Reads:** `workflow/specs/PRODUCT-SPEC.md` §3 Story index → TA,
  §4 Product decisions → Hints and attempts, Grading and Shared vocabularies
  and §5 Navigation and UI;
  `workflow/specs/stories/TA-04-learner-performance-summary.md`;
  `workflow/specs/TECHNICAL-SPEC.md` SYS-01 — Runtime and server/client boundary,
  SYS-02 — Untrusted input and submitted code, SYS-03 — LLM boundary,
  SYS-08 — Authorization at the data boundary, SYS-09 — Authentication with
  Cache Components, SYS-10 — Database enforcement and privileged access,
  SYS-11 — Authentication and authorization failures,
  SYS-12 — Record access and audit, SYS-13 — Environment isolation,
  SYS-16 — Security baseline, SYS-17 — Simple, accessible UI,
  SYS-18 — Resource use, SYS-19 — Test strategy;
  `workflow/specs/AI-SECURITY-SPEC.md` SEC-01 — Authorize and minimize model
  access, SEC-02 — Validate model output before use, SEC-04 — Bound SoC requests
  and usage, SEC-05 — Reserve and settle usage atomically,
  SEC-06 — Contain failures and keep diagnostics safe;
  `workflow/specs/INTEGRATION-SPEC.md` §1 Scope and contract conventions,
  §2 Domain model and publication lifecycle (performance_summaries and generated
  provenance), §3 API contracts → Transport, concurrency and errors and TA
  surface (SummaryRecord and summary operations), §4 Server-only LLM contracts
  (shared envelope and TA performance summary: `operation: summarize_learner`),
  §5 Deterministic grading, moderation and progress → Category progress and
  recommendations (snapshot evidence only), and §7 Integration verification.
- **Tests:** unit (`tests/unit/ta/summaries/`); integration
  (`tests/integration/ta/summaries/`); e2e (`tests/e2e/ta/summaries/`). Capture
  exact latest-20 completed evidence selection/order, all-history progress and
  fingerprints covering effective overrides; exclude identity, private answers
  and unrelated learners. Test fresh/stale/null/read-failure states, no automatic
  generation, explicit retries, no-completed/oversized/quota/timeout/invalid-output
  failures, empty output sections and inert malicious text/evidence links.
  Verify wrong-role/forged-resource denial before reservation/dispatch, direct
  summary-write denial, strict evidence/category validation and atomic summary
  plus evidence persistence. Race duplicate mutation keys, simulate lost replies,
  failed accounting/persistence and late results; preserve previous summaries,
  prevent duplicate dispatch/persistence and verify safe diagnostics. Exercise
  two users per role and anonymous access, account transitions, independent
  progress/summary failures, keyboard focus and phone-width rendering with fake
  AI and local Supabase. Reuse T-04 accounting regression tests for shared limits.
- **Config paths:** none; consume `src/server/llm/config.ts` unchanged and reuse
  T-30's TA integration-suite inclusion.
- **Constraints:** Own only summary GET/POST contracts, authorized snapshot and
  freshness selection, generated-result persistence and the summary region in
  T-32's learner detail. Invoke `src/server/llm/` after stored-role/scope/state
  checks; caller payloads cannot provide evidence, actor or accounting fields.
  Reuse T-32's CategoryProgress service, T-30 supporting-submission links and
  T-04's bounded fake provider, retries and durable admission/accounting.
  Add the dedicated admin-only function for SYS-10.3's TA performance summary
  named use in a new migration; persist validated output and evidence atomically,
  retain immutable prior records and regenerate database types. No direct admin
  table access or user-generated summary writes. Snapshot freshness compares
  evidence fingerprints, never age alone; completed retry evidence is permitted
  while progress still excludes retries. No transaction spans a provider call.
  Summary advice changes no grades, flags, progress or recommendations. All tests
  remain fake/local; this task does not enable live SoC or add provider settings.
  Read the relevant Next.js guide before code; the orchestrator runs all
  database-backed checks and specialists report them as unrun.
- **Depends on:** T-04, T-32
- **Status:** todo
