# LGTM

[![CI](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/actions/workflows/ci.yml)

LGTM is a code review academy. Code submitted to the app is displayed, never executed.

- **Learners** review pull requests with planted flaws and receive AI-graded feedback.
- **Authors** turn working code into challenges with AI-proposed flaws.
- **TAs** moderate grades and inspect AI summaries of learner blind spots.

[Open the production app](https://lgtm-cs3227.vercel.app).

## Quick start

Requires Bun 1.4.3, Node 24 ([`.node-version`](.node-version)) and Docker.

```bash
bun install --frozen-lockfile
bun run db:start
```

Configure the local Supabase values and fake AI provider as described in
[Setting up](docs/DeveloperGuide.md#setting-up), then run:

```bash
bun run dev           # http://localhost:3000
```

Use [Getting started](docs/UserGuide.md#getting-started) to create an account
and choose a permanent role. Local development and CI use fake AI; hosted
environments use the live SoC provider.

## Checks

| Command | Purpose |
| --- | --- |
| `bun run lint` | ESLint |
| `bun run typecheck` | Route types and TypeScript |
| `bun run test` | Unit tests |
| `bun run test:integration` | Integration tests with local Supabase |
| `bun run test:e2e` | Browser journeys with local Supabase and a production build |
| `bun run build` | Production build |
| `bun run verify` | Lint, typecheck, unit tests and build |

See [How to test](docs/DeveloperGuide.md#how-to-test) for setup, targeted checks
and CI's required integration/e2e jobs. Humans run full verify and e2e before a PR.

## Documentation

- [User Guide](docs/UserGuide.md)
- [Developer Guide](docs/DeveloperGuide.md) — setup, architecture, features, workflow and deployment
- [Requirements](workflow/specs/README.md)
- [Product site](https://cs3227-2610-mp4-lgtm.github.io/CS3227-2610-MP4/)
- [Contributing workflow](docs/DeveloperGuide.md#development-workflow) and [agent instructions](AGENTS.md)
- [Acknowledgements](docs/DeveloperGuide.md#acknowledgements) — AI assistance, software, services and scaffold
