---
name: supabase-local
description: Start, check, reset and stop the local Supabase stack, write migrations and regenerate database types. Use when running the app or tests against the database, changing the schema, or debugging a local Supabase that will not start.
---

# Local Supabase

LGTM runs against a local Supabase stack in Docker. Everything here targets
that local stack only. Never run `supabase link`, `db push`, `db dump`, or any
command with `--remote`, `--linked` or `--db-url`: those reach the hosted
`lgtm-dev` and `lgtm-prod` projects, which only humans touch.

Run commands from the repository root. Always use the `db:*` scripts or
`bunx supabase`, never a global `supabase` binary, so the CLI version pinned in
`package.json` is used.

## Check the setup

```sh
sh .agents/skills/supabase-local/scripts/doctor.sh
```

It checks Docker, the CLI, whether the stack is running and whether
`.env.local` exists. It prints no keys. Fix each `FAIL` line before going on.

## Start and stop

| Command | Effect |
| --- | --- |
| `bun run db:start` | Starts the stack. The first run pulls images and takes minutes; run it in the background. |
| `bun run db:status` | Lists URLs and keys. Its output contains secrets: do not paste it into logs, issues or PRs. |
| `bun run db:stop` | Stops the stack and keeps its data. |

Local endpoints: API `http://127.0.0.1:54321`, Postgres `127.0.0.1:54322`,
Studio `http://127.0.0.1:54323`, Mailpit (auth emails) `http://127.0.0.1:54324`.

## Environment variables

The app needs `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in
`.env.local`. Agents must not read or write `.env*` files: if `.env.local` is
missing, give the human this command to run themselves, then stop.

```sh
bunx supabase status -o env \
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
  --override-name auth.publishable_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  --override-name auth.secret_key=SUPABASE_SECRET_KEY \
  | grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|SUPABASE_SECRET_KEY)=' \
  >> .env.local
```

Restart `bun run dev` after `.env.local` changes.

## Change the schema

1. `bunx supabase migration new <snake_case_name>` creates
   `supabase/migrations/<timestamp>_<name>.sql`.
2. Write the SQL. The local stack mirrors the hosted projects:
   - RLS is enabled automatically on new `public` tables, but no policies
     exist until the migration adds them.
   - New tables are not exposed to the Data API. `GRANT` each role, including
     `service_role`, exactly the privileges it needs.
   - Put helper functions that must not be callable over the API in the
     `private` schema.
3. `bun run db:reset` rebuilds the database from all migrations and
   `supabase/seed.sql`. It deletes all local data.
4. `bun run db:types` regenerates `src/lib/supabase/database.types.ts`. Commit
   it together with the migration.

Never edit a migration that is already on `upstream/master`; add a new one.

To inspect the database directly:

```sh
docker exec -it supabase_db_lgtm psql -U postgres -d postgres
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `failed to connect to the docker API` | Start Docker Desktop (`open -a Docker` on macOS) and retry. |
| `port is already allocated` | Another Supabase project is running: `bunx supabase stop --project-id <id>`, or stop the other stack from its own directory. |
| Containers unhealthy after a CLI upgrade | `bun run db:stop`, then `bun run db:start`. |
| Migration fails on `db:reset` | Read the SQL error, fix the newest migration, run `bun run db:reset` again. |
| App throws `Supabase is not configured` | `.env.local` is missing or incomplete; see Environment variables. |
| Query returns `permission denied` or no rows | The table lacks a `GRANT` or an RLS policy for that role. |
