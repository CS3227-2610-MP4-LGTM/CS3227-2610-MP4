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

Requires Bun 1.4.3 and Node 24 (see `.node-version`).

```bash
bun install --frozen-lockfile
bun run dev            # http://localhost:3000
```

## Checks

| Command | What it does |
| --- | --- |
| `bun run lint` | ESLint |
| `bun run typecheck` | Generates route types, then `tsc --noEmit` |
| `bun run test` | Unit and integration tests (Vitest) |
| `bun run test:e2e` | End-to-end tests (Playwright, port 3100) |
| `bun run build` | Production build |
| `bun run verify` | Lint, typecheck, test and build; CI runs this on every PR |

## Repository layout

| Path | Contents |
| --- | --- |
| `src/app/` | Pages and route handlers (Next.js App Router) |
| `docs/` | Developer Guide |
| `.github/workflows/` | CI |
| `.agents/`, `.claude/`, `.codex/` | AI agent skills, permissions and guardrails |

## Documentation

- [Developer Guide](docs/DeveloperGuide.md)

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript 5, Tailwind CSS 4,
Zod 4, Vitest 5 and Playwright.

## Contributing

Branch as `<type>/<issue>-<slug>`, commit with Conventional Commits, and open
a PR to `master`; the `verify` check must pass before merging. AI agents
working in this repo follow [AGENTS.md](AGENTS.md).
