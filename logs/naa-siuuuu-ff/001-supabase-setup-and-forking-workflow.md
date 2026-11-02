# Supabase Setup and Forking Workflow

## Goal
Set up Supabase as LGTM's database for local development, document the team's forking workflow, add a skill for running Supabase locally, and prepare the work as a PR.

## Scope
Four user exchanges on one focused task: Supabase setup, then env guidance, workflow notes, a skill and the PR.

## Session metadata
Claude Code (VS Code extension), model Claude Opus 5.5 (`claude-opus-5-5`), reasoning effort unknown, session ID `49ac1b18-0cd5-432d-baa4-e6fd6942e10d`.

## Key prompts
- "Set up supabase for the database for this application please" — asked for the database infrastructure. No schema specs exist, so the work covered only tooling, clients and config, not domain tables.
- The pasted hosted configuration ("Projects: lgtm-dev, lgtm-prod … Automatically expose new tables: No / Enable automatic RLS: Yes") — described the hosted projects so the local stack could mirror them without connecting to them.
- "what do I put in the.env.local? How do I connect it to the supabase?" — asked how to wire the app to the local stack's keys.
- "set https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4 as the upstream, create a note somewhere that we are using the forking workflow. Finally, write a skill … Commit and push these, and create a pr." — moved the work from a local diff to a PR, with the user running any command the agent is not permitted to run.

## Decisions and corrections
- Pinned Supabase CLI 3.0.0 as a dev dependency instead of the global Homebrew 2.75 install. v3 dropped `--local`, so the `db:*` scripts were rewritten after the first attempt failed.
- v3 reaches hosted databases with `--remote`, which the existing guardrails did not cover. Deny rules were added to `.claude/settings.json` and the Codex rules and flagged for review.
- Mirrored the hosted settings locally: `auto_expose_new_tables = false` in config, plus an event-trigger migration enabling RLS on new `public` tables, since the CLI has no option for that. Verified with rolled-back SQL probes.
- Did not add a Next.js `proxy.ts` session refresh; deferred to the auth work.
- The agent never read or wrote `.env*`. It gave the user a command to create `.env.local` instead.
- Two Write calls failed because the file had not been Read first, and were redone.
- The user changed permissions mid-session to allow commits and PR creation. `git push` stays denied, so the user runs the push.
- Set `upstream`'s push URL to `no_push` to prevent accidental pushes to the team repo.

## Files created or modified
- `package.json`, `bun.lock`
- `supabase/config.toml`, `supabase/.gitignore`, `supabase/seed.sql`
- `supabase/migrations/20261102142339_enable_rls_on_new_tables.sql`
- `src/lib/supabase/env.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/database.types.ts`
- `src/server/supabase/env.ts`, `src/server/supabase/server.ts`, `src/server/supabase/admin.ts`
- `tests/unit/lib/supabase/env.test.ts`, `tests/unit/server/supabase/env.test.ts`
- `docs/DeveloperGuide.md`, `README.md`, `AGENTS.md`
- `.claude/settings.json`, `.codex/rules/guardrails.rules`
- `.agents/skills/supabase-local/SKILL.md`, `.agents/skills/supabase-local/scripts/doctor.sh`, `.claude/skills/supabase-local/SKILL.md`
