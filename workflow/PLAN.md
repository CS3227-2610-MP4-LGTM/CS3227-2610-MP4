# Implementation plan

Derive tasks from approved [spec conventions](specs/README.md),
[PRODUCT-SPEC](specs/PRODUCT-SPEC.md), [TECHNICAL-SPEC](specs/TECHNICAL-SPEC.md),
[INTEGRATION-SPEC](specs/INTEGRATION-SPEC.md) and
[AI-SECURITY-SPEC](specs/AI-SECURITY-SPEC.md). Story paths belong in each task's
Reads. This header allocates no tasks.

## Capacity

At most 17 tasks total, with at most 5 in Foundations and 4 each in Learner,
Author and TA. A task covers at most 3 stories of one role, or one foundation area,
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

### T-05: Live SoC provider at the shared LLM boundary

- **Issue:** #66, #77
- **Covers:** SEC-04 and SEC-04.1–04.5, SYS-13.3, SYS-15 and SYS-15.1
  (LLM configuration), SYS-18.1, and all four INTEGRATION-SPEC §4 contracts,
  including the independent `assess_review` credit levels. Preserve T-04's
  SEC-04.1–04.2 enforcement and SEC-05 settlement and retry rules. #77 covers
  constrained SoC requests and schema-inclusive preflight under SEC-04.1
  and SEC-04.3, preserved SEC-02.1 and SEC-03.1 output gates, LRN-05's
  matched-comment credit rubric under §4, and SYS-19.4 model settings review
  and live smoke evidence using the labelled E6 cases and §6-based fixtures.
- **Route:** standard
- **Reads:** `workflow/specs/AI-SECURITY-SPEC.md` SEC-02 — Validate model output
  before use, SEC-03 — Protect learner-facing hints and feedback, SEC-04 — Bound
  SoC requests and usage, and SEC-05 — Reserve and settle usage atomically;
  `workflow/specs/TECHNICAL-SPEC.md` SYS-13 — Environment isolation, SYS-15 —
  Configuration and hosted Auth (LLM rows and SYS-15.1), SYS-18 — Resource
  use, and SYS-19 — Test strategy (SYS-19.4);
  `workflow/specs/INTEGRATION-SPEC.md` §1 Scope and contract conventions,
  §2 Domain model and publication lifecycle → Code, proposals and locations,
  §3 API contracts → Transport, concurrency and errors, §4 Server-only LLM
  contracts (all four operations), §5 Deterministic grading, moderation and
  progress → Matching and score (credit context), and §6 Shared deterministic
  seed fixtures; `workflow/specs/stories/LRN-05-grade-a-submitted-review.md`
  (AI behavior, matched-comment assessment only).
- **Tests:** unit (`tests/unit/server/llm/soc-provider.test.ts` and
  `tests/unit/server/llm/soc-smoke.test.ts`, with regressions in
  `tests/unit/server/llm/` and `tests/unit/llm-internal/`). Exercise the shared
  boundary's hosted selection and accounting with simulated SoC transport and
  fake accounting/clock. Cover exact wire requests, contract-derived
  response schemas and semantic operation guidance, default fake and
  explicit live selection for each hosted environment, named safe errors,
  denied isolation/limit/model configurations, input/context preflight,
  lower effective limits, byte/time cutoff, empty and length-truncated output
  with both verified usage and the uncertain charge, invalid-output retry,
  transport failure without retry, and reasoning exclusion from application
  outputs and diagnostics. Exercise the script
  with simulated transport/clock for opt-in, fixture validation, retained-flaw
  checks, the five-flaw stress input, repeat and override options (including
  the SEC-04 output ceiling), four-second start spacing and the run cap.
  Verify CSV rows include the requested token cap, failures and parsed
  assessment credits without raw request, response or reasoning text. Retain
  the existing local Supabase accounting regression suite
  (`tests/integration/llm/`) and keep all automated tests offline from SoC.

  For #77, capture all four strict JSON Schema requests with simulated
  transport. Check input-bound values across different snapshots, credit
  enums, text property order, omission of string-length keywords, and
  inclusion of the serialized schema in input preflight. Check semantic-only
  system instructions and the three `assess_review` rubric clarifications. Keep
  validator regressions, including rejection of an overlong string that the
  provider schema permits. Exercise the labelled assessment file option,
  all 21 fixture inputs and labels, and CSV exact agreement for matching and
  differing credit pairs, invalid answers, and cases without labels. Shawn
  approved changes to the #66 assertions for the previous model, format and
  system-instruction shape. List every changed or removed assertion at G2.
- **Config paths:** `src/server/llm/config.ts`, `workflow/scripts/soc-smoke.ts`,
  `workflow/scripts/fixtures/soc-smoke/assess-review-e6.json`. Use existing
  dependencies and test configuration.
- **Constraints:** One implementer run for #77. Build on #66's environment-backed
  provider selection and preserve injected fake callers. Hosted development
  defaults to fake. Development and production may explicitly select live
  with `AI_PROVIDER=soclaas` and their separate `SOCLAAS_API_KEY`. Keep the
  exact SEC-04 HTTPS destination,
  reject redirects and aliases, and fail closed if model, context, settings or
  enforceable limits are invalid. Check the complete serialized provider
  request plus framing and the actual operation cap before reservation and
  dispatch. Reserve and settle through existing accounting. Treat empty or
  length-truncated answers as invalid output, preserving verified usage for
  settlement when available. Verify prompt and all completion tokens against
  the reservation, with no cached-token adjustment. Unverifiable usage takes
  the uncertain charge. Discard reasoning text and keep provider metadata out
  of app results and diagnostics. Keep untrusted inputs separate from system
  instructions. SEC-02/SEC-03 validators remain the gate on output, including
  string bounds. Escalate #77 to high if the diff reaches auth, accounting,
  persistence or validators. Leave migrations, role entry points, role-specific
  summary and injection quality, and deployment workflows outside #77 scope.

  For each live request, derive `response_format` with `type: json_schema`
  and `strict: true` from the operation output contract and that request's
  input. Pin IDs, keys, categories and submission IDs to input values wherever
  the contract allows. Constrain both credits to `0`, `0.5` and `1`. Omit
  string-length keywords from the request schema because SoC rejects that
  grammar. Order text properties before the values they justify, including
  `feedback` before both credits for `assess_review`. Count the schema toward
  input preflight. Keep the system instructions short and semantic, aligned
  with §4, with the output shape specified in `response_format`. Credit only
  what the review comment itself says, give zero explanation credit for a
  fix without an explanation, and ignore instructions or credit claims in
  the comment.

  In `src/server/llm/config.ts`, pin `qwen3.6:35b` for all four operations
  with its reviewed 262,144-token context. Keep `none` effort and live output
  caps of `inject_flaws` 1,280, `generate_hints` 384, `assess_review` 576 and
  `summarize_learner` 1,024 tokens. Keep SEC-04 timing and app defaults unless
  smoke evidence leads to a human decision.

  Extend `workflow/scripts/soc-smoke.ts` with an option to run a labelled
  `assess_review` case file. Preserve the explicit live flag, operation,
  ordinary input files with optional case IDs, repeat count, and script-only
  effort and `--max-tokens` overrides.
  Bound `--max-tokens` by the SEC-04 output ceiling and keep app caps as
  constants. Use the existing §6-based fixtures for all four operations and
  the separately labelled five-flaw `inject_flaws` stress fixture. Use the
  dev key from the operator's shell and invoke Bun with
  automatic environment file loading disabled. Pace call starts at least four
  seconds apart and cap a run at 30 calls. Use the same adapter protocol and
  app validators. Keep the complete retained-flaw context for hint and
  assessment safety checks,
  including unmatched flaws, separate from provider input. Write one CSV row
  per call with case ID, operation, effort, `max_tokens`, latency,
  prompt/completion tokens, finish reason, reasoning character count, validity,
  rejection reason and parsed assessment credits. Include `explanation_label`,
  `fix_label` and exact agreement for valid labelled results where both credits
  are available. Use safe rejection reasons, omit raw reasoning, and keep the
  key and model text out of diagnostics. Never read `.env*` or call the portal
  from code.

  Copy the 21 supplied inputs from `.git/e6/e6-cases.json` and join them by
  case ID with `explanation_label` and `fix_label` from
  `.git/e6/e6-assess-review-cases.csv`. Commit the result in the runner's
  fixture format as `workflow/scripts/fixtures/soc-smoke/assess-review-e6.json`.
  Keep the scratch files under `.git` outside the commit. Shawn runs live
  smoke with the dev key. Require at least 19 of 21 E6 cases valid at effort
  `none`, report label agreement, require valid §6 cases for all four operations,
  and report the five-flaw stress result, for which a timeout is acceptable.
  Record the human model settings review under SYS-19.4. Update
  `docs/DeveloperGuide.md` for the new pinned model, labelled smoke invocation
  and CSV results, with SEC-04 and SYS-15 links for limits and configuration.
- **Depends on:** T-04
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
- **Status:** done

### T-12: Grade a submitted review

- **Issue:** #51
- **Covers:** LRN-05.1–05.7, including explicit “Retry grading” on the same
  pinned submission, exact failure messages, observation of uncertain outcomes,
  and no automatic retry of failed grading. For AI input-limit failures, the
  page omits “Retry grading” and the server rejects retry. Cover SYS-02,
  SYS-03, SYS-04, SYS-08–SYS-12 (Submission grading named use and historical
  access), SYS-17, SYS-18.2 and SYS-19. Preserve the T-04/T-05 SEC-01–SEC-06
  controls for this operation.
  Under LRN-05.2, SYS-10.3 and SEC-01, accept an assessment only when
  both the pre-dispatch capture and the capture after a successful response
  find the exact running run created by the start function for this
  submission. Each capture returns `INVALID_STATE` if no run is bound,
  the bound run is absent, a different run is active, or the bound run
  is no longer running. Completion independently rechecks eligibility.
  Record SYS-19.4 live smoke and SYS-13.3/SYS-15 hosted dev settings evidence
  at human close-out.
- **Route:** high
- **Reads:** `workflow/specs/stories/LRN-05-grade-a-submitted-review.md`;
  `workflow/specs/PRODUCT-SPEC.md` §3 Story index → Learner, §4 Product
  decisions → Hints and attempts, Grading and Moderation flags, and §7
  Non-functional requirements; `workflow/specs/TECHNICAL-SPEC.md` SYS-02 —
  Untrusted input and submitted code, SYS-03 — LLM boundary, SYS-04 — Shared
  building blocks, SYS-08 — Authorization at the data boundary, SYS-09 —
  Authentication with Cache Components, SYS-10 — Database enforcement and
  privileged access (Submission grading), SYS-11 — Authentication and
  authorization failures, SYS-12 — Record access and audit, SYS-13 —
  Environment isolation (hosted selection), SYS-15 — Configuration and hosted
  Auth (AI settings), SYS-17 — Simple, accessible UI, SYS-18 — Resource use,
  and SYS-19 — Test strategy;
  `workflow/specs/AI-SECURITY-SPEC.md` SEC-01 — Authorize and minimize model
  access, SEC-02 — Validate model output before use, SEC-03 — Protect learner-facing
  hints and feedback (assessment feedback), SEC-04 — Bound SoC requests and usage,
  SEC-05 — Reserve and settle usage atomically, and SEC-06 — Contain failures
  and keep diagnostics safe (all scoped to assessment); `workflow/specs/INTEGRATION-SPEC.md`
  §1 Scope and contract conventions, §2 Domain model and publication lifecycle →
  SYS-12 decision: immutable published revisions and Code, proposals and locations,
  §3 API contracts → Transport, concurrency and errors, Shared response types
  and Learner surface, §4 Server-only LLM contracts → Matched-comment
  assessment: `operation: assess_review`, §5 Deterministic grading, moderation
  and progress → Matching and score and Flags, §6 Shared deterministic seed
  fixtures → C1: Checkout totals, C2: Safe quotient, Submissions and expected
  outcomes and Derived fixture scenarios, and §7 Integration verification
  (assessment, access and pinned projection).
- **Tests:** unit (`tests/unit/learner/grading.test.ts`,
  `tests/unit/learner/grading-result.test.tsx`) for deterministic distance,
  tie order, duplicate/unmatched classification, credit aggregation, empty/no
  matches, penalty, rounding, pass/flag thresholds, strict transport and safe
  DTOs, account and Origin checks, and result state/error rendering. Use
  `tests/unit/server/llm/soc-smoke-multi-match.test.ts` (new) with simulated
  transport for multi-match labels, duplicate-pair rejection and retry
  reporting. Use `tests/integration/llm/assess-review-bound-run.test.ts` (new)
  for successful capture of the bound run, pre-dispatch rejection without
  reservation or provider work, and rejection of a successful provider
  response if the run stops running or another run becomes active before
  recapture. Cover missing bindings, absent runs, runs for other
  submissions, and pending or terminal runs. At G2, use a separate
  `test(llm)` commit for the setup-only edits to the approved assessment
  success and forged-pair cases in `tests/integration/llm/boundary.test.ts`.
  Create a running run and bind its ID in each setup. Preserve both
  assertions and all other approved tests. Local Supabase
  (`tests/integration/domain/learner-grading.test.ts`, with
  `tests/integration/domain/grading-run-history.test.ts` as regression) covers
  owner/role/anonymous and RPC grants, private-field and diagnostic isolation,
  replay and concurrent requests, active-run and stale-write rejection,
  atomic grade and child writes, no-match provider bypass, and provider failure
  without a grade or flags. Cover the 60-second database deadline, late
  completion rejection, read-only timeout projection, atomic timeout settlement
  and restart, terminal-field immutability, and stored pending rows blocking
  a new run. Verify explicit retry increments `run_number` on the same
  submission and that the server rejects retry after an input-limit failure.
  Assert one assessment per pinned flaw for a completed first attempt with
  both matches and misses, including null comment
  ID for misses. Cover existing-grade short-circuit before context read,
  historical access, and completed-run history. Production-build e2e
  (`tests/e2e/learner/grading.spec.ts`) covers pending through terminal
  observation, reopen/read recovery, explicit retry and input-limit suppression,
  and the single original display, with the fake provider. The orchestrator
  runs database-backed checks on local Supabase using T-11's harness and the
  Node version from `.node-version`.
- **Config paths:** `src/server/llm/boundary.ts`,
  `tests/integration/llm/boundary.test.ts` (only the two G2 setup edits above),
  `tests/integration/llm/assess-review-bound-run.test.ts` (new),
  `tests/unit/server/llm/soc-smoke-multi-match.test.ts` (new),
  `workflow/scripts/soc-smoke.ts`,
  `workflow/scripts/fixtures/soc-smoke/assess-review-multi-match.json` (new).
  Keep the existing E6 cases in
  `workflow/scripts/fixtures/soc-smoke/assess-review-e6.json` intact and usable.
- **Constraints:** T-12 owns the `assess_review` boundary change. The start
  function creates the running run before dispatch and passes its ID to
  `createLlmBoundary` through the server-only selection argument. The run ID
  stays out of the public request and model payload. Both captures verify
  that exact run for the verified Learner's submission, with no completed
  grade. Keep the change scoped to `assess_review`.

  Reuse the SYS-10.3 `public.llm_grading_context` read only after verified
  Learner ownership and checking for an existing completed grade. Project only
  named, needed fields from private flaw data. Never pass a whole flaw row
  through to a DTO. Select matches deterministically from the pinned revision,
  send only those pairs to `assess_review`, and persist its validated credits
  and safe feedback. Compute points and rule flags from the contract.

  Add typed admin-only start, complete and fail functions for the Submission
  grading named use. Use database timestamps. Each write locks the submission
  and rechecks the stored Learner role and ownership, grade absence and active
  run identity or absence as appropriate for the step. Atomically complete
  the active run, original grade, all children and rule flags. Use replay keys
  and compare-and-set transitions to reject stale or duplicate writes. Release
  database locks before provider work. New runs start in `running` and
  can transition once to `failed` or `completed`. Freeze terminal state,
  `finished_at` and `failure_code`. Only absence of a run yields the
  pending result state. Never create or transition stored `pending` rows.
  Treat an existing `pending` row as active and fail closed.

  A running run expires at `created_at + 60 seconds` on the database clock.
  Reject completion once the deadline is reached. The reader reports an
  expired running run as failed with `AI_TIMEOUT` without writing, so polling
  stops. On the next grade POST, the start function atomically records the
  expired run as failed with `AI_TIMEOUT` and a database-clock `finished_at`
  before creating the next run. Sort new migrations
  after T-32 PR #79's `20261109160000_ta_learner_progress.sql`; regenerate
  `src/lib/supabase/database.types.ts` locally. Preserve the first-attempt
  `ai_grades` and per-revision-flaw `ai_grade_assessments` shape consumed by
  T-32. T-32 is a compatibility constraint.

  Extend `read_learner_submission` and `readLearnerSubmission` and use the
  same reader for the result page and `GET /api/v1/submissions/:id`. Project
  stored safe grade fields and counts, never private matching. Use the shared
  Learner-pinned projection and read-only comments. Use the cookie-authenticated
  `POST /api/v1/submissions/:id/grade`, reusing T-11's Origin check and
  `X-LGTM-Workspace-Account-Id` header. A completed grade is returned from
  storage on reopen or grade request. After a retryable failure, an explicit
  grade POST uses the same start function to create the next `run_number` on
  the same submission. Preserve the transport replay rule for uncertain
  outcomes. Offer “Retry grading” per LRN-05.3 and LRN-05.6 and reject retry
  at the server after an AI input-limit failure. Display original score,
  components, statuses and credits once. T-13 (LRN-06–08) owns feedback
  display, hints, challenge retry, reports and history. Read the relevant
  installed Next.js guide before writing Next.js code.

  Add a labelled fixture with at least two selected comments in one
  `assess_review` call and paired credit labels. Report repeated-pair
  rejections and retries with safe diagnostics and the existing output-retry
  limits; preserve single-match label support. The human runs live smoke at
  G4 and switches hosted dev to live SoC at close-out. Document the reviewed
  environment configuration accurately, including live hosted dev and fake
  local/CI.
- **Depends on:** T-03, T-04, T-05, T-11.
- **Status:** done

### T-13: Feedback, hints and Retry challenge

- **Issue:** #52
- **Covers:** LRN-06.1–06.7 and SEC-03.2. Apply SYS-02.1–02.2,
  SYS-04.1–04.2, SYS-08.1–08.3, SYS-09, SYS-10.1–10.2, SYS-11,
  SYS-12.1 and SYS-12.4–12.5, SYS-14.2–14.3, SYS-17 and SYS-19.1–19.3
  to these Learner surfaces. Preserve SEC-02.2 inert text, SEC-03 safe
  projection and SEC-05 quota-free cache reads.
- **Route:** high
- **Reads:** `workflow/specs/stories/LRN-06-feedback-hints-and-retry.md`
  (all acceptance criteria and UI notes), `workflow/specs/stories/LRN-03-manage-line-comments.md`
  (LRN-03.1–03.6), `workflow/specs/stories/LRN-04-submit-a-final-review.md`
  (LRN-04.1–04.6), `workflow/specs/stories/LRN-05-grade-a-submitted-review.md`
  (LRN-05.1–05.5 and LRN-05.7 for the original result and recovery), and
  `workflow/specs/stories/ACC-03-role-based-landing-and-navigation.md`
  (ACC-03.2–03.7 for workspace access and recovery).
  `workflow/specs/PRODUCT-SPEC.md` §3 Story index → Learner, §4 Product
  decisions → Hints and attempts, Grading and Shared vocabularies, §5
  Navigation and UI (Learner), and §7 Non-functional requirements (learning
  presentation).
  `workflow/specs/TECHNICAL-SPEC.md` SYS-02 — Untrusted input and submitted
  code, SYS-04 — Shared building blocks, SYS-08 — Authorization at the data
  boundary, SYS-09 — Authentication with Cache Components, SYS-10 — Database
  enforcement and privileged access, SYS-11 — Authentication and authorization
  failures, SYS-12 — Record access and audit (Learner-facing challenge
  material, private answers, submissions, original grades and cached per-flaw
  hints), SYS-14 — Delivery and database evolution (SYS-14.2–14.3), SYS-17 —
  Simple, accessible UI, SYS-18 — Resource use (preserve grading behavior),
  and SYS-19 — Test strategy (SYS-19.1–19.3).
  `workflow/specs/AI-SECURITY-SPEC.md` SEC-01 — Authorize and minimize model
  access, SEC-02 — Validate model output before use, SEC-03 — Protect
  learner-facing hints and feedback (SEC-03.2), SEC-04 — Bound SoC requests
  and usage, SEC-05 — Reserve and settle usage atomically and SEC-06 —
  Contain failures and keep diagnostics safe, scoped to serving approved
  result text and reading hints from cache.
  `workflow/specs/INTEGRATION-SPEC.md` §1 Scope and contract conventions →
  Shared values and bounds, §2 Domain model and publication lifecycle →
  SYS-12 decision: immutable published revisions and Code, proposals and
  locations, §3 API contracts → Transport, concurrency and errors, Shared
  response types and Learner surface (submission create, detail and hint
  read), §4 Server-only LLM contracts → Matched-comment assessment:
  `operation: assess_review` (stored output), §5 Deterministic grading,
  moderation and progress → Matching and score (credits and eligible hint
  order), §6 Shared deterministic seed fixtures → C1: Checkout totals,
  C2: Safe quotient and Derived fixture scenarios, and §7 Integration
  verification (Learner access and cached hints).
- **Tests:** Unit and component coverage in
  `tests/unit/learner/feedback-and-hints.test.tsx`,
  `tests/unit/learner/retry-challenge.test.tsx` and
  `tests/unit/learner/retry-challenge-contract.test.ts` (new). Cover the
  three result sections, one original credit and status display, matched
  inert feedback and null unmatched/duplicate feedback, partial explanation
  and fix, category order/counts and empty states. Check one ordered hint
  per activation, no prefetch, disabled loading with earlier hints retained,
  same-ID recovery, eligibility refresh, account recovery and reveal reset.
  Exercise Next actions precedence and direct entry states, pinned
  independent drafts and ordering, guarded departure, reload, strict request
  validation and acknowledgement binding to the named first attempt. Check
  frozen request replay, zero-comment confirmation and draft retention on
  submission rejection.
  In `retry-challenge.test.tsx`, include
  `LRN-06.5 shows Retry challenge without reloading when grading completes while the result is open`.
  Local Supabase coverage in `tests/integration/domain/learner-feedback-and-hints.test.ts`
  and `tests/integration/domain/learner-retry-challenge.test.ts` (new).
  Exercise HTTP and direct user-scoped calls with the owner, a different
  Learner, Authors, TAs and anonymous access. Check grants, exact safe hint
  projection, ineligible, premature, matched, other-submission and
  other-revision hints, and historical reads after unpublish and archive.
  In `learner-feedback-and-hints.test.ts`, include
  `LRN-06.3 scopes second-attempt hint reads to its own original grade's eligible hints`.
  Verify a first-attempt hint ID is denied on attempt 2 unless it is also
  eligible on attempt 2's original grade.
  In `learner-retry-challenge.test.ts`, include
  `LRN-06.5 denies another Learner's challenge publication state and second-attempt ID through the scoped retry eligibility reads`.
  Verify zero provider calls, usage reservations or grading writes. Test
  pending, failed and override-only cases, passing originals, wrong
  challenge/owner, missing or second-attempt IDs, pinned success after
  republish, pinned revision mismatch, lifecycle loss and fresh key races
  against attempt creation or publication. Verify one committed second
  attempt, separate immutable comments, server IDs and ordinals, replay
  after lifecycle changes, changed previous ID conflicts, and replay of
  first-attempt keys created by T-11.
  Production-build Chromium coverage in
  `tests/e2e/learner/feedback-and-retry-challenge.spec.ts` (new). Cover the
  keyboard result-to-hint and result-to-second-review journeys at phone
  width, including fresh draft copies on reload, leave protection and
  navigation to the second result after confirmation. Run T-11 first review
  and T-12 grading regression tests. The orchestrator runs all
  database-backed checks on local Supabase with the Node version from
  `.node-version`. Local and CI browser tests use the fake provider.
- **Config paths:** `supabase/migrations/20261110130000_learner_feedback_retry.sql`
  (new), `src/lib/supabase/database.types.ts` (local generation using the
  existing `package.json` script), and
  `tests/unit/learner/submission-contract.test.ts`,
  `tests/integration/domain/learner-submissions.test.ts` and
  `tests/unit/learner/grading-result.test.tsx` solely for the approved
  compatibility changes below. Reuse without edits `package.json`, `vitest.config.mts`,
  `vitest.integration.config.mts`, `playwright.config.ts`,
  `tests/integration/domain/learner-browse-fixture.ts`,
  `tests/integration/domain/fixture.ts`, `tests/integration/auth/local.ts`,
  `tests/unit/learner/grading-fixture.ts` and `tests/e2e/account/server.ts`.
  Docs stage uses `README.md` and `docs/DeveloperGuide.md`.
- **Constraints:** T-13 delivers all of LRN-06. LRN-07 reports and LRN-08
  history list, current grade, overrides and moderation display are T-14 on
  the same issue. Keep T-12's “Retry grading” flow unchanged. Use “Retry
  challenge” for the LRN-06 action and “Retry grading” for the LRN-05.3
  action in plans, tests and docs. Quote other screen copy as specified.
  Read the installed Next.js guides for Route Handlers, authentication with
  Cache Components and Link blocking navigation before writing code.

  Extend the existing `read_learner_submission` / `readLearnerSubmission`
  result flow and `GradingResult`. Use the existing projection of
  `ai_grade_comment_results` for feedback and ordered `eligibleHints` from
  the completed original grade. Keep feedback with its matched comment
  alongside the single LRN-05 status and credit display. List missed partial
  credit and missed categories separately. Use only projected categories
  and counts for missed flaws. The result page's server read obtains
  `published` and the second attempt's ID through user-scoped reads bound
  to the owned source submission and passes both to `GradingResult`.
  `GradingResult` combines those props with live grading state so “Next
  actions” switches from the pending reason to “Retry challenge” when
  grading completes on an otherwise eligible result without a reload.
  The client reads the exact `SubmissionView` from
  `GET /api/v1/submissions/:id`. Preserve that response and both
  `SubmissionView` and `GradingView` exactly as §3 defines them, and
  preserve the `read_learner_submission(uuid)` signature and strict response
  shape. Keep older application deployments compatible with the new
  migration. Use no new feedback storage and make no provider calls.

  Add `GET /api/v1/submissions/:id/hints/:hintId` and one user-callable
  read function with an explicit authenticated-only execute grant.
  Verify the session, stored role and workspace account at the route.
  Within the function bind the cached publication hint to the exact owned
  submission, its pinned revision, its original grade linked through
  `ai_grade_evidence` to that submission's completed grading run, and
  that grade's `ai_grade_eligible_hints` row. Return only
  `{ hintId, category, text }` on success, with private no-store caching
  and safe errors. Keep hints available for eligible history after
  unpublish/archive. Neither success nor denial generates text, reserves
  quota or writes grade or usage state. Test-local setup creates eligibility
  evidence using the §6 hints already cached by the Learner browse fixture.
  Add no seed data or Author paths.

  Extend the existing `create_learner_submission(uuid, uuid, jsonb)`
  function and strict request validator with optional UUID
  `previousSubmissionId` in the JSON payload. Preserve one creation path,
  Origin check, workspace account header, T-11 ledger and first-attempt
  semantics. Preserve the canonical first-attempt fingerprint byte for byte
  by omitting the previous ID for first attempts. Include its canonical UUID
  for second attempts. Resolve an existing ledger entry before reevaluating
  eligibility and replay its recorded success or failure. Keep grants and
  direct validation intact. On a fresh key, under the same challenge-row
  lock, require the exact first attempt for the caller and challenge, a
  completed original grade, no second attempt and a published challenge.
  An override does not satisfy the original-grade prerequisite. Return
  `409 VERSION_CONFLICT` for a mismatched pinned revision. Validate lines
  against the first attempt's pinned code even if a different revision is
  live. Atomically create attempt 2 and its new comments and ledger outcome.
  Preserve the existing submission lifecycle, attempt-limit and
  idempotency responses and T-11 recovery. Sort new migrations after
  `20261110120000_learner_grading.sql` and regenerate database types locally.

  The result offers “Retry challenge” only after the first original grade
  completes, if a second attempt does not exist and the challenge remains
  published. Use the LRN-06.5 reason precedence and keep “Browse
  challenges”. `/learner/history/:id/retry` checks the current account
  and eligibility on entry, including direct URLs. Apply LRN-06.7 loading,
  read recovery, second-attempt, missing and access-denial behavior.
  In the eligible “Retry review” show the challenge and “Attempt 2”.
  Reuse T-11's review draft and workspace guard for fresh editable copies
  in original order with independent draft identities and same-line
  addition order. Reload restores fresh copies. Confirm with the first
  attempt ID and its pinned revision and navigate to the second result
  on success. Retain local work when eligibility changes after opening.

  G1-approved compatibility scope. Keep the existing
  RPC signatures and their grant-list and call-site tests. In a separate
  test commit at G2, change only the now-accepted previous-ID input in
  `tests/unit/learner/submission-contract.test.ts` and
  `tests/integration/domain/learner-submissions.test.ts` to a malformed
  previous ID. Keep the validation assertions and add the well-formed
  foreign-ID denial to the new access tests. Remove only the obsolete
  matched-feedback absence assertion in
  `tests/unit/learner/grading-result.test.tsx` and cover single visible
  matched feedback in new LRN-06.1 acceptance tests. Preserve every other
  assertion in those files. Describe the delivered learning flow in Docs
  and keep the documented hosted SoC and local/CI fake-provider distinction.
- **Depends on:** T-12 and T-11, with T-10 and the auth/data foundations
  through those tasks.
- **Status:** done

## Author

### T-20: Create, configure, list and edit challenge drafts

- **Issue:** #81
- **Covers:** AUT-01.1–01.5. AUT-02.1–02.6, except the “Generate proposals”
  action and its eligibility in AUT-02.1 and AUT-02.3, which T-21 adds.
  AUT-06.1. AUT-06.2 for lifecycle status, the working draft, whether a live
  revision exists, “Edit draft”, “Back to challenges”, read failure, absence
  and access denial; “Unpublish” and “Archive” belong to T-23 and published
  revision detail to T-22. AUT-06.3. SYS-02.1–02.2, SYS-04.1–04.2,
  SYS-08.1–08.3, SYS-09, SYS-10.1–10.2, SYS-10.4, SYS-11, SYS-12.1 (Author
  rows of Learner-facing challenge material and private answers), SYS-14.3,
  SYS-17 and SYS-19 apply to the new Author reads, writes and UI.
- **Route:** high
- **Reads:** `workflow/specs/PRODUCT-SPEC.md` §3 Story index → Author,
  §4 Product decisions → Flaw proposals and answer keys, Challenge input and
  Shared vocabularies, and §5 Navigation and UI.
  `workflow/specs/TECHNICAL-SPEC.md` SYS-02 — Untrusted input and submitted
  code, SYS-04 — Shared building blocks, SYS-08 — Authorization at the data
  boundary, SYS-09 — Authentication with Cache Components, SYS-10 — Database
  enforcement and privileged access, SYS-11 — Authentication and authorization
  failures, SYS-12 — Record access and audit (Learner-facing challenge material
  and Private answers and grading material), SYS-14 — Delivery and database
  evolution (SYS-14.3), SYS-17 — Simple, accessible UI and SYS-19 — Test
  strategy. `workflow/specs/INTEGRATION-SPEC.md` §1 Scope and contract
  conventions → Shared values and bounds and Pasted-code cap, §2 Domain model
  and publication lifecycle (challenges, challenge_drafts, proposal_sets,
  proposal_decisions) → SYS-12 decision: immutable published revisions,
  §3 API contracts → Transport, concurrency and errors, Shared response types
  (`AuthorDraft`, `AuthorChallengeCard`) and Author surface (`GET`/`POST
  /author/challenges`, `GET`/`PATCH /author/challenges/:id`), §6 Shared
  deterministic seed fixtures (Author A/B identities and C1/C2 ownership) and
  §7 Integration verification (Author ownership and access).
  `workflow/specs/stories/AUT-01-create-a-draft.md`,
  `workflow/specs/stories/AUT-02-configure-flaws.md`,
  `workflow/specs/stories/AUT-06-maintain-challenges.md` (AUT-06.1–06.3),
  `workflow/specs/stories/ACC-03-role-based-landing-and-navigation.md`
  (ACC-03.2, ACC-03.4–03.8), and the Decisions in
  `workflow/handoffs/50-learner-review-submit.md` inherited from PR #43 for
  write boundaries.
- **Tests:** unit (`tests/unit/author/`) for strict request, response and list
  query shapes, unknown fields and cursor/status validation. Cover the exact
  AUT-01.2 and AUT-02.2 messages; whitespace-only text and code; Text(120) and
  Text(4000) code-point bounds; and the code cap at 20,000/20,001 UTF-8 bytes
  after CRLF and lone-CR normalization, with multibyte text and ill-formed
  Unicode. Cover integer flaw count 1–5, 1–5 unique supported categories, the
  128 KiB raw body check before parsing (413), and PATCH requiring both
  expected versions and at least one field. jsdom component tests, following
  `tests/unit/learner/`, cover grouped create/edit/configuration forms, first
  invalid field focus, progress and outcome announcements, and disabled repeat
  saves. Cover confirmed failure retaining values; “Check save” resolving the
  same key and payload; “Cancel”; the AUT-02.4/AUT-06.3 invalidation dialog
  with both choices; and the published-revision notice. Cover conflict
  “Reload” and uncertain “Refresh” actions that reread without mutating;
  archived read-only state; list filter, empty, no-match, “Clear filter”,
  “Load more” and read-failure retry; and detail absence and read failure.
  Local Supabase integration (`tests/integration/author/`) uses real local Auth
  with Authors A and B, a Learner, a TA and an anonymous caller. Exercise the
  Route Handlers for 401, 403, 404, 400, 413 and 409. Exercise direct
  user-scoped database access: no direct table writes on Author tables,
  explicit function execution grants, function-level validation of every
  bound, and other-Author, Learner and TA denial of drafts and proposals.
  Cover create idempotency: a replay returns the recorded IDs, a changed
  payload returns 409 `IDEMPOTENCY_CONFLICT`, concurrent duplicates execute
  once, and keys are isolated per actor. Cover PATCH stale-version conflicts
  without changes, increments of both versions, and archived 409
  `INVALID_STATE`. A published challenge edit keeps its status and published
  pointer. An edit over an active proposal set clears the active generation
  and its decisions from `AuthorDraft` while keeping the historical set. Cover
  list order, status filter, filter-bound cursors, limit bounds, own rows only
  and exact `AuthorChallengeCard` fields. Insert proposal sets, published
  revisions and archived states through the superuser `pg` test harness only.
  Production-build e2e (`tests/e2e/author/`) covers keyboard draft creation
  through “Flaw configuration”, then list → detail → “Edit draft” → saved
  changes, at 320 CSS pixels without page-level horizontal scrolling. The
  orchestrator runs every database-backed check; specialists report them as
  unrun.
- **Config paths:** `vitest.integration.config.mts` (add `author` to the
  integration include glob).
- **Constraints:** Before writing Next.js code, read the installed
  `node_modules/next/dist/docs/` guides for Route Handlers, dynamic routes and
  forms or Server Actions. Add `GET`/`POST /api/v1/author/challenges` and
  `GET`/`PATCH /api/v1/author/challenges/[id]`. Pages and any Server Actions
  share one validated server contract in `src/server/author/`. Each protected
  entry point verifies the session and stored Author role, following
  `src/server/learner/access.ts`, and prevents cross-request caching. Replace
  the placeholder pages at `/author/challenges` (“My challenges”) and
  `/author/challenges/new` (“Create challenge”). Add
  `/author/challenges/[id]` (detail), `/author/challenges/[id]/edit` (“Edit
  draft”) and `/author/challenges/[id]/configuration` (“Flaw configuration”).
  Proposal preview, publication result and lifecycle controls are left to
  T-21–T-23. Reuse the shared vocabularies and schemas in `src/lib/learner/`.
  Move them to a role-neutral `src/lib/` module only without behaviour change.
  One client-safe validator owns Text(n) and code-cap rules for forms and
  server.

  Add a migration and regenerate `src/lib/supabase/database.types.ts`. Keep
  PR #43's write boundary: no direct `INSERT`/`UPDATE`/`DELETE` table grants.
  User-callable functions grant execution explicitly to `authenticated` and
  deny `PUBLIC`, `anon` and `service_role`, and validate every bound on direct
  calls. One function creates the challenge and its draft atomically (status
  `draft`, both versions 1). It records outcomes in a private ledger used only
  for Author challenge creation, keyed by actor and Idempotency-Key, with a
  fingerprint the function computes from its validated arguments. Another
  function applies a draft PATCH against the expected row and draft versions,
  serialized on the challenge row. It increments both versions and clears the
  active generation pointer. It never changes status or the published pointer
  and rejects archived challenges. Any accepted PATCH counts as an edit; the UI
  sends only changed fields and offers no save when nothing changed. Reads stay
  user-scoped: the list returns `AuthorChallengeCard` only. Detail returns
  `AuthorDraft`, with `proposals` from the active set and empty when the
  generation pointer is null. No T-20 path creates proposals, revisions or
  lifecycle changes, and no LLM or admin client is used. Map failures per
  INTEGRATION-SPEC §3. `fieldErrors` keys are request field names; server and
  client share exported message constants, and free-form text is never
  matched. 409 `VERSION_CONFLICT` covers stale versions and 409
  `INVALID_STATE` covers archived or in-progress duplicates. Account failures
  follow SYS-11 and ACC-03 without replaying a save.
- **Depends on:** T-02, T-03; spec PR for #80.
- **Status:** done

### T-21: Generate, preview and decide flaw proposals

- **Issue:** #82
- **Covers:** AUT-03.1–03.7. AUT-04.1–04.6. The “Generate proposals” action
  and its eligibility in AUT-02.1 and AUT-02.3 that T-20 left out. “Publish
  challenge” and hint generation belong to T-22; AUT-03.2's disabled
  publication action and AUT-04.4's hint invalidation apply once T-22 adds
  them. SYS-02.1–02.2, SYS-03.1–03.3, SYS-04.1–04.2, SYS-08.1–08.3, SYS-09,
  SYS-10.1–10.4 (the “Proposal generation” named use; proposal decisions stay
  user-scoped), SYS-11, SYS-12.1 (Author rows of private answers and grading
  material), SYS-14.3, SYS-17, SYS-18.2 and SYS-19 apply to the new Author
  reads, writes and UI. SEC-01.1–01.2, SEC-02.1–02.2, SEC-04.1–04.2,
  SEC-05.1–05.3 and SEC-06.1 for the `inject_flaws` caller and its
  persistence, reusing rather than rebuilding T-04's provider, accounting and
  limit enforcement.
- **Route:** high
- **Reads:** `workflow/specs/PRODUCT-SPEC.md` §3 Story index → Author,
  §4 Product decisions → Flaw proposals and answer keys, Hints and attempts,
  Challenge input and Shared vocabularies, and §5 Navigation and UI.
  `workflow/specs/TECHNICAL-SPEC.md` SYS-02 — Untrusted input and submitted
  code, SYS-03 — LLM boundary, SYS-04 — Shared building blocks, SYS-08 —
  Authorization at the data boundary, SYS-09 — Authentication with Cache
  Components, SYS-10 — Database enforcement and privileged access, SYS-11 —
  Authentication and authorization failures, SYS-12 — Record access and audit
  (Learner-facing challenge material and Private answers and grading
  material), SYS-14 — Delivery and database evolution (SYS-14.3), SYS-17 —
  Simple, accessible UI, SYS-18 — Resource use and SYS-19 — Test strategy.
  `workflow/specs/AI-SECURITY-SPEC.md` Attack surfaces (Author code and
  generated proposals), SEC-01 — Authorize and minimize model access, SEC-02 —
  Validate model output before use, SEC-04 — Bound SoC requests and usage,
  SEC-05 — Reserve and settle usage atomically and SEC-06 — Contain failures
  and keep diagnostics safe. `workflow/specs/INTEGRATION-SPEC.md` §1 Scope and
  contract conventions → Shared values and bounds and Pasted-code cap, §2 Domain
  model and publication lifecycle (challenges, challenge_drafts, proposal_sets,
  proposal_decisions) → SYS-12 decision: immutable published revisions and
  Code, proposals and locations, §3 API contracts → Transport, concurrency and
  errors, Shared response types (`AuthorDraft`, `CodeDiff`, `RevisionFlaw`)
  and Author surface (`POST /author/challenges/:id/proposals`, `PATCH
  /author/challenges/:id/proposals/:proposalId`, `GET
  /author/challenges/:id/preview`), §4 Server-only LLM contracts (shared
  envelope and Flaw injection: `operation: inject_flaws`), §6 Shared
  deterministic seed fixtures (Author A/B identities and C1/C2 ownership) and
  §7 Integration verification.
  `workflow/specs/stories/AUT-03-generate-flaw-proposals.md`,
  `workflow/specs/stories/AUT-04-preview-and-decide-flaws.md`,
  `workflow/specs/stories/AUT-02-configure-flaws.md` (AUT-02.1, AUT-02.3),
  `workflow/specs/stories/ACC-03-role-based-landing-and-navigation.md`
  (ACC-03.2, ACC-03.4–03.8), and the T-20 Decisions in
  `workflow/handoffs/81-author-drafts.md` that bind T-21.
- **Tests:** unit (`tests/unit/author/`) for strict generation, decision and
  preview request and response shapes: unknown fields, both expected versions,
  `decision: approved | rejected` only (never `pending`), UUID path IDs and a
  required `Idempotency-Key` UUID on POST. Cover the exact AUT-03 and AUT-04
  messages and the INTEGRATION-SPEC §3 code for every failure. Cover
  server-side assembly of the final candidate: retained edits applied in
  source order, final ranges shifted only by earlier retained edits, rejected
  replacements absent from code and key, trailing-LF and no-trailing-LF files,
  and a real working-to-flawed `CodeDiff` whose hunks reproduce both sides.
  Cover fake `inject_flaws` output that is rejected whole: wrong count,
  foreign category, duplicate keys, overlapping or out-of-range ranges,
  mismatched snippets, a trailing-LF or blank replacement and a candidate over
  the code cap. jsdom component tests, following `tests/unit/author/`, cover
  saved count, categories and difficulty above “Generate proposals”; the
  unsaved-edits message; pending state with repeat generation disabled; the
  replacement confirmation with both choices; arrival at “Proposal preview”
  with focus and announcement; each AUT-03.6 failure with “Try again” and
  “Back to configuration”; “Check generation” replaying the same key;
  per-proposal “Approve”/“Reject” with “Saving decision…”, focus kept on that
  proposal and decisions shown as text; the incomplete and all-rejected
  messages; “Preview final challenge” with focus on its heading; decision
  failure, uncertain and conflict states; absent proposals; preview read
  failure and retry; and inert rendering of script, event-handler,
  Markdown-link and remote-image text.
  Local Supabase integration (`tests/integration/author/`) uses real local
  Auth with Authors A and B, a Learner, a TA and an anonymous caller, and the
  fake provider. Exercise all three Route Handlers for 401, 403, 404, 400, 413,
  409, 422, 429, 502 and 504. Assert zero provider attempts and zero usage
  reservations for wrong-role, other-Author, forged-ID, archived and
  stale-version requests. Capture the fake request and assert the exact
  `inject_flaws` projection of the saved draft, with injected instructions
  kept as data. Verify the admin generation function is executable only by
  `service_role`, and that direct user-scoped writes to proposal sets,
  proposals, decisions and the generation pointer are denied. Verify a
  successful generation persists the set, proposals, pending decisions and
  pointer atomically. Verify a draft edit, regeneration or archive before
  completion leaves the newer state untouched, and a late result after expiry
  is never shown as successful. Cover a failed regeneration keeping the prior
  set and decisions, replays returning the recorded result without a second
  provider call, a changed payload returning 409 `IDEMPOTENCY_CONFLICT`,
  concurrent duplicates dispatching once, and a new key after a confirmed
  failure starting a new attempt. Cover invalid output followed by success,
  repeated invalid output (422), timeout and transport failure attempt counts
  under SEC-05. Cover decisions on the active set only: version increments,
  switching decisions, stale-set and stale-version conflicts that leave the
  newer decision intact, and denial for other Authors, Learners, TAs and
  direct calls. Cover the preview 409 for incomplete or all-rejected decisions
  and the exact assembled response, and check its diff against the database's
  `private.valid_revision_diff`. Scan responses and captured diagnostics for
  sentinel code and answer text under SEC-06.1. Replace
  `activateProposalSet()` in new tests with the real generation path; insert
  published and archived states through the superuser `pg` harness only.
  Production-build e2e (`tests/e2e/author/`) covers keyboard draft →
  “Generate proposals” → “Proposal preview” → approve and reject → “Preview
  final challenge” with the fake provider, at 320 CSS pixels without
  page-level horizontal scrolling. The orchestrator runs every database-backed
  check; specialists report them as unrun.
- **Config paths:** none; consume `src/server/llm/config.ts` unchanged and
  reuse T-20's `author` integration-suite inclusion.
- **Constraints:** Before writing Next.js code, read the installed
  `node_modules/next/dist/docs/` guides for Route Handlers, dynamic routes and
  forms or Server Actions. Add `POST
  /api/v1/author/challenges/[id]/proposals`, `PATCH
  /api/v1/author/challenges/[id]/proposals/[proposalId]` and `GET
  /api/v1/author/challenges/[id]/preview`, sharing validated contracts in
  `src/server/author/` with any page or Server Action. Each entry point
  verifies the session and stored Author role through
  `src/server/author/access.ts`, checks ownership and state, and prevents
  cross-request caching. Add “Generate proposals” on the T-20 configuration
  and detail pages, and “Proposal preview” at
  `/author/challenges/[id]/proposals`. Render code and diffs with the shared
  `src/components/code-diff.tsx`.

  Generation calls `src/server/llm/` (`createLlmBoundary`, operation
  `inject_flaws`) only after the stored-role, ownership, archived-state and
  expected-version checks; the caller supplies no snapshot, actor or
  accounting fields. Reuse T-04's admission, retries, deadlines and settlement
  and its operation idempotency, following the claim/fail/complete pattern of
  `src/server/ta/summaries.ts`. Add one admin-only database function for the
  SYS-10.3 “Proposal generation” named use, granted only to `service_role`
  and denied to `PUBLIC`, `anon` and `authenticated`. It revalidates the
  output against the captured snapshot. Serialized on the challenge row, it
  compares the captured row and draft versions and rejects archived
  challenges and expired operations. In one transaction it inserts the set,
  proposals and pending decisions and moves the generation pointer, never
  deleting historical sets or touching publication. No transaction spans a
  provider call. Decisions use a user-callable function granted only to
  `authenticated`, with no direct table grants (PR #43's write boundary). It
  accepts only a proposal in the active set under both expected versions,
  never edits proposal text, and keeps the active set. A successful
  generation and every accepted decision each increment both rowVersion and
  draftVersion; neither changes status or the published pointer. Failed,
  replayed or stale generations change no versions.

  Preview is a user-scoped read that assembles retained proposals on the
  server with `assembleCandidate` and returns 409 `INVALID_STATE` for
  incomplete or all-rejected decisions. No server code derives a real
  working-to-flawed diff yet: add one client-safe derivation in `src/lib/`
  that builds hunks from the retained replacement ranges, with no new
  dependency, so T-22 reuses it for `revision_answers`. Its output must pass
  `private.valid_revision_diff`. Never trust model or client diff text or
  final line numbers. `AuthorDraft.proposals` lists the active set by source
  order with persisted IDs only, never the model-local `key`. Add a migration
  and regenerate `src/lib/supabase/database.types.ts`. Errors and diagnostics
  follow SEC-06: no prompts, code, answer text or provider bodies. All tests
  use the fake provider; this task does not enable live SoC or change provider
  settings.
- **Depends on:** T-04, T-05, T-20
- **Status:** done

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
- **Status:** blocked

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
- **Status:** done

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
- **Status:** done
