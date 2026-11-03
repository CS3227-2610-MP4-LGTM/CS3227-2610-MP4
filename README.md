# LGTM

[![CI](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/actions/workflows/ci.yml)

LGTM is a code review academy. Learners review pull requests with planted
flaws and get AI-graded feedback. Code submitted to the app is displayed,
never executed.

## Roles

- **Learner:** reviews pull requests with planted flaws and gets AI-graded
  feedback on the review.
- **Author:** turns working code into challenges by having AI inject flaws.
- **TA:** moderates AI grades and sees AI summaries of learner blind spots.

## Quick start

Requires Bun 1.4.3, Node 24 (see `.node-version`) and Docker for the local
Supabase stack.

```bash
bun install --frozen-lockfile
bun run db:start       # local Supabase; first run pulls Docker images
bun run dev            # http://localhost:3000
```

Before the first `bun run dev`, create `.env.local` as described in
[Database (Supabase)](docs/DeveloperGuide.md#database-supabase).

## Checks

| Command | What it does |
| --- | --- |
| `bun run lint` | ESLint |
| `bun run typecheck` | Generates route types, then `tsc --noEmit` |
| `bun run test` | Unit and integration tests (Vitest) |
| `bun run test:e2e` | End-to-end tests (Playwright, port 3100) |
| `bun run build` | Production build |
| `bun run verify` | Lint, typecheck, test and build; CI runs this on every PR |
| `bun run db:start` / `db:stop` / `db:reset` / `db:types` | Local Supabase; see the [Developer Guide](docs/DeveloperGuide.md#scripts) |

## Repository layout

| Path | Contents |
| --- | --- |
| `src/app/` | Pages and route handlers (Next.js App Router) |
| `src/lib/supabase/`, `src/server/supabase/` | Supabase clients and generated database types |
| `supabase/` | Local Supabase config, migrations and seed data |
| `docs/` | Product site and Developer Guide |
| `.github/workflows/` | CI |
| `.agents/`, `.claude/`, `.codex/` | AI agent skills, permissions and guardrails |

## Documentation

- [Product page](https://cs3227-2610-mp4-lgtm.github.io/CS3227-2610-MP4/)
- [Developer Guide](docs/DeveloperGuide.md)
- [GitHub Pages setup](docs/DeveloperGuide.md#product-site-github-pages)

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript 5, Tailwind CSS 4,
Zod 4, Supabase (Postgres, Auth, Storage), Vitest 5 and Playwright.

## Contributing

We use the **forking workflow**: push branches to your own fork and open PRs
from it to `master` of
[CS3227-2610-MP4-LGTM/CS3227-2610-MP4](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4).
See [Git workflow](docs/DeveloperGuide.md#git-workflow) for the commands.

Branch as `<type>/<issue>-<slug>`, commit with Conventional Commits, and open
a PR to `master`; the `verify` check must pass before merging. AI agents
working in this repo follow [AGENTS.md](AGENTS.md).
