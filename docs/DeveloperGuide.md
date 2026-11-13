---
layout: default
title: Developer Guide
nav_order: 3
---

# LGTM Developer Guide

This guide explains the implemented application and the repository workflow.
For screen instructions, use the [User Guide](UserGuide.md).

## Contents

- [Acknowledgements](#acknowledgements)
- [Setting up](#setting-up)
- [Development workflow](#development-workflow)
- [Architecture](#architecture)
- [Shared UI conventions](#shared-ui-conventions)
- [Data model](#data-model)
- [Account features](#account-features)
- [Learner features](#learner-features)
- [Author features](#author-features)
- [TA features](#ta-features)
- [Authentication and authorization](#authentication-and-authorization)
- [AI features and the LLM module](#ai-features-and-the-llm-module)
- [Security](#security)
- [How to test](#how-to-test)
- [Deployment and environments](#deployment-and-environments)
- [Design considerations](#design-considerations)
- [Requirements appendix](#requirements-appendix)
- [Known limitations](#known-limitations)

## Acknowledgements

### AI assistance

Codex and Claude Code assist with planning, acceptance tests, implementation,
independent review and documentation through the checked
[development workflow](#development-workflow). Humans approve gates, review
outputs, commit changes and open PRs.

### Third-party software and services

LGTM uses Next.js 16 (App Router and Turbopack), React 19, TypeScript 5,
Tailwind CSS 4 and Zod 4. Supabase supplies Postgres, Auth and the local service
stack (including Storage); SoCLaaS supplies hosted AI inference. Bun runs
repository commands, Vitest runs unit/integration tests and Playwright runs
browser journeys. Docker hosts local Supabase. GitHub provides source hosting,
Actions and Pages; Vercel hosts the application. The product site uses Just the
Docs and Jekyll plugins described under [deployment](#product-site-github-pages).
Pinned package versions and scripts are recorded in [package.json](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/package.json).

### Scaffold

The application was scaffolded with `create-next-app`.

## Setting up

Use Bun 1.4.3 and Node 24, as recorded in [package.json](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/package.json) and [.node-version](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.node-version).
Install the pinned dependencies with `bun install --frozen-lockfile`.

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
| `bun run db:types` | Regenerates `src/lib/supabase/database.types.ts` for `public`, `graphql_public` and `private` from the local database |

Run `bun run dev` after configuring the local stack, then open
<http://localhost:3000>. Local development and CI use the fake provider; configure
`APP_ENV=local` and `AI_PROVIDER=fake` locally. See
[Provider configuration](#provider-configuration) for hosted environments.

## Development workflow

### Git workflow

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

### Agent loop, gates and independent review

Start feature work in a human-led main session with
[sdd-orchestrate](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.agents/skills/sdd-orchestrate/SKILL.md).
The orchestrator routes work, checks gates itself and maintains the
feature handoff. Specialists return evidence, never write their own handoffs
or spawn more agents. Humans own commits and PRs.
After each stage, the orchestrator records the agent's rollout token total
in the handoff (or `unavailable`), and at close-out records its own session total.
Use [`--per-turn`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/rollout-summary.ts#L6) for per-response token records.

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

### Session logs

At close-out, humans record the session under `logs/<github-user>/` using the
repository's [session-log skill](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.agents/skills/session-log/SKILL.md).
Use a numbered `NNN-session-name.md` file with the goal, scope, session metadata,
key prompts, decisions and changed files. Obtain Codex metadata through
`bun workflow/scripts/rollout-summary.ts --id <thread-id>` immediately before
writing; copy available totals verbatim and mark unknown values rather than
estimating. The CLI safely projects approved metadata; do not inspect raw
rollouts, which may contain prompts or secrets.

### Workflow file reference

The following inventory describes every current file under `workflow/`.
Handoffs are feature coordination records, not specifications or product status
pages. Their retained decisions and checks explain the work they accompanied.

#### Planning and templates

| File | Purpose |
| --- | --- |
| [PLAN.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/PLAN.md) | Task format, capacity, role groups, approved tasks and their todo/in-progress/blocked/done status. |
| [templates/handoff.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/templates/handoff.md) | Template for a standard/high feature route, stages, evidence, decisions, findings and next action. |
| [templates/story-spec.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/templates/story-spec.md) | Story template for dependencies, acceptance criteria, use cases, edge cases and UI/AI notes. |

#### Specifications

| File | Purpose |
| --- | --- |
| [specs/AI-SECURITY-SPEC.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/AI-SECURITY-SPEC.md) | SEC requirements, AI threats, bounded inference and protected-data controls. |
| [specs/INTEGRATION-SPEC.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md) | Shared domain model, API/LLM contracts, grading rules, fixtures and integration verification. |
| [specs/PRODUCT-SPEC.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/PRODUCT-SPEC.md) | Product decisions, roles, story index and UI vocabulary. |
| [specs/README.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/README.md) | Specification boundaries, identifiers and focused reading conventions. |
| [specs/TECHNICAL-SPEC.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md) | SYS requirements for architecture, identity, access and environments. |
| [specs/stories/ACC-01-sign-up-with-a-role.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/ACC-01-sign-up-with-a-role.md) | ACC-01 — Sign up with a role; story requirements, criteria, use cases and edge cases. |
| [specs/stories/ACC-02-sign-in-and-sign-out.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/ACC-02-sign-in-and-sign-out.md) | ACC-02 — Sign in and sign out; story requirements, criteria, use cases and edge cases. |
| [specs/stories/ACC-03-role-based-landing-and-navigation.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/ACC-03-role-based-landing-and-navigation.md) | ACC-03 — Role-based landing and navigation; story requirements, criteria, use cases and edge cases. |
| [specs/stories/AUT-01-create-a-draft.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/AUT-01-create-a-draft.md) | AUT-01 — Create a draft; story requirements, criteria, use cases and edge cases. |
| [specs/stories/AUT-02-configure-flaws.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/AUT-02-configure-flaws.md) | AUT-02 — Configure flaws; story requirements, criteria, use cases and edge cases. |
| [specs/stories/AUT-03-generate-flaw-proposals.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/AUT-03-generate-flaw-proposals.md) | AUT-03 — Generate flaw proposals; story requirements, criteria, use cases and edge cases. |
| [specs/stories/AUT-04-preview-and-decide-flaws.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/AUT-04-preview-and-decide-flaws.md) | AUT-04 — Preview and decide flaws; story requirements, criteria, use cases and edge cases. |
| [specs/stories/AUT-05-publish-a-challenge.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/AUT-05-publish-a-challenge.md) | AUT-05 — Publish a challenge; story requirements, criteria, use cases and edge cases. |
| [specs/stories/AUT-06-maintain-challenges.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/AUT-06-maintain-challenges.md) | AUT-06 — Maintain challenges; story requirements, criteria, use cases and edge cases. |
| [specs/stories/LRN-01-browse-challenges.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/LRN-01-browse-challenges.md) | LRN-01 — Browse challenges; story requirements, criteria, use cases and edge cases. |
| [specs/stories/LRN-02-view-a-challenge-as-a-pr.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/LRN-02-view-a-challenge-as-a-pr.md) | LRN-02 — View a challenge as a PR; story requirements, criteria, use cases and edge cases. |
| [specs/stories/LRN-03-manage-line-comments.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/LRN-03-manage-line-comments.md) | LRN-03 — Manage line comments; story requirements, criteria, use cases and edge cases. |
| [specs/stories/LRN-04-submit-a-final-review.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/LRN-04-submit-a-final-review.md) | LRN-04 — Submit a final review; story requirements, criteria, use cases and edge cases. |
| [specs/stories/LRN-05-grade-a-submitted-review.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/LRN-05-grade-a-submitted-review.md) | LRN-05 — Grade a submitted review; story requirements, criteria, use cases and edge cases. |
| [specs/stories/LRN-06-feedback-hints-and-retry.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/LRN-06-feedback-hints-and-retry.md) | LRN-06 — Feedback, hints and retry; story requirements, criteria, use cases and edge cases. |
| [specs/stories/LRN-07-report-an-unmatched-comment.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/LRN-07-report-an-unmatched-comment.md) | LRN-07 — Report an unmatched comment; story requirements, criteria, use cases and edge cases. |
| [specs/stories/LRN-08-review-history.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/LRN-08-review-history.md) | LRN-08 — Review history; story requirements, criteria, use cases and edge cases. |
| [specs/stories/TA-01-inspect-submissions.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/TA-01-inspect-submissions.md) | TA-01 — Inspect submissions; story requirements, criteria, use cases and edge cases. |
| [specs/stories/TA-02-resolve-flagged-submissions.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/TA-02-resolve-flagged-submissions.md) | TA-02 — Resolve flagged submissions; story requirements, criteria, use cases and edge cases. |
| [specs/stories/TA-03-override-a-grade.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/TA-03-override-a-grade.md) | TA-03 — Override a grade; story requirements, criteria, use cases and edge cases. |
| [specs/stories/TA-04-learner-performance-summary.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/TA-04-learner-performance-summary.md) | TA-04 — Learner performance summary; story requirements, criteria, use cases and edge cases. |
| [specs/stories/TA-05-category-progress-and-recommendations.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/TA-05-category-progress-and-recommendations.md) | TA-05 — Category progress and recommendations; story requirements, criteria, use cases and edge cases. |

#### Feature handoffs

| File | Purpose |
| --- | --- |
| [handoffs/12-auth-core.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/12-auth-core.md) | Coordination evidence and decisions for 12 — auth-core. |
| [handoffs/37-domain-schema.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/37-domain-schema.md) | Coordination evidence and decisions for 37 — domain-schema. |
| [handoffs/38-llm-boundary.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/38-llm-boundary.md) | Coordination evidence and decisions for 38 — llm-boundary. |
| [handoffs/39-account-pages.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/39-account-pages.md) | Coordination evidence and decisions for 39 — account-pages. |
| [handoffs/49-learner-browse.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/49-learner-browse.md) | Coordination evidence and decisions for 49 — learner-browse. |
| [handoffs/50-learner-review-submit.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/50-learner-review-submit.md) | Coordination evidence and decisions for 50 — learner-review-submit. |
| [handoffs/51-learner-grading.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/51-learner-grading.md) | Coordination evidence and decisions for 51 — Learner grading. |
| [handoffs/52-learner-feedback-retry.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/52-learner-feedback-retry.md) | Coordination evidence and decisions for 52 — Learner feedback, hints and Retry challenge. |
| [handoffs/52-learner-history.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/52-learner-history.md) | Coordination evidence and decisions for 52 part 1 — Learner review history. |
| [handoffs/52-learner-reports.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/52-learner-reports.md) | Coordination evidence and decisions for 52 part 2 — Learner reports. |
| [handoffs/53-ta-inspection.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/53-ta-inspection.md) | Coordination evidence and decisions for 53 — ta-inspection. |
| [handoffs/54-ta-moderation.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/54-ta-moderation.md) | Coordination evidence and decisions for 54 — ta-moderation. |
| [handoffs/55-learner-progress.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/55-learner-progress.md) | Coordination evidence and decisions for 55 — learner-progress. |
| [handoffs/56-learner-performance-summaries.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/56-learner-performance-summaries.md) | Coordination evidence and decisions for 56 — learner-performance-summaries. |
| [handoffs/66-live-soc-provider.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/66-live-soc-provider.md) | Coordination evidence and decisions for 66 — Live SoC provider. |
| [handoffs/77-constrained-llm-output.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/77-constrained-llm-output.md) | Coordination evidence and decisions for 77 — Constrained live SoC output. |
| [handoffs/81-author-drafts.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/81-author-drafts.md) | Coordination evidence and decisions for 81 — author-drafts. |
| [handoffs/82-author-proposals.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/82-author-proposals.md) | Coordination evidence and decisions for 82 — author-proposals. |
| [handoffs/83-author-publication.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/83-author-publication.md) | Coordination evidence and decisions for 83 — author-publication. |
| [handoffs/84-author-lifecycle.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/84-author-lifecycle.md) | Coordination evidence and decisions for 84 — author-lifecycle. |

#### Scripts and fixtures

| File | Purpose |
| --- | --- |
| [scripts/fixtures/soc-smoke/assess-review-e6.json](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/fixtures/soc-smoke/assess-review-e6.json) | 21 labelled E6 single-match assessment cases for expected explanation/fix credit. |
| [scripts/fixtures/soc-smoke/assess-review-multi-match.json](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/fixtures/soc-smoke/assess-review-multi-match.json) | Labelled multi-match credit cases keyed by flaw/comment pair. |
| [scripts/fixtures/soc-smoke/assess-review.json](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/fixtures/soc-smoke/assess-review.json) | Matched-comment assessment smoke inputs. |
| [scripts/fixtures/soc-smoke/generate-hints.json](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/fixtures/soc-smoke/generate-hints.json) | Publication-hint smoke inputs and retained-flaw context. |
| [scripts/fixtures/soc-smoke/inject-flaws-stress.json](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/fixtures/soc-smoke/inject-flaws-stress.json) | Separate five-flaw injection stress case. |
| [scripts/fixtures/soc-smoke/inject-flaws.json](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/fixtures/soc-smoke/inject-flaws.json) | Flaw-injection smoke inputs. |
| [scripts/fixtures/soc-smoke/summarize-learner.json](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/fixtures/soc-smoke/summarize-learner.json) | Learner-summary smoke inputs. |
| [scripts/rollout-files.ts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/rollout-files.ts) | Safe rollout discovery and selection scoped to repository/session; reads only matching JSONL files without following symlinks. |
| [scripts/rollout-parser.ts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/rollout-parser.ts) | Pure projection of rollout records into approved session/token and per-response fields; omits raw records and parse errors. |
| [scripts/rollout-summary.ts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/rollout-summary.ts) | Metadata CLI: select by ID/path or list sessions; optional per-turn JSON/CSV and token-count fallback. |
| [scripts/soc-smoke.ts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/soc-smoke.ts) | Explicitly authorized manual live-provider smoke runner; validation and labelled credit comparisons produce sanitized CSV. |

Agent definitions and limits live in [.codex/config.toml](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.codex/config.toml) and [.codex/agents/](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.codex/agents/).
Canonical procedures live in [.agents/skills/](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.agents/skills/);
[.claude/skills/](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.claude/skills/) contains matching Claude Code pointer stubs.

## Architecture

### Layers and request flow

| Layer | Responsibility |
| --- | --- |
| `src/app/` | App Router pages and `/api/v1` route handlers; protected page boundaries defer request-time account reads. |
| `src/components/` | Account and role screens, client state, confirmations and shared code rendering. |
| `src/lib/` | Client-safe types, vocabularies, Zod schemas, deterministic grading/progress helpers and Supabase browser client/types. |
| `src/server/` | Server-only auth, role services, validated HTTP adapters and user/admin Supabase clients. |
| `src/server/llm/` | Shared authorization, snapshot capture, provider dispatch, output validation and usage accounting. |
| `supabase/` | Local configuration, migrations and seed data; Postgres constraints, grants, RLS and narrow RPCs enforce persistence. |

A page resolves the verified account and stored role, then loads authorized
role data. A mutation passes from the component through the HTTP adapter's Zod
validation to a server service and a constrained database RPC. The RPC checks
identity, ownership and state under its locks, and commits atomically. The
client treats an unconfirmed reply as uncertain and recovers using the same
mutation key. AI services additionally capture persisted evidence through the
[shared LLM boundary](#ai-features-and-the-llm-module); no database transaction
spans a provider request.

All HTTP fields, bounds, response envelopes, status codes, pagination and
concurrency rules have one authoritative home in [INTEGRATION-SPEC §3](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#3-api-contracts).
Feature sections below link its role surfaces and explain implementation
choices rather than duplicating those contracts.

### Page routes

These page paths compose the role workspaces; HTTP contracts are separate.
Exact labels and navigation steps live in the [User Guide](UserGuide.md#navigating-lgtm).

| Role | Page routes |
| --- | --- |
| Account | `/sign-up`, `/sign-in`; `/` redirects a usable account to its role landing. |
| Learner | `/learner/challenges`, `/learner/challenges/:id`; `/learner/history`, `/learner/history/:submissionId`, `/learner/history/:submissionId/retry`. |
| Author | `/author/challenges`, `/author/challenges/new`, `/author/challenges/:id`, `/author/challenges/:id/edit`, `/author/challenges/:id/configuration`, `/author/challenges/:id/proposals`, `/author/challenges/:id/publication`, `/author/challenges/:id/revisions/:revisionId`. |
| TA | `/ta/submissions`, `/ta/submissions/:id`, `/ta/flags`, `/ta/learners`, `/ta/learners/:learnerId`. |

TA submission page context `from=flags` enables a queue return, while
`from=learner&learnerId=<matching learner UUID>` enables a learner return.
Context is validated and does not enter the detail API contract.

### Supabase clients

| Import | Use in | Acts as |
| --- | --- | --- |
| `@/lib/supabase/client` | Client Components | The signed-in user (RLS applies) |
| `@/server/supabase/server` | Server Components, Server Functions, Route Handlers | The signed-in user, read from request cookies |
| `@/server/supabase/admin` | Server code, after authorizing the caller | Service role (bypasses RLS) |

Prefer the user-scoped clients so RLS enforces access. Use the admin client
only for the named SYS-10.3 operations after their authorization preconditions;
the application auth flow never uses it.

## Shared UI conventions

Protected screens share [WorkspacePage](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/components/account/workspace-page.tsx)
and [WorkspaceAccessBoundary](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/components/account/workspace-access-boundary.tsx).
Identity/role failures replace protected content and do not automatically replay
mutations after recovery. Shared navigation and recovery instructions belong in
[the User Guide](UserGuide.md#navigating-lgtm).

Role lists preserve applied filters and cursors in URLs; Author lists append
pages. Pagination announces loading and restores heading focus. Forms focus the
first invalid field, disable conflicting actions while pending and retain safe
input on failures. Confirmations support keyboard focus and cancellation;
phone-width journeys check 320 CSS pixels.

[CodeDiffView](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/components/code-diff.tsx) accepts an already-authorized
`CodeDiff`, renders source literally and provides a focusable scrolling region
for long lines. Its optional `gutterControl` and `afterLine` slots support
Learner comment controls and annotations; callers choose labels and whether to
show the path. Learner projection contains only flawed source as numbered
additions to a single language-derived filename; a trailing newline adds no
extra line. Author publication and TA inspection use the working-to-flawed diff.
See [Learner projection](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/learner/projection.ts) and
[shared source projection](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/lib/code-projection.ts).

## Data model

Supabase stores LGTM data in Postgres and Auth. The authoritative entities and
publication lifecycle are in [INTEGRATION-SPEC §2](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#2-domain-model-and-publication-lifecycle).
Profiles bind accounts to immutable roles. Challenges retain a mutable working
draft and proposal sets; immutable revisions hold published material.
Submissions pin revisions, grading runs preserve original assessments, and
append-only overrides/resolutions preserve moderation history. Private request
ledgers and usage events support replay and accounting independently of public
role projections.

### Domain schema

The domain foundation uses explicit grants and RLS. `authenticated` can select from
role-readable domain tables under policies that use the stored profile role
and record ownership or moderation scope. `anon` and `service_role` have no
table access to the new domain records. None of these roles has a write grant
on them. The private audit-order table has explicit RLS and revokes, and the
migration revokes default function execution and sequence privileges. See the
[domain schema migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261107120000_domain_schema.sql).

Learners can read the live revision and revisions pinned by their own
submissions. Answer keys and cached hint text are separate from those revision
rows and remain restricted to the owning Author and TAs within their read
scope. The owning Learner and TAs can read grade results, comment feedback and
eligible hint references. Flaw matches and grade-to-run provenance stay in
separate TA-only tables. A database trigger preserves a grading run's
submission, run number and creation time and prevents any transition out of
`completed`, including for trusted SQL writers.

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

## Account features

### Account pages

Flow: account creation or sign-in resolves the permanent role workspace;
sign-out clears the current browser session. See
[Getting started](UserGuide.md#getting-started) and
[account recovery](UserGuide.md#access-and-account-screens).

The shared
[AccountEntry](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/components/account/account-entry.tsx)
and [WorkspacePage](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/components/account/workspace-page.tsx)
recheck verified identity and stored role on each request. Pages put session
work behind Suspense and `connection()` with Cache Components enabled;
protected results use no cache scopes. The
[auth actions](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/auth/actions.ts)
invalidate the root layout before redirecting after authentication changes so
prior account navigation is discarded. Sign-in always uses the role landing.
See [Authentication and authorization](#authentication-and-authorization) for
the service and database foundation.

Account pages use server actions backed by validated auth services, rather
than a separate account REST surface. [INTEGRATION-SPEC §3](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#3-api-contracts) defines the protected
role endpoints' session/error conventions; credential and session requirements
are in [SYS-05](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-05--credentials-and-session-lifecycle).
Persistence: [auth-core migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261106151000_auth_core.sql).

Checks: `bun run test tests/unit/auth tests/unit/account`;
`bun run test:integration tests/integration/auth`;
`bun run test:e2e tests/e2e/account`.
See [How to test](#how-to-test) for local services and hosted settings.

## Learner features

### Learner challenge catalogue and PR view

Flow: filter the published catalogue, then open a challenge without creating
an attempt. See [Find a challenge](UserGuide.md#find-a-challenge) and
[Review a challenge](UserGuide.md#review-a-challenge).

Contracts: [Learner contracts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#learner-surface).

The server readers verify the account and stored Learner role for each
protected read and use the signed-in user's Supabase client. The catalogue and
detail database functions grant execution to `authenticated` and check the
stored role. They expose sorted, unique approved categories from the live
revision. Detail returns the live revision ID or the access decision, then
the server reads the matching source under RLS. The first-attempt action
queries only attempt one for the verified Learner and challenge. A failed
lookup remains a read failure. These reads use no cross-request cache.
See the [server readers](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/learner/challenges.ts)
and [Learner browse migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261108130000_learner_browse.sql).

The open view keeps the loaded revision ID and source together. Fresh reads
follow the live pointer; source projection uses the
[shared renderer](#shared-ui-conventions).

#### Learner browse checks

- `bun run test tests/unit/learner` covers validation, source projection and
  rendering, loading, recovery and focus without Supabase.
- With local Supabase running,
  `bun run test:integration tests/integration/domain/learner-browse` covers
  the endpoints and direct database access, including record isolation and
  pagination.
- `bun run test:e2e tests/e2e/learner` uses the production build and local
  Supabase to exercise filter URL history, access outcomes, first-attempt
  links, account switching and keyboard access at 320 CSS pixels.

### Learner first review

Flow: draft line comments in page memory, confirm submission, then open the
pinned result and start grading separately. See
[Review a challenge](UserGuide.md#review-a-challenge),
[Submit your review](UserGuide.md#submit-your-review) and
[uncertain actions](UserGuide.md#when-lgtm-cannot-confirm-an-action).

Contracts: [Learner contracts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#learner-surface) and [INTEGRATION-SPEC §3](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#3-api-contracts).
Comment ordering follows the submission contract. Workspace account and Origin
checks are shared with [other protected mutations](#security).

The user-scoped submission function checks the stored Learner role and locks
the challenge row while checking publication, the live revision and attempt
eligibility. In one transaction it creates the first attempt, assigns comment
IDs and zero-based ordinals, and records the outcome in the private submission
ledger. The ledger keys each request by actor, challenge and idempotency key
and compares a fingerprint of the validated input. Replays of a recorded request
return its outcome. Changing the payload under the same key conflicts. A definitive rejection from the publication,
attempt or revision-line checks is recorded without creating a submission.
A request rejected by HTTP validation before the database call leaves the
ledger untouched.

The migration grants both submission and result-read function execution to
`authenticated`. It keeps direct write grants and ledger access closed.
Opening the result starts grading separately from submission. The result
function returns the pinned code, submitted comments and grading state only to
the owning Learner. See the
[server submission contract](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/learner/submissions.ts)
and [Learner submission migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261109120000_learner_submissions.sql).

#### Learner submission checks

- `bun run test tests/unit/learner` covers draft controls, status checks and
  HTTP validation without Supabase.
- `bun run test:integration tests/integration/domain/learner-submission`
  exercises submission, replay, lifecycle checks and record access against
  local Supabase.
- `bun run test:e2e tests/e2e/learner/review.spec.ts` exercises the
  keyboard review flow and leave warnings on a production build.

### Learner grading

Flow: opening a pending result automatically starts assessment; completed
results retain the original grade separately from TA overrides. Failed grading
preserves the submission, and explicit grading retry assesses that same attempt.
See [Read your result](UserGuide.md#read-your-result) and
[grading failures](UserGuide.md#review-grading).

Contracts: [Learner contracts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#learner-surface). The service matches against the pinned
revision, requests credit assessment through the
[LLM module](#ai-features-and-the-llm-module), then computes and stores the
original score. Empty match sets require no model dispatch or quota.
Persistence: [grading migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261110120000_learner_grading.sql).

Run the grading unit checks with `bun run test tests/unit/learner`. With
local Supabase running, use `bun run test:integration tests/integration/domain/learner-grading.test.ts tests/integration/llm/learner-grading tests/integration/ta/progress/learner-grading.test.ts`
to check grading, replay and first-attempt TA progress. Use
`bun run test:e2e tests/e2e/learner/grading.spec.ts` for the browser flow
with the fake provider.

### Learner feedback, hints and retry

Flow: read per-comment feedback and missed criteria, reveal cached hints, then
retry once after a completed first assessment while the challenge remains
published. See [Use hints](UserGuide.md#use-hints) and
[Retry a challenge](UserGuide.md#retry-a-challenge).

Contracts: [Learner contracts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#learner-surface). Hints are plain text fetched independently
of the result, quota-free and collapsed on reopening. Eligibility follows the
original assessment even if a TA override exists. Existing completed results
retain eligible hints after unpublication/archive; attempt two uses its own
original assessment for hint eligibility.

The retry editor starts with independent copies of attempt one's comments and
its pinned source, even after republication. It rechecks eligibility on entry,
including browser-history restoration, and again on submission. Eligibility
checks prioritize incomplete original assessment, used retry, then nonpublished
challenge. Failed entry reads preserve the URL; an ineligible entry exposes the
reason. Reloading/discarding starts from fresh comment copies.

The authenticated-only
`read_learner_submission_hint` database function checks the stored Learner
role, submission ownership, pinned revision and the exact completed original
grade's eligible hint for a missed flaw. Hint text is fetched separately from
the result and rendered as plain text. The result response carries eligible
hint references.

The result and retry pages use the caller-scoped `read_learner_retry_eligibility`
database function to read publication status and the second submission ID.
The retry POST uses the existing submission endpoint and adds
`previousSubmissionId` alongside the first attempt's `revisionId` and the
draft comments. The submission function checks ownership, original grade
completion, publication and attempt eligibility under the challenge lock,
which serializes competing second attempts. It records the outcome in the
existing idempotency ledger. The server and client check that a successful
acknowledgement identifies attempt two linked to the specified first
submission and pinned revision.
See the [feedback and retry migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261110130000_learner_feedback_retry.sql).

#### Feedback and retry checks

Run the Learner unit tests without Supabase:

```bash
bun run test tests/unit/learner
```

With local Supabase running, check the hint projection and access boundaries,
then exercise retry ownership, revision pinning and concurrent creation:

```bash
bun run test:integration tests/integration/domain/learner-feedback-and-hints.test.ts tests/integration/domain/learner-retry-challenge.test.ts
```

With local Supabase and Chromium installed, run the production-build browser
journeys with the fake provider. These cover keyboard use at 320 CSS pixels,
retry submission and history restoration before and after unpublication.

```bash
bun run test:e2e tests/e2e/learner/feedback-and-retry-challenge.spec.ts tests/e2e/learner/retry-history-restore.spec.ts --project chromium
```

### Learner review history

Flow: revisit each own attempt and its retained result, current grade and
moderation history. See [Check your review history](UserGuide.md#check-your-review-history).

Contracts: [Learner contracts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#learner-surface). New publication, unpublication and archive
preserve the submitted title, pinned source, comments, original assessment,
permitted hints and moderation records. List reads start no grading and write
no grades or usage. Original assessment and effective grade remain separate;
resolutions alone never change a grade.

Override/resolution entries use server audit order, oldest first even for tied
timestamps. Learner projections omit actor identity while retaining full stored
reasons and every correction. Retry follows
[the existing eligibility checks](#learner-feedback-hints-and-retry).

The authenticated-only `list_learner_submissions` RPC derives ownership from
verified identity and stored role. It bounds candidates before invoking the
private `learner_submission_card` helper, which reuses the canonical result
projection. Result and moderation DTOs retain their existing signatures. Shared flag labels
live in `src/lib/moderation/flags.ts`; `src/lib/ta/moderation.ts` re-exports them
for existing TA consumers. See the [history migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261114130000_learner_history.sql).

#### History checks

Run unit checks without Supabase. Run the database files separately to avoid
shared-fixture overlap, then run the history browser file three times against a
production build with local Supabase and the fake provider:

```bash
bun run test tests/unit/learner/history-contract.test.ts tests/unit/learner/history-list.test.tsx tests/unit/learner/history-moderation.test.tsx
bun run test:integration tests/integration/domain/learner-history.test.ts
bun run test:integration tests/integration/ta/inspection/reads.test.ts
bun run test:e2e tests/e2e/learner/history.spec.ts --project chromium --repeat-each 3
```

### Learner unmatched-comment reports

Flow: report a completed result's unmatched comment with a reason, then let a
TA resolve the resulting flag. See
[Report an unmatched comment](UserGuide.md#report-an-unmatched-comment).
A comment can be reported once, independently per attempt, including retained
results after unpublication/archive. Reporting changes no grade, match,
comment or answer key and starts no regrading. No report is automatically
replayed after account recovery.

Contracts: [Learner contracts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#learner-surface) and [INTEGRATION-SPEC §3](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#3-api-contracts).
The route shares the [mutation checks and body cap](#protected-mutations-and-caching) and maps existing-report, ineligible-comment and in-progress outcomes through
[shared report messages](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/lib/learner/reports.ts).
Known rollback returns a confirmed failure; a possibly committed write or a
mismatched acknowledgement remains uncertain and requires checking the same key.

The [report migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261115120000_learner_reports.sql)
adds `public.create_learner_report`, a security-definer function with an empty
`search_path` that only `authenticated` may execute. It derives ownership from
the verified identity and stored Learner role, requires the original grade to
list the comment as unmatched and inserts one `learner_report` flag per
submission and comment. Direct flag writes stay denied, and reports
never use the admin client or the LLM provider. The private
`learner_report_requests` ledger (RLS on, no API-role access) records outcomes
on owned submissions by caller, submission and key: replaying a recorded success returns the flag's
current `FlagView`, even if resolved, and reusing a key with a different payload
conflicts. Concurrent reports of one comment serialise on a lock, so exactly
one flag is created.

#### Report checks

Run unit checks without Supabase, the database file against local Supabase, then
the browser file three times against a production build with the fake provider:

```bash
bun run test tests/unit/learner/report-contract.test.ts tests/unit/learner/report-comment.test.tsx
bun run test:integration tests/integration/domain/learner-reports.test.ts
bun run test:e2e tests/e2e/learner/reports.spec.ts --project chromium --repeat-each 3
```

## Author features

### Author challenge drafts

Flow: save working code and flaw configuration as a private draft, then edit
changed fields while retaining any live revision. See
[Create a draft challenge](UserGuide.md#create-a-draft-challenge),
[Configure flaws](UserGuide.md#configure-flaws) and
[Find and edit your challenges](UserGuide.md#find-and-edit-your-challenges).

Contracts: [Author contracts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#author-surface). Routes validate with Zod and use shared
[protected mutation checks](#security). Categories are stored in vocabulary
order so equivalent selections fingerprint identically. Code normalizes CRLF/CR
to LF before UTF-8 measurement; NUL and ill-formed Unicode are rejected.
Both edit screens send only changed fields; trim-equivalent text is unchanged.

The
[Author drafts migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261111120000_author_drafts.sql)
adds the security-definer functions `create_author_challenge` and
`update_author_draft`, granted only to `authenticated`. Authors still have no
direct table write grants. Create records each committed request in the
private `author_challenge_create_requests` ledger, keyed by actor and
idempotency key with a server-computed fingerprint. A replay returns the
recorded draft, a changed payload under the same key returns
an idempotency conflict, and a concurrent duplicate returns
an invalid-state outcome, which is safe to replay. Edits lock the challenge row,
return a version conflict for stale versions and an invalid-state outcome for
archived challenges, increment both versions and clear the active proposal
set. They leave historical proposal sets, published revisions and the live
pointer unchanged. The ledger and the private field validator have RLS or
revoked execution and no grants to any app role. Reads use the existing owner
RLS policies; the detail route uses `challenge_generation_access` to distinguish
another Author's challenge from an absent one according to the access contract. See the
[server draft contract](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/author/drafts.ts).

#### Author draft checks

- `bun run test tests/unit/author` covers the screens, save outcomes and HTTP
  validation without Supabase.
- `bun run test:integration tests/integration/author` exercises grants, direct
  database calls, idempotency, versions, proposal invalidation and list access
  against local Supabase.
- `bun run test:e2e tests/e2e/author` exercises keyboard create at phone width,
  filtering, editing and cross-Author denial on a production build.

### Author flaw proposals

Flow: generate a proposal set from saved configuration, decide every proposal,
and preview a candidate after approving at least one flaw. See
[Generate flaw proposals](UserGuide.md#generate-flaw-proposals),
[Approve or reject proposals](UserGuide.md#approve-or-reject-proposals) and
[Preview the final challenge](UserGuide.md#preview-the-final-challenge).
Generation replaces the active set and resets decisions only on success;
failures retain the current set. Generated proposal text is read-only.

Contracts: [Author contracts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#author-surface). Routes share the draft access/validation
rules and [mutation checks](#security). The preview checks its diff with
`assembleCandidate` and rereads the draft version so it cannot mix decisions
from two saves. Successful generation and each accepted decision increment
both versions; failed, replayed or stale generation changes neither.

The
[Author proposals migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261112120000_author_proposals.sql)
adds:

- `persist_author_proposals(jsonb)`, the SYS-10.3 “Proposal generation” admin
  function, executable only by `service_role` and called through the admin
  client. `claim` records the request in the private `author_proposal_requests`
  ledger (keyed by actor, challenge and idempotency key, expiring after 45
  seconds); a replay returns the recorded outcome. `fail` records a failure
  code. `complete` accepts only this request's completed, unexpired and settled
  `inject_flaws` operation. It rechecks the Author role, ownership, versions and
  the captured input snapshot, and revalidates the output with the private
  `valid_injected_proposals` validator, raising `INVALID_AI_OUTPUT` even if
  server validation was bypassed. It then saves the set, its proposals with
  server IDs and pending decisions, and the draft's active-generation pointer
  in one transaction. The new set replaces the active one; earlier sets are
  kept.
- `decide_author_proposal(uuid, uuid, jsonb)`, user-scoped and executable only
  by `authenticated`. It locks the challenge, checks owner, state and versions,
  and refuses proposals outside the active set.

The ledger has RLS on and no table grants; no app role or `PUBLIC` can execute
the validator. Authors still cannot write proposal tables or the generation
pointer directly. See the
[server proposal contract](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/author/proposals.ts).

#### Author proposal checks

- `bun run test tests/unit/author` also covers generation and decision outcomes,
  the client status mapping, the final preview builder and focus on arrival.
- `bun run test:integration tests/integration/author/proposals.test.ts` exercises
  grants, replay, versions, SQL output revalidation, late results and decisions
  against local Supabase with the fake provider.
- `bun run test:e2e tests/e2e/author/proposals.spec.ts` generates, decides and
  previews by keyboard at phone width, checks the no-proposals state and
  cross-Author denial on a production build.

### Author publication

Flow: publish the shown final preview after hint preparation; inspect the
resulting immutable revision. See
[Publish a challenge](UserGuide.md#publish-a-challenge).
Generation/decisions/preview and publication disable conflicting actions while
pending. Changing a decision withdraws the preview. A failed republication
preserves the existing live revision; a never-published draft stays private.

Contracts: [Author contracts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#author-surface). Role, ownership, state, versions and
eligibility are checked before `generate_hints` through the shared LLM module,
including SEC-03 checks. Success increments the row version only; draft version
and active proposals stay unchanged. Each new publication creates a revision
even without draft changes and spends AI usage again. Same-key recovery replays
that publication rather than creating another.

The
[Author publication migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261113120000_author_publication.sql)
adds:

- `persist_author_publication(jsonb)`, the SYS-10.3 “Publication” admin
  function, executable only by `service_role`. `claim` records the request in
  the private `author_publication_requests` ledger (45-second expiry); a replay
  returns the recorded outcome. `fail` records a failure code. `complete`
  accepts only this request's completed, unexpired and settled
  `generate_hints` operation, requires the versions the request was admitted
  with, rechecks role, ownership, state and decisions, and rebuilds the
  candidate from the stored proposals. It rejects a missing, extra, blank or
  over-length hint with `INVALID_AI_OUTPUT`, then writes the revision, answer,
  flaws, hints, `published` status and published-revision pointer in one
  transaction. Earlier revisions are never changed.
- Owner-only Author read policies on `revision_answers`, `revision_flaws` and
  `flaw_hints`, replacing policies that let any Author read them. TA access is
  unchanged.

The ledger has RLS on and no table grants. Users cannot write revision tables
or the published pointer directly. See the
[server publication contract](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/author/publication.ts).

#### Author publication checks

- `bun run test tests/unit/author` covers the publish action and its failure
  states, client status mapping, the result and revision views and their inert
  rendering, and mutual disabling with generation.
- `bun run test:integration tests/integration/author/publication.test.ts`
  exercises grants, replay, versions, SQL hint revalidation, late results,
  read policies (owner and TA allowed; other Authors, Learners and anonymous
  denied) and revision reads against local Supabase with the fake provider.
- `bun run test:e2e tests/e2e/author/publication.spec.ts` publishes by keyboard
  at phone width, opens the revision, checks a Learner sees the challenge
  without answers or hints, and checks cross-Author denial.

### Author unpublish and archive

Flow: confirm unpublishing a published challenge or permanently archiving a
nonarchived challenge; return to the challenge list. See
[Unpublish a challenge](UserGuide.md#unpublish-a-challenge) and
[Archive a challenge](UserGuide.md#archive-a-challenge).

Contracts: [Author contracts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#author-surface). Both actions use shared
[mutation checks](#security). Unpublication hides the catalogue/detail and
blocks first/retry attempts while preserving existing attempts, grades, TA
views and revision evidence. It permits editing and republication.
Archive also refuses editing, generation, decisions and publication.

Allowed transitions are published → unpublished, and draft, published or
unpublished → archived. A change increments the row version only. The draft,
its version, proposal sets, revisions and published pointer are kept.

The
[Author lifecycle migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261115130000_author_lifecycle.sql)
adds `public.change_author_challenge_lifecycle(uuid, text, uuid, jsonb)`.
SYS-10.3 has no named admin use for lifecycle changes, so this is a
user-scoped `SECURITY DEFINER` function with an empty `search_path`,
executable only by `authenticated`. It validates the payload and checks the
stored Author role and ownership itself. It locks the challenge row
`for update`, the same lock attempt creation takes, so a lifecycle change and
a first attempt always commit in one order. Then it checks the version and
transition.

Requests are recorded in the private `author_lifecycle_requests` ledger. Keys
are scoped to actor, challenge and action, with a server-computed fingerprint.
Both successes and failed checks (`VERSION_CONFLICT`, `INVALID_STATE`) are
recorded, so replaying a key returns its recorded outcome and never applies
later, as INTEGRATION-SPEC §3 requires. A new key can always try again. The
ledger has RLS on and no table grants. Authors still have no direct write
grant on challenges. See the
[server lifecycle contract](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/author/lifecycle.ts).

#### Author lifecycle checks

- `bun run test tests/unit/author` covers the actions, confirmations,
  pending and recovery states, client status mapping, and request validation
  with a mocked client.
- `bun run test:integration tests/integration/author/lifecycle.test.ts`
  exercises transitions, replay (including recorded failures), concurrent
  duplicates, the race between an unpublish and a first attempt, route
  400/413 cases, direct calls with invalid payloads or from other roles,
  grants and the ledger against local Supabase.
- `bun run test:e2e tests/e2e/author/lifecycle.spec.ts` unpublishes and
  archives by keyboard at phone width, checks that a Learner can no longer open
  the challenge, and checks that an archived challenge's detail is read-only.

## TA features

### TA submission inspection

Flow: filter attempts and inspect pinned submission/answer evidence without
starting grading or changing moderation. See
[Inspect submissions](UserGuide.md#inspect-submissions).
Contracts: [TA contracts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#ta-surface).

Readers verify identity/stored TA role and use the caller's client with RLS.
Projections expose learner IDs/display names without emails and include private
answer and per-flaw assessment evidence only in TA scope. Return context follows the [page route convention](#page-routes).
Protected shells defer account reads
behind Suspense and `connection()` and use no cache scopes.
Pinned evidence remains readable after edits, republication, unpublication or
archive. Pending/running/failed grades have no score; a completed zero is real.
Code, snippets and comments render inertly.

See the [TA server readers](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/ta/submissions.ts) and [list migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261108090000_ta_submission_page.sql).

#### TA inspection checks

- `bun run test tests/unit/ta/inspection` covers validation, filter-bound
  cursors, list/detail rendering, stored assessment states and recovery.
- With local Supabase running,
  `bun run test:integration tests/integration/ta/inspection/reads.test.ts`
  checks protected reads, direct RLS access, retained revision evidence and
  GET-only behavior with fixture records.
- `bun run test:e2e tests/e2e/ta/inspection` uses the production build and local
  Supabase for URL history, refresh/retry, account transitions, return links,
  keyboard access and 320 CSS pixel width.

### TA learner progress and recommendations

Flow: open a learner directory entry, inspect category evidence and rule-based
practice recommendations, then follow supporting submissions. See
[Review learner performance](UserGuide.md#review-learner-performance).
Contracts: [TA contracts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#ta-surface).

Progress uses original matching from completed first attempts across retained
history, including unpublished/archived challenges. Retries, grade overrides
and incomplete/failed grades do not change it. All five categories remain
present; absent evidence is distinct from observed zero identification.
Recommendations exclude any previously attempted challenge, including older
revisions and pending/failed attempts. They target the weakest observed
categories; no eligible evidence/candidates yields an empty result.
Both sections load and recover independently, retain successful prior reads
on failed refresh, and make no AI request. The
[summary region](#ta-performance-summaries) remains independent.

Directory ordering is profile creation time descending, then ID ascending;
opaque cursors carry that anchor. Learner identity is resolved server-side
without a separate identity GET endpoint; wrong-role targets are forbidden.

The migration adds `profiles.created_at`,
revokes authenticated table-wide SELECT, and grants SELECT only on `id`,
`display_name` and `role`, subject to existing RLS. Do not use wildcard profile
projections. The narrow security-definer RPCs
`list_ta_learners(p_limit, p_before, p_after_id)` and
`read_ta_learner(p_learner_id)` verify the caller's stored TA role with a fixed
empty search path. Execution is granted to authenticated users, revoked from
PUBLIC, anon and service_role; direct timestamp reads remain unavailable.

The shared aggregator counts original matched flaws over eligible pinned
first-attempt evidence. Rounding, category weakness ordering and candidate
tie-breaks follow
[INTEGRATION-SPEC §5](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#category-progress-and-recommendations).
Reads recompute eligibility without changing submissions, grades, challenges or summaries.

See the [progress readers](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/ta/progress.ts),
[shared aggregation and selection](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/lib/ta/progress.ts)
and [identity migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261109160000_ta_learner_progress.sql).

#### Learner progress checks

- `bun run test tests/unit/ta/progress` covers aggregation, deterministic rules,
  validation, directory/detail rendering and independent section recovery.
- With local Supabase running, `bun run test:integration tests/integration/ta/progress`
  covers protected reads, RPC/grant boundaries and retained original evidence.
- `bun run test:e2e tests/e2e/ta/progress` covers production browser navigation,
  refresh/retry, submission round trips, keyboard access and phone-width layouts.

### TA performance summaries

Flow: read retained AI advice, explicitly generate/regenerate and verify its
supporting evidence. See
[Generate a performance summary](UserGuide.md#generate-a-performance-summary).
Opening, reloading and returning never starts generation. Generation changes
no grade, flag, progress or recommendation. A previous result remains readable
while pending or after failure; uncertain replies trigger a stored-result read
rather than automatic generation. Account recovery never replays generation.
Freshness uses evidence fingerprints rather than generation time. Progress and
recommendations load independently, including when summary freshness is unknown.

Contracts: [TA contracts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#ta-surface). Both endpoints require a verified stored TA
role and a learner in moderation scope. Output text renders inertly; only
server-built supporting links navigate. Validators reject categories/evidence
outside the captured snapshot.

The authorized snapshot selects the latest 20 completed submissions by
`submittedAt` descending, then ID ascending, including completed retries.
Category progress still uses all eligible completed first attempts. Model input
contains selected scores, category counts, comments/feedback and progress;
it excludes learner names/emails, unrelated learners and private answer
explanations/fixes. Fingerprints cover that snapshot and effective override
audit order, so an override can make a retained summary stale without changing
original identification progress.

Generation uses the shared LLM boundary and usage limits. The dedicated
`persist_ta_summary(p_input jsonb)` RPC atomically stores validated output and
its evidence, retaining immutable prior records. Only service_role can execute
it; the admin client has no direct summary-table access. Its private RLS-protected
request journal scopes mutation keys to the TA and learner: duplicate calls
replay recorded results, in-progress duplicates return 409, and the same key
can be used independently for another learner. A confirmed failed attempt can
be retried explicitly with a new key. No transaction spans a provider call.
Final account rechecks distinguish session expiry, account-service outages and
forbidden or changed accounts, without publishing output.

See the [summary service](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/ta/summaries.ts),
[snapshot capture](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/llm/summary-snapshot.ts)
and [summary migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261110160000_ta_performance_summaries.sql).

#### Summary checks

- `bun run test tests/unit/ta/summaries` covers rendering, validation, explicit
  retries, access failures and final account rechecks.
- With local Supabase running, `bun run test:integration tests/integration/ta/summaries`
  covers evidence/freshness, grants, atomic persistence, failure preservation
  and learner-scoped mutation-key replay with fake AI.
- `bun run test:e2e tests/e2e/ta/summaries` covers production browser generation,
  supporting-evidence round trips, independent failures, account transitions,
  keyboard focus and phone-width rendering using local Auth and fake AI.

### TA flag resolution and grade overrides

Flow: inspect the flagged queue, append a resolution/correction, or override a
completed grade with a reason. See
[Work through flagged submissions](UserGuide.md#work-through-flagged-submissions),
[Resolve a flag](UserGuide.md#resolve-a-flag) and
[Override a grade](UserGuide.md#override-a-grade).
Contracts: [TA contracts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#ta-surface).

Resolution alone never changes grades. Overrides change only the effective
grade, preserving matching, per-flaw credit, hints, category evidence, flags and
original AI grading. Both forms retain all audit entries. Stored reasons are
Learner-visible with anonymous TA attribution; TA screens retain actor IDs.
Confirmed save failures allow explicit same-action retry even after a read
refresh. State/conflict rejection requires a fresh action. Account recovery
never automatically resubmits moderation.

Queue cursors bind filters. POSTs use the [same-origin check and body cap](#protected-mutations-and-caching)
and validate with Zod and again in Postgres. An override requires a
completed stored assessment.

The [moderation migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261108150000_ta_moderation.sql)
grants authenticated callers only constrained moderation RPC execution; the RPC
checks the TA role. Direct forged inserts, updates and deletes remain denied;
human moderation never uses the admin client. Actor, timestamp and submission-wide
`auditOrder` are database-derived. Both append operations lock the same submission
so concurrent decisions survive with unique audit order, including tied timestamps.
The highest override audit order determines the effective grade; any resolution
makes a flag resolved. Historical submissions remain moderatable after challenge
publication changes. The shared
[effective-grade projection](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/lib/grading/effective-grade.ts)
also supports owning-Learner-authorized stored rows without exposing private keys.

Idempotency is scoped to actor, operation, resource and key. Replaying the same
canonical payload returns its saved result; changing the payload with that key
conflicts. The validated incomplete-assessment rejection is retained even if
grading later completes: a new explicit action needs a new key. Keys/results
are private, with RLS enabled and table access revoked. Audit append and saved
result are atomic, so a lost response can be retried without duplicate history.

#### Moderation checks

- `bun run test tests/unit/ta/moderation` covers filters, forms, validation,
  access recovery and effective-grade projection. Supplementary recovery tests
  are in `tests/unit/ta/moderation-recovery.test.tsx`.
- `bun run test:integration tests/integration/ta/moderation/writes.test.ts`
  uses local Supabase for protected reads/writes, append ordering, idempotency,
  retained evidence and direct database boundaries.
- `bun run test:e2e tests/e2e/ta/moderation` exercises queue/detail decisions,
  retries, session recovery, keyboard access and phone width against a production
  build with local Supabase and the fake provider.

## Authentication and authorization

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
role. `authErrorResponse` maps failure categories through the
[shared HTTP contract](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#transport-concurrency-and-errors).

RLS policies needing the caller's role must read
`private.profile_roles` (own row only), not `profiles`, to avoid policy
recursion. This constrained projection is populated by the provisioning trigger
and bound to the immutable public profile by its `(id, role)` foreign key.

[`src/proxy.ts`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/proxy.ts)
refreshes session transport and forwards refreshed cookies to server reads,
preserving SSR cache-prevention headers. Protected operations still authorize
at their own server boundary.

Page guards improve navigation, while every protected route/service and
constrained RPC independently checks the verified identity, immutable stored
role and record scope. Browser-supplied roles or actor IDs never authorize a
write. See [clients](#supabase-clients), [data grants](#data-model) and
[Security](#security) for privileged operations and transport controls.

## AI features and the LLM module

### Shared LLM boundary

The server-only modules in
[`src/server/llm/`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/llm/boundary.ts)
provide reusable validation, authorization, fake and SoCLaaS execution, and
durable usage accounting.

`createLlmBoundary({client, accounting, env, clock, limits})` takes a
user-scoped Supabase client and server environment settings. Callers can also
pass an injected `provider` in place of `env`. Its
`execute(request, serverSelection?)` accepts only
`{operation, resourceId, idempotencyKey, expectedVersion?}` with UUIDs for IDs.
Author operations require the captured draft version as `expectedVersion`.
The boundary verifies identity, stored role, ownership and eligible persisted
state before capturing input or reserving usage, then rechecks identity and the
captured fingerprint before returning generated data.

Model input/output envelopes and fields are defined in
[INTEGRATION-SPEC §4](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#4-server-only-llm-contracts). The operations serve these role flows:

| Operation | Authorized caller and resource | Model input / validated output |
| --- | --- | --- |
| `inject_flaws` | Author; owned challenge draft | Working code and flaw configuration / proposals |
| `generate_hints` | Author; owned challenge draft with resolved proposal decisions | Assembled flawed code and retained flaws / keyed hints |
| `assess_review` | Learner; own eligible persisted submission | Pinned flawed code and selected flaw/comment pairs / keyed credit assessments and feedback |
| `summarize_learner` | TA; learner ID | Captured completed submissions and category progress / evidence-backed advice |

The grading service matches comments against the pinned revision and binds
assessment to the active grading run. The boundary rechecks that run before
dispatch and after a successful response. An empty match set returns an empty
assessment without provider dispatch or quota. The grading service scores the
validated result and persists the original assessment. The final write rechecks
ownership, run eligibility and the deadline. See the
[grading service](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/learner/grade-submission.ts).

Contracts reject unknown fields, invalid ranges, duplicate or mismatched keys,
unsupported values and unsupported evidence. The server derives each proposal's source range from a unique whole-line match
of its original snippet, ignoring model-supplied source line numbers; see
[Code, proposals and locations](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#code-proposals-and-locations). Pasted code is normalized and bounded,
never executed. Server-owned instructions remain separate from untrusted data;
tools, browsing, code execution and callbacks are disabled. Hint and feedback
checks reject markup, code fences, links and line references. Protected-text
overlap checks use Unicode NFKC and full case folding across every retained
flaw's original/replacement snippets, explanation and fix: eight-token overlaps,
or a whole protected value of four to seven tokens, are rejected.

### Accounting and failures

[`createAccountingStore`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/llm/accounting.ts)
uses admin-only accounting RPCs by default; its optional SQL executor supports
local committed-connection tests without adding a runtime `pg` dependency.
The environment namespace is trusted server configuration, never role input.
Accounting tables have RLS and no direct client or service-role table grants.
Dedicated functions perform atomic reservations, dispatch marking, settlement,
close and expiry; immutable events record operation and attempt transitions.
`readUsage()` exposes only the verified caller's account usage and budget,
not environment counters or private model material. Callers cannot reset usage.

Each attempt reserves both account and environment capacity before dispatch.
The [User Guide's limits table](UserGuide.md#limits) explains the account and
shared ceilings; [SEC-04](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/AI-SECURITY-SPEC.md#sec-04--bound-soc-requests-and-usage)
defines the request, token, response-size, concurrency and deadline bounds.

Reservations keep their original UTC windows across rollover. Verified usage
settles once within reserved input/output components; uncertain dispatch or usage
charges the full reservation, while proven undispatched work releases it.
Expiry releases active slots, charges unresolved dispatched attempts conservatively
and rejects late settlement. No database transaction spans a provider call.
Duplicate keys return in-progress/replay metadata without another dispatch;
accounting does not store generated role results for replay.

Input measurement conservatively counts the full serialized request's UTF-8
bytes plus overhead. Limits may be lowered, never raised above the SEC-04 ceilings. Only invalid output permits one
automatic retry, using the same snapshot and operation deadline with a fresh
reservation. Transport failure and timeout are not retried. Deadlines also cover
settlement, close and final boundary revalidation.

The boundary returns validated results with attempt/retry/deadline metadata;
duplicate admission returns status metadata. Its internal return types are in
[boundary.ts](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/llm/boundary.ts).
HTTP adapters map safe failure categories through
[INTEGRATION-SPEC §3](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#transport-concurrency-and-errors);
raw provider errors, credentials and private text are excluded from diagnostics.
Accounting outages fail closed.

The persistence foundation is split between the
[accounting migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261108120000_llm_accounting.sql) and [usage-event migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261108123000_llm_usage_events.sql).
LLM input/output field definitions live in
[INTEGRATION-SPEC §4](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#4-server-only-llm-contracts);
security ceilings and retries are governed by
[SEC-04](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/AI-SECURITY-SPEC.md#sec-04--bound-soc-requests-and-usage).

### Provider configuration

`getLlmConfig` validates settings on use and names invalid settings without
printing their values. Configure the provider independently in each environment.

| Environment | Provider settings |
| --- | --- |
| Local, test and CI | Use the fake provider. Set `APP_ENV` to `local`, `test` or `ci` and set `AI_PROVIDER=fake`. |
| Hosted development (Vercel Preview) | Use the live SoC provider. Set `APP_ENV=development`, `AI_PROVIDER=soclaas` and the development `SOCLAAS_API_KEY`. |
| Hosted production (Vercel Production) | Use the live SoC provider. Set `APP_ENV=production`, `AI_PROVIDER=soclaas` and the separate production `SOCLAAS_API_KEY`. |

Keep both SoC keys server-only. The app pins `qwen3.6:35b` with a reviewed
262,144-token context and uses `reasoning_effort=none` for each operation.
Completion tokens cover both answer and reasoning. See the per-operation
output caps in
[`src/server/llm/config.ts`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/llm/config.ts)
and the configuration requirements in
[SYS-15](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-15--configuration-and-hosted-auth).

Each request sends a strict `json_schema` response format derived from the
operation's output contract and the captured input. Input preflight counts
the serialized schema. The app validates the response before accepting it.

Repeat the configuration review in
[SEC-04](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/AI-SECURITY-SPEC.md#sec-04--bound-soc-requests-and-usage)
before enabling live dispatch and whenever the key, model or ceilings change.

### Manual SoCLaaS smoke

The manual runner is for a human-authorized live-provider evaluation, separate
from local app development and CI. Agents never run live model calls.

From the repository root in a local shell, export the development key as
`SOCLAAS_API_KEY`. Pass `--live` to authorize live requests and keep Bun's
environment-file loading disabled.

```bash
bun --no-env-file --conditions=react-server workflow/scripts/soc-smoke.ts \
  --live --operation inject_flaws \
  --input workflow/scripts/fixtures/soc-smoke/inject-flaws.json
```

The fixture directory also includes `generate-hints.json`,
`assess-review.json`, `summarize-learner.json` and a separate five-flaw
`inject-flaws-stress.json` case. Match `--operation` to the input files.
Repeat `--input` for more files and use `--repeat` to run the same cases
again. The script starts calls at least four seconds apart and allows at
most 30 calls per run. The script-only options `--effort` (`none`, `low`,
`medium`, or `high`) and `--max-tokens` (1–8,192) override the corresponding
app defaults for that run.

Each input file is a JSON array of cases with a `payload` and optional
`caseId`. For hint and assessment cases, include the revision's complete
retained flaw set in `retainedFlaws`, including unmatched flaws for
`assess_review`. The script uses this set locally to check the answer
for protected text and sends only the operation payload in the model's
input envelope.

Run the 21 labelled E6 assessment cases with the app's default effort and cap.

```bash
bun --no-env-file --conditions=react-server workflow/scripts/soc-smoke.ts \
  --live --operation assess_review \
  --labelled-input workflow/scripts/fixtures/soc-smoke/assess-review-e6.json
```

Use `--labelled-input` on its own with `assess_review`. Each E6 case
requires a `caseId`, a payload with one matched comment, and
`explanation_label` and `fix_label` values of `0`, `0.5`, or `1`.
For multiple matches, use
`workflow/scripts/fixtures/soc-smoke/assess-review-multi-match.json` as the
labelled input. Multi-match cases group expected credits in
`assessment_labels` keyed by flaw and comment pair. Labels stay local to the
smoke runner.

The script writes one CSV row per call with case and settings, latency,
token counts when available, finish reason, answer and reasoning character
counts, validation outcome, rejection reason and detail, and parsed
assessment credits when applicable. Labelled rows include expected credits.
`exact_agreement` is `true` when every expected credit matches on a valid
response and `false` when any differs. It is blank on invalid or unlabelled
rows. Multi-match cases report each attempt, including invalid output retried
within the operation limits. A repeated flaw and comment pair in a rejected
assessment is identified as `duplicate_pair`. The CSV omits credentials and
raw model text.

## Security

Treat submitted source, comments, model responses, web content and issue/handoff
text as untrusted data. Code is displayed, never executed. The application
validates untrusted server input with Zod, verifies identity/stored role at each
protected boundary, and enforces record scope again in Postgres. Private answer
keys and provenance are separate from Learner-readable projections; see
[Data model](#data-model). AI injection, protected-text validation and conservative
failure accounting are described once in the [LLM module](#ai-features-and-the-llm-module).

### Protected mutations and caching

Learner submissions/reports and Author mutations send the loaded account UUID
in `X-LGTM-Workspace-Account-Id`; when supplied, the server validates it and
compares it to verified identity before calling Postgres. The session remains
the actor. This prevents a stale workspace from writing under another
account's session. Supplied Origin is checked against inbound Host and request
protocol. TA moderation and summary generation require same-origin requests.
Author writes cap bodies at 128 KiB; Learner report writes at 64 KiB and TA
moderation at 32 KiB. API transport/error definitions belong to [INTEGRATION-SPEC §3](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#3-api-contracts).

Protected HTTP responses are `private, no-store`; session transport preserves
SSR cache-prevention headers, and protected pages use no cache scopes.
RLS is supplemented by explicit grants, narrow RPCs, immutable audit evidence,
resource-bound mutation keys and version/row-lock checks. Service-role bypass
does not supply missing table privileges or authorize extra operations.

### Secrets and database guardrails

`SOCLAAS_API_KEY` and `SUPABASE_SECRET_KEY` are server-only. Never add a
`NEXT_PUBLIC_` prefix to them or commit environment files. Errors expose safe
categories without raw provider/database diagnostics or private model material.

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

## How to test

`bun run test` runs unit tests without Supabase. Start the local stack before
running the separate integration suite:

```bash
bun run db:start
bun run test:integration
```

Integration tests run in Vitest's Node environment against real local Auth,
API and Postgres services. Auth tests cover provisioning, immutable roles,
profile visibility and refresh behavior. Domain tests use `pg` to check RLS,
grants, constraints and grading-run history with scoped and trusted SQL
sessions. They roll back seeded domain rows before deleting fixture accounts.
To run the domain tests alone, use `bun run test:integration tests/integration/domain`.
Tests capture local CLI configuration in memory. Auth tests inject throttling
failures to stay within the provider limit. CI's `integration` job runs these
suites and is required by the `verify` job. Local `bun run verify` runs lint,
typecheck, unit tests and build. CI uses Node 24 from `.node-version`.

For browser account journeys, install Chromium once, then run:

```bash
bunx playwright install chromium
bun run test:e2e
```

Keep local Supabase running. Playwright's
[launcher](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/tests/e2e/account/server.ts)
gets local settings from the CLI, builds the app and starts an isolated
production server on port 3100. It does not reuse a development server. The
suite covers all roles, refresh, cookie deletion, denied access and account
switching through back, prefetch and reload. Fixtures create and clean up local
accounts; one worker and zero retries bound Auth traffic. CI's separate `e2e`
job runs this suite against local Auth and is also required by `verify`.

Local `auth.rate_limit.sign_in_sign_ups` is 300 per five minutes per IP to
support repeated integration/fix-round runs. This does not change hosted
limits. After changing local Auth configuration, run `bun run db:stop` then
`bun run db:start` to reload it; stopping preserves local data.

Hosted settings require a human dashboard review under
[SYS-15.2–15.4](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-15--configuration-and-hosted-auth),
including the authoritative
[SYS-05 credential policy](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-05--credentials-and-session-lifecycle).
Local configuration and passing integration tests do not verify hosted settings.

### Fake provider and targeted tests

The fake provider has deterministic success, malformed-output and failure scenarios.
Run unit checks without Supabase, and integration checks with the local stack:

```bash
bun run test tests/unit/server/llm tests/unit/llm-internal
bun run db:start
APP_ENV=test AI_PROVIDER=fake bun run test:integration tests/integration/llm
bun run test:integration tests/integration/auth tests/integration/domain
```

The integration harness obtains local configuration in memory, rejects non-loopback
services, commits synthetic fixtures to race independent database connections and
cleans up its own records. Do not supply hosted credentials or make live model
calls. CI includes LLM tests alongside auth/domain integration with explicit fake
settings. See the
[acceptance interface reference](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/tests/integration/llm/README.md)
for contract signatures; its failing-first execution notes describe the G2 baseline.
Full verify, production build and browser journeys remain human G4 checks.

Feature-specific commands appear with each feature above. The main checks are:

| Command | Purpose |
| --- | --- |
| `bun run lint` | ESLint. |
| `bun run typecheck` | Generate Next.js route types, then run `tsc --noEmit`. |
| `bun run test` | Vitest unit tests without Supabase. |
| `bun run test:integration` | Local Auth, HTTP and Postgres integration checks. |
| `bun run test:e2e` | All role browser journeys on local Supabase and a production build. |
| `bun run build` | Production build. |
| `bun run verify` | Local lint, typecheck, unit tests and build; CI also requires integration and e2e jobs. |

Agents use targeted checks. Full verify and e2e are human G4 checks; a command
listed in this guide is not evidence that it has been run for a particular PR.

## Deployment and environments

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

The [production app](https://lgtm-cs3227.vercel.app) uses `lgtm-prod`;
the [development app](https://lgtm-cs3227-dev.vercel.app) uses `lgtm-dev`.
Both hosted environments use the live SoC provider. Local and CI use fake AI.
See [Provider configuration](#provider-configuration).

### Application deployments

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
`AI_PROVIDER` for Preview and Production. Preview uses `lgtm-dev` and
Production uses `lgtm-prod`. Keep `SUPABASE_SECRET_KEY` server-only. Follow [Provider configuration](#provider-configuration) and set the separate
server-only `SOCLAAS_API_KEY` for each hosted Vercel environment.

`vercel.json` selects Singapore (`sin1`), disables Git-triggered deployments,
and configures no cron jobs.

### Product site (GitHub Pages)

The product page is `docs/index.md`. Keep its description of LGTM and its
three roles aligned with [the README](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/README.md), which is the source of
truth for product information.

GitHub Pages builds the site with its built-in Jekyll build and the
[Just the Docs remote theme](https://github.com/just-the-docs/just-the-docs/releases/tag/v0.12.0),
pinned to `v0.12.0` with `color_scheme: dark` in `docs/_config.yml`. The
`jekyll-remote-theme` plugin loads the theme; `jekyll-relative-links` converts
relative Markdown links to their published URLs. No Gemfile, application
build or custom deployment workflow is needed.

The product page, User Guide and Developer Guide are rendered on the site.
Their front matter sets `layout: default`, a navigation `title` and
`nav_order` (1 for the product page, 2 for the User Guide, 3 for this guide).
Use relative Markdown links within `docs/` so they work on GitHub and the site; use full GitHub URLs
for links to repository files outside `docs/`.

{% raw %}
In any `docs/` Markdown, wrap literal `{{` and `{%` in
`{% raw %}`...<code>&#123;% endraw %&#125;</code>, even inside code blocks;
otherwise Jekyll may silently drop them or break the build.
{% endraw %}

The repository publishing settings are configured by a maintainer under
**Settings → Pages → Build and deployment**:

1. Set **Source** to **Deploy from a branch**.
2. Set **Branch** to **master** and the folder to **/docs**.
3. Click **Save**.

These are repository settings, not options in `_config.yml`. See GitHub's
[publishing source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
Subsequent changes to `docs/` on `master` trigger GitHub's Pages build. The product site is
[LGTM on GitHub Pages](https://cs3227-2610-mp4-lgtm.github.io/CS3227-2610-MP4/). Do not add a `.nojekyll` file, which
would bypass Jekyll processing.

## Design considerations

- Immutable revisions preserve what a Learner reviewed even while Authors edit
  or republish. Working drafts and the live revision are separate; the
  [data model](#data-model) describes the retained records.
- Deterministic matching/scoring and progress rules surround model assessment.
  The AI supplies bounded explanation/fix credit and prose, while the server
  computes grades. TA overrides preserve the original assessment and audit
  history. See [grading and progress rules](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#5-deterministic-grading-moderation-and-progress).
- User-scoped clients and narrow RPCs combine record-level access with atomic
  writes. Mutation journals recover lost acknowledgements; row versions and
  locks serialize conflicting edits, lifecycle changes and attempts.
- AI calls capture authorized evidence before dispatch and revalidate before
  publication. No database transaction holds a connection over inference;
  accounting fails closed and retains conservative usage on uncertainty.
- Shared inert code rendering supports all roles without executing submissions.
  Hints avoid revealing private locations/answers, and recommendations use
  explicit rules rather than additional model calls.

## Requirements appendix

Read only the headings and story files named by the task. The
[specification index](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/README.md) explains ownership and identifiers.

| Source | Requirements owned |
| --- | --- |
| [PRODUCT-SPEC](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/PRODUCT-SPEC.md) | Product decisions, role/story index and navigation vocabulary. |
| [TECHNICAL-SPEC](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md) | SYS architecture, identity, sessions, record access and environments. |
| [INTEGRATION-SPEC](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md) | Domain/lifecycle, §3 HTTP contracts, §4 LLM contracts, deterministic grading and seed fixtures. |
| [AI-SECURITY-SPEC](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/AI-SECURITY-SPEC.md) | SEC validation, injection defenses, bounded requests and private material. |

Individual account, Learner, Author and TA story files are linked and described
in the [workflow file reference](#specifications).

## Known limitations

End-user limitations have one home in the
[User Guide](UserGuide.md#known-limitations): fixed roles, no account settings
or recovery features, memory-only review drafts, two attempts and one source
file in the supported languages.

The app does not show remaining AI quota. Shared environment budgets can block
an individual account; see [usage limits](UserGuide.md#usage-limits).
Local tests do not verify hosted dashboard settings. Literal-prefix Codex
hosted-command guardrails have the gaps documented under
[Security](#secrets-and-database-guardrails); those gaps grant no hosted access.
