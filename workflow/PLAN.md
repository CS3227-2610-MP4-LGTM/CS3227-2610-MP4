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
- **Status:** todo

## Learner

## Author

## TA
