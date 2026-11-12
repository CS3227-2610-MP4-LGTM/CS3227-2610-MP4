# LGTM

[![CI](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/actions/workflows/ci.yml)

LGTM is a code review academy. Learners review pull requests with planted
flaws and get AI-graded feedback. Code submitted to the app is displayed,
never executed.

- **Production:** [Live app](https://lgtm-cs3227.vercel.app) (deployed from release tags)
- **Development:** [Live app](https://lgtm-cs3227-dev.vercel.app) (deployed from `master`)

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

Open `/sign-up` to create an account with a permanent Learner, Author or TA
role, or `/sign-in` for an existing account. See
[Account pages](docs/DeveloperGuide.md#account-pages) for role destinations
and access recovery.

Sign in as a Learner to open **Challenges**. Filter published challenges by
**Language**, **Difficulty** and **Flaw category**, then choose **View challenge**
to inspect the source in a PR view. For a first attempt, draft line comments
and choose **Submit review**. Confirming opens **Review result** with the pinned
code and read-only comments. Grading starts automatically. Once it completes,
read comment feedback under **Earned credit** and use **Show hint** under
**Missed criteria** to reveal eligible hints one at a time. **Next actions**
offers **Retry challenge** for an eligible second attempt, starting with editable
copies of the first review's comments on the same code revision.

Open **Review history** to revisit each of your attempts, including retained results
after a challenge is unpublished or archived. **Current grade** stays separate
from **Original assessment**; stored overrides and moderation corrections are
read-only and label the actor as **TA action**. See
[Learner review history](docs/DeveloperGuide.md#learner-review-history).

On a completed result, choose **Report unmatched comment** on an unmatched comment
you believe found a real issue missing from the answer key, give a **Reason** and
choose **Send report**. The comment then shows **Reported** and a TA can review the
flag; reporting never changes your grade. See
[Learner unmatched-comment reports](docs/DeveloperGuide.md#learner-unmatched-comment-reports).

[Learner challenge catalogue and PR view](docs/DeveloperGuide.md#learner-challenge-catalogue-and-pr-view) ·
[Learner first review](docs/DeveloperGuide.md#learner-first-review) ·
[Learner grading](docs/DeveloperGuide.md#learner-grading) ·
[Learner feedback, hints and retry](docs/DeveloperGuide.md#learner-feedback-hints-and-retry)

Sign in as a TA to open **Submissions**, filter attempts by learner, challenge
and grading status, then choose **View submission** for read-only pinned code,
comments, original/current grades and private answer evidence. See
[TA submission inspection](docs/DeveloperGuide.md#ta-submission-inspection).
Use **Flagged submissions** to filter open/resolved flags, append resolutions
and corrections, or save justified grade overrides from submission detail. See
[TA flag resolution and grade overrides](docs/DeveloperGuide.md#ta-flag-resolution-and-grade-overrides).
Open **Learners** and choose **View learner** for completed first-attempt category
progress and rule-based recommendations. **View submissions** opens supporting
attempts, which offer **Back to learner**. See
[TA learner progress and recommendations](docs/DeveloperGuide.md#ta-learner-progress-and-recommendations).
The **Performance summary** region reads retained AI advice without generating
automatically. Choose **Generate summary** or **Regenerate summary** explicitly,
then use its supporting-submission links to check the advice. See
[TA performance summaries](docs/DeveloperGuide.md#ta-performance-summaries).

Hosted development uses the live SoC provider. Local development and CI use the
fake provider. See [Provider configuration](docs/DeveloperGuide.md#provider-configuration).

## Checks

| Command | What it does |
| --- | --- |
| `bun run lint` | ESLint |
| `bun run typecheck` | Generates route types, then `tsc --noEmit` |
| `bun run test` | Unit tests (Vitest); no Supabase required |
| `bun run test:integration` | Auth/API/Postgres integration tests against local Supabase |
| `bun run test:e2e` | Playwright account, Learner browse, review, grading, hints, challenge retry, review history and unmatched-comment reports, TA inspection, moderation and learner-progress journeys against local Supabase and a production build (port 3100) |
| `bun run build` | Production build |
| `bun run verify` | Lint, typecheck, test and build; CI runs this on every PR |
| `bun run db:start` / `db:stop` / `db:reset` / `db:types` | Local Supabase; see the [Developer Guide](docs/DeveloperGuide.md#scripts) |

CI requires both the local Auth/domain/LLM integration job and the production-build
Playwright job before `verify` succeeds. See
[Auth tests and settings](docs/DeveloperGuide.md#auth-tests-and-settings) for
setup and the hosted settings that need human review.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/app/` | Pages and route handlers (Next.js App Router) |
| `src/server/llm/` | Server-only AI contracts, provider dispatch and usage accounting |
| `src/lib/supabase/`, `src/server/supabase/` | Supabase clients and generated database types |
| `supabase/` | Local Supabase config, migrations and seed data |
| `docs/` | Product site and Developer Guide |
| `workflow/` | Scripts for parsing and summarizing agent rollouts |
| `logs/` | Per-member session logs |
| `.github/workflows/` | CI and deployment |
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
