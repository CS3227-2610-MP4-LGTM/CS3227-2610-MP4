# Domain Schema Agent Loop

## Goal

Run issue #37 as high-route T-03 on `feat/37-domain-schema`, from Ready through G4. Deliver the domain schema, direct-access controls, generated types and developer guidance.

## Scope

Eight user-assistant exchanges covering one feature and its session log.

## Session metadata

Tool is Codex CLI 0.167.0-alpha.3.2, originating from Codex Desktop. Model is `gpt-6.1-sol` with medium reasoning effort and the default service tier for all 8 turns.

Session ID `01a1b5aa-aad1-77d2-ae2f-147890abf65b`.

Token totals as of writing are input 32143583, cached input 31877120, cache-write input 0, output 45690, reasoning output 12177 and total 32189273.

## Key prompts

- “Use the sdd-orchestrate skill. Run issue #37 (feat(db): domain schema) as PLAN task T-03 on the high route, from Ready through Plan, then stop at G1.” Established the specialist workflow and human gates.
- “All stages: you run every database-backed check yourself (I approve escalations per command)” assigned local execution to the orchestrator.
- “Keep one home per fact: TA-only tables hold only what LearnerGrade excludes, and TAs read both.” Required usable Learner feedback alongside separately protected evidence.
- “A grading run's submission, run number and creation time are immutable, and `completed` is a terminal state, for trusted writers too.” Set the scope of the G3 fix.

## Decisions and corrections

- Verified the open issue and upstream base `8544ba6` after escalating sandboxed GitHub and Docker checks. LGTM owned both Supabase ports. Separate Auth fixtures preserved the T-01 cascade.
- Kept all 16 logical records in scope. T-03 grants scoped reads and denies direct writes, with zero new table access for `service_role`. Proposal, hint and summary persistence fails closed pending a provenance spec PR before T-04.
- G1 required separate TA-only grade evidence. G2 required every `LearnerGrade` field except `passMark` to be readable or derivable, plus exact historical visibility checks. Plan `6c0de34` and tests `9f3f762` were human-committed.
- Corrected an ambiguous SQL alias and preserved `graphql_public` when adding private type generation. Both reviews blocked on mutable run provenance and late child inserts. The human deferred late-child prevention to role write paths and their reviews, requiring atomic parent and child creation.
- Four supplemental probes failed before the fix and passed afterward. Both scoped rereviews closed the provenance finding. All 74 integration tests, SQL lint, repository lint and typecheck passed. G4 verify and e2e results were unreported. Implementation and docs commits are `5a31386` and `b99e39e`.

## Files created or modified

- `workflow/PLAN.md`, `workflow/handoffs/37-domain-schema.md`
- `tests/integration/domain/{fixture,schema.test,grading-run-history.test}.ts`, `vitest.integration.config.mts`
- `supabase/migrations/20261107120000_domain_schema.sql`, `src/lib/supabase/database.types.ts`, `package.json`
- `docs/DeveloperGuide.md`, `README.md`
