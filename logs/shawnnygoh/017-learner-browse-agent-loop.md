# Learner Browse Agent Loop

## Goal

Run issue #49 as high-route T-10 on `feat/49-learner-browse`. Deliver the published challenge catalogue and read-only PR view with a shared code/diff renderer.

## Scope

Eight turns on one feature, its gated review cycle, and this log.

## Session metadata

- Tool — Codex CLI `0.167.0-alpha.3.2`, originating from Codex Desktop
- Model — `gpt-6.1-sol`, medium reasoning effort, default service tier, 8 turns
- Session ID — `01a1ba72-dec1-7631-a281-4cb1379ec2f7`
- Token totals as of writing — input 46638538, cached input 46290944, cache-write input 0, output 54641, reasoning output 13453, total 46693179

The table records each stage's agent token totals. [Handoff stages](../../workflow/handoffs/49-learner-browse.md#stages)

| Stage | Agent totals |
| --- | --- |
| Ready | Orchestrator 1249528 |
| Plan | Initial planner 867271, revised planner 560610 |
| Tests | Integration writer 2102537, unit and e2e writer 1854995 |
| Implement | Implementer 2423324 |
| Initial review | Correctness 922970, security 1289380 |
| Supplementary tests | Test writer 951520 |
| Fix round 1 | Implementer 1759875 |
| Rereview round 1 | Correctness 600467, security 517618 |
| Fix round 2 | Implementer 1109120 |
| Rereview round 2 | Correctness 355607 |
| Docs | Docs agent 362081 |
| Close-out | Orchestrator 45589380 |

## Key prompts

- “Build the SYS-04 code/diff view as a shared component that Author and TA tasks will later reuse with their own projections.” This set the renderer's reuse boundary.
- “You run every database-backed check yourself with per-command escalation; subagents report them as not run.” This assigned database verification to the orchestrator.
- “Rescope tests: screen-state behaviour” goes in “jsdom component tests under tests/unit/learner/”. This kept production browser coverage focused on navigation and access journeys.
- “Approved: supplementary acceptance tests, in NEW files only.” This preserved the original G2 tests and fixture.

## Decisions and corrections

- G1 added explicit GET handlers, shared validated reads and scoped accessibility checks. The human committed plan `009bdd7` and tests `cb5529e`. Expected missing imports required an isolated production baseline to observe the initial browser failures.
- G3 added catalogue RPC and account-switch coverage in `89657a0`. Before fixes, only the stale-cursor case failed, returning HTTP 200 instead of 400.
- Two fix rounds enforced the browser page bound, bound cursors to exact revisions and separated account recovery from record denial. Rereview resumed after an agent quota interruption and cleared all findings.
- Final checks passed 164 targeted unit cases, 75 local integration cases, five production Learner journeys, lint and typecheck. Feature `4a084c2` and docs `0b74797` are committed. Human G4 check results were unreported.

## Files created or modified

- `workflow/PLAN.md`, `workflow/handoffs/49-learner-browse.md`
- Learner routes, components and readers under `src/`, plus shared account and code/diff components and generated database types
- `supabase/migrations/20261108130000_learner_browse.sql`
- Learner tests and fixtures under `tests/unit/learner/`, `tests/integration/domain/` and `tests/e2e/learner/`
- `README.md`, `docs/DeveloperGuide.md`
