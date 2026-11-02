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

Only humans apply migrations to hosted projects. Agents never run
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
   types together.

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

## Acknowledgements

The application was scaffolded with `create-next-app`.
