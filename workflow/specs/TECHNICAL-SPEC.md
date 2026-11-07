# LGTM technical specification

## 1. Purpose, boundaries and assumptions

This specification defines system requirements, including foundations not yet implemented.
Account journeys, messages, destinations and navigation belong to ACC-01–ACC-03.
[Spec conventions](README.md) define document boundaries and identifiers. Domain models,
contracts and LLM schemas belong to [INTEGRATION-SPEC.md](INTEGRATION-SPEC.md). AI controls
and limits belong to [AI-SECURITY-SPEC.md](AI-SECURITY-SPEC.md).

- **ASM-01:** This course deployment has one shared learning space, without cohorts,
  institutions or TA assignments.
- **ASM-02:** Hosted email sending cannot reach testers; access cannot depend on email
  receipt.

## 2. Architecture

### SYS-01 — Runtime and server/client boundary

LGTM uses Next.js App Router on Vercel, with Supabase Postgres and Auth. Protected
application data access and business authorization belong on the server; Client Components
provide interactivity. Browser Supabase access remains subject to
[SYS-10](#sys-10--database-enforcement-and-privileged-access).

- **SYS-01.1:** Build/import checks reject client imports of server-only modules; browser
  bundles and serialized responses contain no server secrets or privileged clients.

### SYS-02 — Untrusted input and submitted code

Untrusted server input must be validated with Zod before side effects. Submitted code is
inert data for display and AI analysis, never execution.

- **SYS-02.1:** Malformed, missing, oversized and unexpected fields fail validation
  without writes or provider requests. Bounds belong to each contract; account bounds are
  in [SYS-06](#sys-06--profile-provisioning-and-immutable-role).
- **SYS-02.2:** Script/HTML payloads in code, diffs, names and AI output remain inert;
  submitted code cannot invoke processes, interpreters, builds, imports or executable
  network activity.

### SYS-03 — LLM boundary

All SoC calls, including flaw injection, grading and summaries, must pass through the
server-only boundary at `src/server/llm/`, under [SYS-13](#sys-13--environment-isolation).

- **SYS-03.1:** Call-site review finds no SoC invocation outside that boundary or client
  credential.
- **SYS-03.2:** The fake provider deterministically exercises success, malformed output
  and failure without network access or a live key.
- **SYS-03.3:** Only schema-valid output reaches persistence or consumers; schemas belong
  to `INTEGRATION-SPEC.md`.

### SYS-04 — Shared building blocks

Data access, auth checks and the code/diff view shared by all three roles must follow SRP
and DRY.

- **SYS-04.1:** Role entry points share policy/data-access interfaces enforcing
  [SYS-12](#sys-12--record-access-and-audit).
- **SYS-04.2:** Each role uses the same code/diff rendering building blocks, so shared
  rendering and accessibility fixes apply to all three.

## 3. Authentication and authorization

### SYS-05 — Credentials and session lifecycle

Supabase Auth provides email/password sign-up and sign-in. Email confirmation, password
reset, email-link sign-in, OAuth, anonymous sign-in and MFA are excluded under ASM-02.

- **SYS-05.1:** A valid new account establishes a session without receiving email or an
  email callback.
- **SYS-05.2:** Server validation requires a valid email and the configured six-character
  password minimum, without composition rules. Supabase manages passwords; the application
  never trims, logs or stores them in profiles.
- **SYS-05.3:** Invalid credentials establish no session and do not distinguish unknown
  email from incorrect password.
- **SYS-05.4:** Sign-out uses local session scope, clears current-browser auth cookies and
  revokes its refresh token without affecting other devices. Provider failure is reported
  as failure, with local credentials still cleared.
- **SYS-05.5:** Protected requests from the signed-out browser fail. Copied access JWTs
  remain subject to expiry; immediate revocation is not promised.

### SYS-06 — Profile provisioning and immutable role

Each Supabase account has exactly one profile containing its user ID, display name and one
role: Learner (`learner`), Author (`author`) or TA (`ta`). Any role may be chosen at
creation. Self-selected TA is an accepted course risk, contained by
[SYS-12](#sys-12--record-access-and-audit).

- **SYS-06.1:** Account/profile creation is atomic, including direct Auth sign-up: exactly
  one matching profile persists, or a database-side provisioning failure rolls back
  account creation.
- **SYS-06.2:** Server Zod validation requires an exact allowed role and a trimmed,
  nonblank display name of at most 80 characters. Database provisioning enforces
  equivalent constraints against direct Auth requests; missing/invalid fields cannot
  create an account/profile pair.
- **SYS-06.3:** Creation metadata supplies initial validated fields only. Later role
  decisions use the stored profile, never client input, cookies, JWT application-role
  claims or editable metadata.
- **SYS-06.4:** Application endpoints, direct database requests and metadata edits cannot
  let users insert, delete, replace or change profile identity/role. Retrying sign-up
  cannot change a role.
- **SYS-06.5:** Integration tests cover all roles, duplicates, invalid/missing fields,
  provisioning rollback and attempted role changes through application, Auth and database
  APIs.

### SYS-07 — SSR cookies and proxy refresh

Sessions refresh in `proxy.ts` before rendering, using the documented Supabase SSR cookie
integration. Proxy handles session transport;
[SYS-08](#sys-08--authorization-at-the-data-boundary) owns authorization.

- **SYS-07.1:** Pages, Server Actions and Route Handlers that consume sessions pass
  through refresh handling. Integration tests confirm refreshed credentials reach both
  server reads and the browser, with no refresh loop; static assets need not participate.
- **SYS-07.2:** Auth responses preserve the SSR adapter's cache-prevention headers;
  response checks confirm cookie-writing responses cannot enter a shared CDN cache.
- **SYS-07.3:** Hosted auth cookies require Secure, host scope, path-wide access and
  SameSite=Lax. HttpOnly is not required for browser SSR auth; browser tests cover refresh
  and deletion.

### SYS-08 — Authorization at the data boundary

Authentication, stored role and record access must be checked next to every protected
server read/mutation. Proxy decisions, layouts, client state and hidden UI grant no
access.

- **SYS-08.1:** Protected operations verify identity with Supabase `auth.getUser()` and
  load its profile; an unverified `getSession()` result or decoded cookie is insufficient.
- **SYS-08.2:** Every Server Action, Route Handler and data-access entry point enforces
  [SYS-12](#sys-12--record-access-and-audit), including direct invocation without
  navigation or proxy headers.
- **SYS-08.3:** Tests independently vary identity, role and record ID; forbidden requests
  expose no protected data and cause no write or LLM call.

### SYS-09 — Authentication with Cache Components

Authorization results, profiles and protected responses must not be cached across
requests, preventing stale permissions and cross-account reuse in the auth foundation.

- **SYS-09.1:** Session-dependent rendering sits behind Suspense; production builds with
  Cache Components enabled and includes no user data in the prerendered static shell.
- **SYS-09.2:** Protected reads and role decisions use no `use cache`, `use cache: remote`
  or `use cache: private` scopes; render-pass deduplication is permitted.
- **SYS-09.3:** Browser tests cover account switching/sign-out during navigation, prefetch
  and reload; prior account data and privileges do not survive auth transitions.

### SYS-10 — Database enforcement and privileged access

Every application table must have RLS, denying access by default. Explicit grants and
policies enforce [SYS-12](#sys-12--record-access-and-audit), including direct database API
requests.

- **SYS-10.1:** Schema checks verify RLS, no automatic exposure of new tables, no
  ungranted operations and no anonymous access to application records. They also
  verify the database function and privilege restrictions in SYS-10.3.
- **SYS-10.2:** User-scoped clients are the default. Policies use stored profile roles;
  own-profile reads avoid recursion, and views/functions preserve record/field
  restrictions.
- **SYS-10.3:** The server-only admin client accesses the database only through
  server-only database functions, each dedicated to one named use below and
  executable only by the admin role. The admin role has no direct table or
  column privileges. Each function performs its writes atomically, creating a
  parent and all its children in one call. Author edits and proposal decisions
  remain user-scoped under [SYS-12](#sys-12--record-access-and-audit).
  Call-site tests/review verify each authorization precondition before privileged access.

| Named use | Authorization precondition | Permitted access |
| --- | --- | --- |
| Submission grading | Verified Learner owns the persisted submission eligible for grading. | Read only its private challenge grading context and never return it. Create and transition its grading runs, create its rule-based review flags, and persist its validated original AI grade. |
| Proposal generation | Verified Author owns the editable challenge. The result passes [SEC-02](AI-SECURITY-SPEC.md#sec-02--validate-model-output-before-use) validation against the captured draft snapshot. | Persist the proposal set, its proposals and their pending decisions together with the draft's active-generation pointer. |
| Publication | Verified Author owns a publishable draft whose version is unchanged. Hints pass [SEC-02](AI-SECURITY-SPEC.md#sec-02--validate-model-output-before-use) and [SEC-03](AI-SECURITY-SPEC.md#sec-03--protect-learner-facing-hints-and-feedback) validation. | Commit the [publication transaction](INTEGRATION-SPEC.md#sys-12-decision-immutable-published-revisions), including its hints. |
| TA performance summary | Verified TA requests a summary for a learner in moderation scope. Input comes from authorized data and output is validated. | Persist the summary and its evidence together. |
| AI usage accounting | Verified account is authorized for the AI operation; reservations pass budget checks and settlements match a server-issued operation/reservation. | Reserve/account for that operation's usage against the server-derived account; return only permitted usage fields. |
| Post-submission cached hints | Verified Learner owns a completed submission for the exact challenge and flaw being requested. | Read its cached hint and return only the approved learner-facing hint schema, excluding private answer keys, annotations and prompts. |

- **SYS-10.4:** All unlisted admin use is denied. `AI-SECURITY-SPEC.md` and
  `INTEGRATION-SPEC.md` may extend this register through a merged spec PR updating this
  section; every entry must name its permitted access and authorization precondition.
  Additional AI-material persistence requiring admin access needs such an entry first. The
  database provisioning hook in [SYS-06](#sys-06--profile-provisioning-and-immutable-role)
  is privileged only for initial profile creation, with no public executable entry; it
  grants no general admin-client permission.

### SYS-11 — Authentication and authorization failures

Access fails closed; no role is invented and no profile is repaired from request metadata.

- **SYS-11.1:** Missing, forged or unrefreshable expired sessions are unauthenticated:
  HTTP data endpoints return 401; pages use the account stories' sign-in destination
  without protected content.
- **SYS-11.2:** Verified accounts with missing profiles or invalid stored roles receive
  403 on HTTP data endpoints, without default roles or automatic profile creation.
- **SYS-11.3:** Client/metadata role tampering never changes the effective role;
  unauthorized operations and ID tampering receive 403 on HTTP data endpoints.
- **SYS-11.4:** Auth/profile service outages produce 503 on HTTP data endpoints without
  cached-identity fallback or side effects. Other server entry points preserve these
  categories; tests inject each failure, while stories own presentation and recovery
  navigation.

## 4. Data ownership

### SYS-12 — Record access and audit

Unlisted access is denied. TAs moderate the shared space in ASM-01, without account or
challenge administration. Record structures belong to `INTEGRATION-SPEC.md`.

| Record kind | Read rule | Write rule |
| --- | --- | --- |
| Accounts and profiles | Each account reads its own. TAs additionally read learner IDs/display names needed for moderation, never learner emails or Auth account records. | Initial creation under [SYS-06](#sys-06--profile-provisioning-and-immutable-role) only; no account/profile editing or deletion. |
| Learner-facing challenge material | Owning Author, including drafts; Learners read published material and their historical submission material; TAs read published material and material attached to submissions. | Authors create/change only their own challenges; ownership cannot be reassigned. |
| Private answers and grading material | Owning Author; TAs for published challenges or existing submissions; authorized server grading reads only the relevant context. Learners cannot directly read hidden solutions/annotations. | Owning Author only, subject to historical preservation below. |
| Submissions | Owning Learner and TAs, including after challenge unpublishing/archiving. Authors have no access. | Learners create their own against published challenges; submitted content and ownership are immutable, with no user deletion. |
| Original AI grades | Owning Learner and TAs; Authors have no access. | Authorized server grading inserts only; no user update/delete. |
| Grade overrides | Owning Learner and TAs, including history. | TAs append only, preserving the AI grade and recording verified actor, server time, replacement assessment and nonblank reason. Corrections append another override. |
| Rule-based review flags | Owning submission's Learner and TAs; Authors have no access. | Authorized server rule evaluation creates flags bound to the submission; users cannot forge, edit or delete them. |
| Learner-raised review flags | Owning submission's Learner and TAs; Authors have no access. | Learners create flags only on their own completed submissions; existing flags are immutable. |
| TA flag resolutions | Owning submission's Learner and TAs. | TAs append resolution/correction records with verified actor, server time, disposition and nonblank reason; flags and resolution history remain intact. |
| Cached per-flaw hints | Owning Author and moderating TAs; Learners receive only approved hint content for a flaw in their own completed submission. | Authorized server generation creates schema-valid hints for the associated challenge/flaw; users cannot alter the cache. |
| TA performance summaries | TAs within moderation scope only, including summaries of learner blind spots; no Learner/Author access. | Authorized server generation persists schema-valid summaries scoped to permitted learner data; users cannot edit generated content. |
| AI usage records | Each account reads only its own usage/budget fields, excluding private prompts, keys and other accounts' data. | Authorized server accounting alone reserves/settles usage and appends usage events; users cannot edit, delete or reset accounting. |

Challenge edits, unpublishing and archiving must preserve a past submission's code, answer
key and original grade. Its Learner retains access to past submissions and permitted
feedback; this does not grant answer-key access. `INTEGRATION-SPEC.md` chooses versioning
versus locking published challenges. TA overrides affect the effective grade under
SYS-12.3.

- **SYS-12.1:** Integration tests exercise every record rule through server entry points
  and direct user-scoped database access, with two users per relevant role and an
  anonymous caller.
- **SYS-12.2:** TA responses, joins, exports and summary inputs omit learner email fields;
  direct profile queries cannot expose emails through broad row grants.
- **SYS-12.3:** Override/resolution tests reject forged actors/times and blank reasons,
  preserve originals and concurrent audit entries, and apply the latest server-ordered
  entry deterministically, including timestamp ties.
- **SYS-12.4:** Tests reject forged submission ownership/unpublished creation and verify
  historical code, answer key, original grade and Learner access survive
  edits/unpublishing/archiving.
- **SYS-12.5:** Tests deny premature/cross-submission hints, forged flags/resolutions,
  non-TA summaries and user resets of usage; cache/summary responses exclude private
  source fields.

## 5. Environments and delivery

### SYS-13 — Environment isolation

Local development and test/CI use local Supabase and fake AI. Vercel Preview uses
`lgtm-dev`; Production uses the separate `lgtm-prod` project and credentials.

- **SYS-13.1:** Local/test/CI rejects non-loopback Supabase and live AI before network
  access; CI holds no hosted database or SoC key.
- **SYS-13.2:** Hosted settings review verifies separate projects/keys; users, sessions
  and records cannot cross environments.
- **SYS-13.3:** Provider selection is explicit via
  [SYS-15](#sys-15--configuration-and-hosted-auth): local/test/CI always uses fake, hosted
  development defaults to fake, and hosted live use requires
  [SYS-18](#sys-18--resource-use).

### SYS-14 — Delivery and database evolution

Hosted migrations run only through deployment workflows, before application build/deploy.

- **SYS-14.1:** Development deploys on `master` pushes or manual runs restricted to
  `master`, through GitHub `development` to the Preview alias. Production requires a `v*`
  tag reachable from `master` and GitHub `production` approval. Vercel Git deployments
  remain disabled.
- **SYS-14.2:** Workflow review verifies environment-scoped migration credentials and
  failure stopping deployment; later build/deploy failure does not roll migrations back.
  Migrations remain compatible with the previously deployed application.
- **SYS-14.3:** Merged migrations are immutable; fresh local checks apply
  migrations/seeds, lint the database and verify committed generated types match the
  schema.
- **SYS-14.4:** PRs to and pushes on `master` run lint, type checking, unit tests,
  production build and fresh-database checks; aggregate `verify` must pass before merge.
  See [SYS-19](#sys-19--test-strategy) for broader coverage.

### SYS-15 — Configuration and hosted Auth

Validate configuration on use without printing values. The spec introducing the first AI
feature adds any SoC settings beyond the API key; names and scopes must be recorded here.

| Name | Scope | Environments and purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Local, test/CI, hosted development/production; Supabase API target. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Same environments; user-scoped access. |
| `SUPABASE_SECRET_KEY` | Server-only secret | Environments using approved privileged operations; local keys only in local/test/CI. |
| `APP_ENV` | Server-only | Local, test/CI, hosted development/production; isolation classification. |
| `AI_PROVIDER` | Server-only | Same environments; provider selection under [SYS-13](#sys-13--environment-isolation). |
| `SOCLAAS_API_KEY` | Server-only secret | Hosted environments selecting live SoC only. |
| `SUPABASE_DB_URL` | GitHub environment secret | Development/production deployment workflows; migrations. |
| `VERCEL_TOKEN` | GitHub environment secret | Development/production deployment workflows; deployment authentication. |
| `VERCEL_ORG_ID` | GitHub environment variable | Development/production deployment workflows; target organisation. |
| `VERCEL_PROJECT_ID` | GitHub environment variable | Development/production deployment workflows; target project. |

- **SYS-15.1:** Missing/invalid settings produce named errors, without values or
  environment fallback. Unconfigured builds may succeed; operations requiring
  configuration fail closed.
- **SYS-15.2:** Hosted Auth settings enforce
  [SYS-05](#sys-05--credentials-and-session-lifecycle): sign-up/email-password enabled,
  confirmations/excluded providers disabled and password policy aligned; SMTP is not
  required.
- **SYS-15.3:** Site URL/redirect allowlists contain only approved environment-specific
  application origins, without broad wildcards; local Auth permits development/Playwright
  origins only.
- **SYS-15.4:** Settings review and refresh tests verify local/hosted rotation enabled,
  one-hour JWT lifetime and ten-second reuse interval; local config alone does not verify
  hosted settings.

## 6. Non-functional requirements

### SYS-16 — Security baseline

Transport, secrets and errors must protect credentials and private data.

- **SYS-16.1:** Hosted traffic uses HTTPS; checks find no secrets in versioned content,
  client payloads, logs or errors, including injected failures.
- **SYS-16.2:** Server Actions retain origin checks; custom cookie-authenticated mutations
  reject untrusted origins. Redirects accept only validated same-origin destinations.
- **SYS-16.3:** Login/signup retain Supabase rate limiting; throttling/transient-failure
  tests cannot bypass validation or authorization. AI abuse controls belong to
  `AI-SECURITY-SPEC.md`.

### SYS-17 — Simple, accessible UI

Shared UI must support keyboard use, labels, readable contrast and phone width; stories
own screen behavior.

- **SYS-17.1:** Keyboard-only checks complete account journeys with visible focus, no
  traps and accessible input/error associations.
- **SYS-17.2:** Contrast checks meet 4.5:1 for normal text and 3:1 for large text and
  meaningful control/focus indicators.
- **SYS-17.3:** At 320 CSS pixels, account screens need no page-level horizontal
  scrolling; code/diff regions may scroll with labels and keyboard access without
  displacing controls.

### SYS-18 — Resource use

SoC request/token/concurrency budgets, enforcement and AI security tests belong to
`AI-SECURITY-SPEC.md`.

- **SYS-18.1:** Live use is blocked until limits are specified/enforceable; fake tests
  verify bounded input/output, timeouts, retries and concurrency without live calls.
- **SYS-18.2:** Provider failure/invalid output leaves no successful AI result; grading
  retries cannot duplicate original grades.

### SYS-19 — Test strategy

Use Vitest unit tests, local Supabase integration and Playwright e2e under
[SYS-13](#sys-13--environment-isolation).

- **SYS-19.1:** Unit tests cover validation/policies/providers; integration tests use real
  local Auth, provisioning, grants, RLS and audit invariants, rather than mocked database
  responses alone.
- **SYS-19.2:** Playwright covers all-role account journeys, direct protected access,
  refresh, sign-out, account switching and failures with a Cache Components production
  build.
- **SYS-19.3:** CI runs all three suites using local Auth/API services; Postgres-only
  migration checks do not replace Auth integration.
- **SYS-19.4:** Each active criterion has test or explicit review/settings evidence;
  `bun run verify` passes, with Playwright/database/Auth checks reported separately when
  not included.

### SYS-20 — Code quality

Use TypeScript, Zod contracts, generated database types, Bun and the Node version in
`.node-version`.

- **SYS-20.1:** Lint/type checking/build pass without new failure suppressions; database
  access uses current generated types and external data crosses validated boundaries.
- **SYS-20.2:** Review verifies [SYS-04](#sys-04--shared-building-blocks), explains new
  dependencies and accurately reports failed/unrun checks.

## 7. Out of scope

User journeys/UI details, domain/API/LLM schemas and AI threats/limits belong to the
documents named in section 1. Additional identity/recovery methods are excluded by
[SYS-05](#sys-05--credentials-and-session-lifecycle). Role changes, account
editing/deletion, TA invitations/approval, multi-role accounts, cohorts/tenancy,
submitted-code execution, Git integrations and background schedules are excluded.
