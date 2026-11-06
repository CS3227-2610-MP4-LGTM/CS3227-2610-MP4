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

Humans and deployment workflows apply migrations to hosted projects. Agents never run
`supabase link`, `db push` or any command with `--remote`.

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

### Clients

| Import | Use in | Acts as |
| --- | --- | --- |
| `@/lib/supabase/client` | Client Components | The signed-in user (RLS applies) |
| `@/server/supabase/server` | Server Components, Server Functions, Route Handlers | The signed-in user, read from request cookies |
| `@/server/supabase/admin` | Server code, after authorizing the caller | Service role (bypasses RLS) |

Prefer the user-scoped clients so RLS enforces access. Reach for the admin
client only for operations no user role may perform directly, such as writing
AI grades.

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
