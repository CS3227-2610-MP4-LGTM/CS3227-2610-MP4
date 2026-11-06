---
layout: default
title: Developer Guide
nav_order: 2
---

# LGTM Developer Guide

## Git workflow

We use the forking workflow. The team repository,
[CS3227-2610-MP4-LGTM/CS3227-2610-MP4](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4),
is `upstream`; each member works in their own fork, which is `origin`.
Nobody pushes to `upstream` directly; all changes arrive through PRs.

One-time setup, after forking on GitHub:

```bash
git clone git@github.com:<your-username>/CS3227-2610-MP4.git
cd CS3227-2610-MP4
git remote add upstream https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4.git
git remote set-url --push upstream no_push   # guard against pushing upstream
```

For each change:

```bash
git fetch upstream
git switch -c <type>/<issue>-<slug> upstream/master
# ...work, commit with Conventional Commits...
git push -u origin <type>/<issue>-<slug>
gh pr create --repo CS3227-2610-MP4-LGTM/CS3227-2610-MP4 --base master
```

To keep your fork's `master` current:

```bash
git switch master
git pull --ff-only upstream master
git push origin master
```

## Database (Supabase)

LGTM stores its data in Supabase (Postgres, Auth and Storage). Development
and tests run against a local Supabase stack in Docker; nobody connects to a
hosted project from their machine.

### Hosted projects

The `CS3227-2610-MP4-LGTM` organisation has two projects, both in Singapore
(Southeast Asia):

| Project | Purpose |
| --- | --- |
| `lgtm-dev` | Shared development and preview deployments |
| `lgtm-prod` | Production |

Both have the Data API enabled, **do not** expose new tables automatically,
and enable row level security (RLS) on new tables automatically. The local
stack mirrors these settings (`auto_expose_new_tables = false` in
`supabase/config.toml`, plus the `enable_rls_on_new_tables` migration), so a
migration that works locally behaves the same way on hosted projects.

Humans and deployment workflows apply migrations to hosted projects. Agents use
local Supabase only. The denied-command lists live in
[Codex guardrails](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.codex/rules/guardrails.rules) and
[Claude settings](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.claude/settings.json), covering commands such as `link`,
`db pull`, `migration repair` and `inspect` through plain, bunx and npx invocations.

CLI 3.0.0 defaults `db reset`, `db lint` and `gen types --lang typescript` to
local targets. These forms, local stack commands, `migration new`,
`functions new/serve`, and all repository `db:*` scripts remain available,
including `bun run db:reset` and `bun run db:types`.

Codex matches literal prefixes: for reset, lint and type generation, hosted-target
flags are blocked only as separate tokens immediately after the subcommand.
Attached values (`gen types --remote=project`), flags after other arguments
(`gen types --lang typescript --remote`), and global options before blocked
prefixes remain gaps. Claude also matches trailing and attached hosted flags.
These limits never authorize hosted access.

### Prerequisites

Docker Desktop (or another Docker-compatible runtime) must be running. The
Supabase CLI is a pinned dev dependency, so `bun install` provides it; use the
`db:*` scripts or `bunx supabase`, not a globally installed CLI.

### First-time setup

```bash
bun run db:start
```

The first start downloads the Supabase images and takes a few minutes. Then
add the local stack's values to `.env.local` in the repository root:

```bash
bunx supabase status -o env \
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
  --override-name auth.publishable_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  --override-name auth.secret_key=SUPABASE_SECRET_KEY \
  | grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|SUPABASE_SECRET_KEY)=' \
  >> .env.local
```

| Variable | Exposed to | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server | Public key; queries are subject to RLS |
| `SUPABASE_SECRET_KEY` | Server only | Bypasses RLS |

Never prefix `SUPABASE_SECRET_KEY` with `NEXT_PUBLIC_` and never commit
`.env*` files.

### Scripts

| Command | What it does |
| --- | --- |
| `bun run db:start` | Starts the local stack; Studio is at http://127.0.0.1:54323 |
| `bun run db:stop` | Stops the stack, keeping its data |
| `bun run db:status` | Shows URLs and keys of the running stack |
| `bun run db:reset` | Recreates the local database from `supabase/migrations/` and `supabase/seed.sql` |
| `bun run db:types` | Regenerates `src/lib/supabase/database.types.ts` from the local database |

### Changing the schema

1. Create a migration: `bunx supabase migration new <name>`.
2. Write the SQL in the new file under `supabase/migrations/`:
   - RLS is enabled automatically on new `public` tables, but no policies
     exist until you add them. Add a policy for each role that needs access.
   - New tables are not exposed to the Data API. Grant only what each role
     needs, for example
     `grant select, insert on public.reviews to authenticated;`. This
     applies to `service_role` too, so the admin client also needs grants.
   - Keep helper functions that should not be callable over the Data API in
     the `private` schema.
3. Apply it locally with `bun run db:reset`.
4. Regenerate types with `bun run db:types` and commit the migration and the
   types together. CI applies every migration to a fresh database, runs
   `supabase db lint`, and fails if the committed types are stale.

Never edit a migration that has been merged; add a new one instead.

### Explicit grants for domain and LLM migrations

New `public` tables receive no default grants for `anon`, `authenticated`
or `service_role`. The
[auth-core migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261106151000_auth_core.sql)
enforces this alongside automatic RLS. Every domain-schema and LLM migration
must grant its required operations explicitly. This includes `service_role`
for the approved admin operations in
[SYS-10.3](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-10--database-enforcement-and-privileged-access):
bypassing RLS does not supply table privileges. Explicit grants do not
authorize any additional admin-client use.

### Clients

| Import | Use in | Acts as |
| --- | --- | --- |
| `@/lib/supabase/client` | Client Components | The signed-in user (RLS applies) |
| `@/server/supabase/server` | Server Components, Server Functions, Route Handlers | The signed-in user, read from request cookies |
| `@/server/supabase/admin` | Server code, after authorizing the caller | Service role (bypasses RLS) |

Prefer the user-scoped clients so RLS enforces access. Use the admin client
only for the named SYS-10.3 operations after their authorization preconditions;
the application auth flow never uses it.

### Auth foundation

The server-only helpers in
[`src/server/auth/`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/auth/service.ts)
provide `signUp`, `signIn` and local-scope `signOut`. Sign-up validates a
request against
[SYS-05's credential rules](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-05--credentials-and-session-lifecycle)
and
[SYS-06's profile rules](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-06--profile-provisioning-and-immutable-role).
A private trigger provisions the profile atomically with the Auth account.

Auth helpers return categories and field-error codes without UI copy or raw
provider diagnostics. They distinguish authenticated success, confirmed
creation without a session, rejection, throttling and service unavailability.
Sign-out clears current-browser auth cookies even when the provider cannot
confirm local-scope revocation; it reports that failure separately.

[`getAccount` and `readProfile`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/auth/account.ts)
verify identity with `auth.getUser()` and read the stored `public.profiles`
role. Failure categories map to HTTP 401, 403 and 503 through `authErrorResponse`.

In later migrations, RLS policies needing the caller's role must read
`private.profile_roles` (own row only), not `profiles`, to avoid policy
recursion. This constrained projection is populated by the provisioning trigger
and bound to the immutable public profile by its `(id, role)` foreign key.

[`src/proxy.ts`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/proxy.ts)
refreshes session transport and forwards refreshed cookies to server reads,
preserving SSR cache-prevention headers. Protected operations still authorize
at their own server boundary.

### Auth tests and settings

`bun run test` runs unit tests without Supabase. Start the local stack before
running the separate integration suite:

```bash
bun run db:start
bun run test:integration
```

Integration tests run in Vitest's Node environment against real local Auth,
API and Postgres services. The `pg` dev dependency performs schema checks;
fixtures exercise provisioning, immutable roles, grants/RLS, profile visibility
and refresh behavior. Tests capture local CLI configuration in memory and
clean up fixture accounts. Throttling failures are injected rather than
exhausting the provider limit. CI's `integration` job runs this suite with local
Auth and is required by the `verify` job; local `bun run verify` still runs
lint, typecheck, unit tests and build. CI uses Node 24 from `.node-version`.

Local `auth.rate_limit.sign_in_sign_ups` is 300 per five minutes per IP to
support repeated integration/fix-round runs. This does not change hosted
limits. After changing local Auth configuration, run `bun run db:stop` then
`bun run db:start` to reload it; stopping preserves local data.

Hosted settings require a human dashboard review under
[SYS-15.2–15.4](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-15--configuration-and-hosted-auth),
including the authoritative
[SYS-05 credential policy](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-05--credentials-and-session-lifecycle).
Local configuration and passing integration tests do not verify hosted settings.

## Deployment

| Workflow | Trigger | GitHub environment | What it deploys |
| --- | --- | --- | --- |
| `deploy-dev.yml` | Push to `master` or manual run | `development` (only allows `master`) | Vercel Preview with the development alias |
| `deploy-prod.yml` | Push of a `v*` tag | `production` (waits for approval) | Vercel Production; the tagged commit must be on `master` |

Cut releases by creating a `v*` tag through a GitHub release targeting `master`.

Migrations apply first, then the application builds and deploys; a later
failure does not roll migrations back.

Configure these secrets and variables in each GitHub environment:

| Kind | Name | Purpose |
| --- | --- | --- |
| Secret | `VERCEL_TOKEN` | Token scoped to the Vercel project; authenticates the Vercel pull, build, deploy and development alias steps |
| Secret | `SUPABASE_DB_URL` | Database connection string for that environment's migration step |
| Variable | `VERCEL_ORG_ID` | Selects the Vercel organisation |
| Variable | `VERCEL_PROJECT_ID` | Selects the Vercel project |

In Vercel, configure `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_ENV` and
`AI_PROVIDER` for Preview and Production. Preview uses `lgtm-dev`;
Production uses `lgtm-prod`. Keep `SUPABASE_SECRET_KEY` server-only.

`vercel.json` selects Singapore (`sin1`), disables Git-triggered deployments,
and configures no cron jobs.

## Product site (GitHub Pages)

The product page is `docs/index.md`. Keep its description of LGTM and its
three roles aligned with [the README](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/README.md), which is the source of
truth for product information.

GitHub Pages builds the site with its built-in Jekyll build and the
[Just the Docs remote theme](https://github.com/just-the-docs/just-the-docs/releases/tag/v0.12.0),
pinned to `v0.12.0` with `color_scheme: dark` in `docs/_config.yml`. The
`jekyll-remote-theme` plugin loads the theme; `jekyll-relative-links` converts
relative Markdown links to their published URLs. No Gemfile, application
build or custom deployment workflow is needed.

Both `docs/index.md` and `docs/DeveloperGuide.md` are rendered on the site.
Their front matter sets `layout: default`, a navigation `title` and
`nav_order` (1 for the product page, 2 for the guide). Use relative Markdown
links within `docs/` so they work on GitHub and the site; use full GitHub URLs
for links to repository files outside `docs/`.

{% raw %}
In any `docs/` Markdown, wrap literal `{{` and `{%` in
`{% raw %}`...<code>&#123;% endraw %&#125;</code>, even inside code blocks;
otherwise Jekyll may silently drop them or break the build.
{% endraw %}

After the site files reach `master`, a repository maintainer must configure
**Settings → Pages → Build and deployment**:

1. Set **Source** to **Deploy from a branch**.
2. Set **Branch** to **master** and the folder to **/docs**.
3. Click **Save**.

These are repository settings, not options in `_config.yml`. See GitHub's
[publishing source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
Subsequent changes to `docs/` on `master` trigger GitHub's Pages build. Use the
published URL shown in Pages settings. Do not add a `.nojekyll` file, which
would bypass Jekyll processing.

## Agent workflow

Start feature work in a human-led main session with
[sdd-orchestrate](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.agents/skills/sdd-orchestrate/SKILL.md).
The orchestrator routes work, checks gates itself and maintains the
feature handoff. Specialists return evidence, never write their own handoffs
or spawn more agents. Humans own commits and PRs.
After each stage, the orchestrator records the agent's rollout token total
in the handoff (or `unavailable`), and at close-out records its own session total.

Low handles copy, styling, docs and comments without behaviour changes in the
main session, with targeted checks and no handoff. Standard handles behaviour
on existing foundations: main-session tests and implementation, independent
reviewer, then main-session docs. High uses every specialist for auth/session/
role work, database enforcement, privileged access, AI/SEC work or CI/deploy
changes. The planner proposes routes; actual changes can escalate them. Only
a human can downgrade with a recorded reason.

The loop is Ready → Plan → Tests → Implement → Review → Docs → Close-out.
G1 approves and commits the plan in the feature's own PR; G2 reads and commits
failing acceptance tests before code; G3 resolves blocked work or decisions;
G4 runs `bun run verify` and `bun run test:e2e`, commits, logs and opens the PR.
Existing tasks skip planning. Agent checks use targeted tests, lint and
typecheck because full verify is unreliable inside agent sessions. Tests use
local Supabase and the fake LLM provider. The orchestration skill owns the
gate messages, fix-round limit and human commit sequence.

This uses **orchestrator–subagent** coordination for the loop and
**generator–verifier** coordination between implementer and reviewer. On high,
correctness and security reviewers run in parallel and write nothing. Each
gets fresh context without the parent conversation or handoff, so findings
come from code and tests. Before and after reviews, the orchestrator compares
tree hashes: a sandbox label or a report cannot establish that no files
changed. A mismatch invalidates the review and stops for a human.

Every task's Reads names exact spec headings and story files. Each specialist
skill adds its fixed reading set; agents extract those sections rather than
loading complete specs. Spawn prompts place fixed instructions before task
values to share a cacheable prefix. Sessions without spawning follow the same
stages themselves and request fresh review sessions at the review gate.

All roles use `gpt-6.1-sol` for consistent model behaviour. Effort follows the
work: planner high for decomposition and capacity decisions; test-writer,
implementer and reviewer medium for bounded code work; security-reviewer high
for access and adversarial paths; docs low for checked guide updates. Low-route
main-session work uses low effort.

Reviewer files request a read-only sandbox, but the workflow does not rely
on it. The orchestrator's before/after tree comparison is the check.

| File or location | Purpose |
| --- | --- |
| [workflow/PLAN.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/PLAN.md) | Task format, capacity and role groups; planner adds approved feature tasks. |
| [workflow/templates/handoff.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/templates/handoff.md) | Template for each feature's coordination record. |
| `workflow/handoffs/<issue>-<slug>.md` | Per-feature route, stages, decisions, findings and next action; created when a standard/high feature starts. |
| [workflow/templates/story-spec.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/templates/story-spec.md) | Shared format for story specifications. |
| [workflow/specs/README.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/README.md) | Spec boundaries, identifiers and reading conventions. |
| [workflow/specs/PRODUCT-SPEC.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/PRODUCT-SPEC.md) | Product decisions, story allocation and UI vocabulary. |
| [workflow/specs/TECHNICAL-SPEC.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md) | SYS requirements. |
| [workflow/specs/INTEGRATION-SPEC.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md) | Data, contracts, fixtures and integration verification. |
| [workflow/specs/AI-SECURITY-SPEC.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/AI-SECURITY-SPEC.md) | SEC requirements and attack surfaces. |
| [workflow/specs/stories/](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/) | One file per story, using the shared story template. |
| [workflow/scripts/](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/) | `rollout-summary.ts`: session-log metadata CLI; `rollout-files.ts`: safe rollout discovery and selection; `rollout-parser.ts`: projects records into approved summary fields. |
| [.codex/config.toml](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.codex/config.toml), [.codex/agents/](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.codex/agents) | Agent limits and the six specialist definitions. |
| [.agents/skills/](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.agents/skills) | Canonical procedures: sdd-orchestrate, sdd-plan, sdd-test, sdd-implement, sdd-review, sdd-security-review and sdd-docs. |
| [.claude/skills/](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.claude/skills) | Matching pointer stubs for Claude Code. |

## Acknowledgements

The application was scaffolded with `create-next-app`.
