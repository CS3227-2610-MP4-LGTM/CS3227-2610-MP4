# Auth Core Agent Loop

## Goal
Run issue #12's high-route auth-core workflow through human plan/test gates, implementation, independent reviews and documentation, stopping at G4.

## Scope
Five user-assistant task exchanges covering one auth-core feature loop and its session log.

## Session metadata
Tool: Codex CLI 0.167.0-alpha.3.2; originator: Codex Desktop. Model: gpt-6.1-sol; reasoning effort: medium; service tier: default; 5 turns.

Session ID: `01a1b13a-3592-7441-9de9-92b21b2b4865`.

Token totals as of writing: input 18736131; cached input 18565376; cache-write input 0; output 49975; reasoning output 14432; total 18786106.

## Key prompts
- “Run the agent loop with sdd-orchestrate for #12 (auth core), route high.” Required specialist stages and human gates for authentication boundaries.
- “Subagents may not be able to get approvals. Run every database-backed check yourself.” Assigned database execution and escalation to the orchestrator.
- “The SYS-10.1 probe means new public tables get no default grants for anon, authenticated or service_role.” Established explicit grants for future domain and approved admin/LLM operations.
- “Specs own the rules.” Required documentation to link validation requirements instead of duplicating them.

## Decisions and corrections
- Reused `feat/12-auth-core` at upstream `74377f7`. Escalated blocked Docker/loopback checks; stopped conflicting `homebrew` Supabase without deleting data, started LGTM and verified Auth health.
- Split T-01 core (#12) from dependent T-02 pages (#39); reserved task-ID ranges by group while retaining task-count capacity. G1 commit: `b05e7ee`.
- Human split SYS-07.1 server reads/browser delivery and moved unobservable request outcomes to T-02. Constraints live only in PLAN. Authorized Node 25.6.1 targeted checks; CI Node 24 remains the gate.
- Main resolved the writer's stalled dependency approval by installing test-only pg/types. Corrected Vitest collection and the installed Next testing export before G2. G2 commit `7b9211e` added tab/newline-only metadata rejection; recorded hashes, confirmed red, preserved tests, and removed the uncommitted acceptance map after moving interfaces/command into the handoff.
- Implemented atomic provisioning, immutable profiles, fail-closed auth and refresh. Added constrained own-row `private.profile_roles` for nonrecursive RLS checks. Raised local Auth limit to 300 and restarted; hosted limits unchanged. Normalized generated-type whitespace without masking failures.
- Main passed 62 targeted unit tests, 31 integration tests, lint, typecheck and schema lint. Both fresh reviewers found no findings; frozen-tree digests matched.
- Docs redo removed future-task/fake-LLM claims, linked authoritative validation and documented the RLS convention. Section counts: 213→171 and 226→181; headings/Explicit grants unchanged; 34 links checked.
- Stopped at G4. Full verify/build/e2e, CI Node 24 and hosted settings remain unverified. Agents made no commits, pushes or PRs.

## Files created or modified
- `workflow/PLAN.md`, `workflow/handoffs/12-auth-core.md`
- `src/server/auth/{validation,service,account}.ts`, `src/proxy.ts`, `src/lib/supabase/database.types.ts`
- `supabase/migrations/20261106151000_auth_core.sql`, `supabase/config.toml`
- `tests/unit/auth/*.test.ts`, `tests/integration/auth/{core.test,local}.ts`, `tests/unit/server/auth/validation.test.ts`
- `vitest.config.mts`, `vitest.integration.config.mts`, `package.json`, `bun.lock`, `.github/workflows/ci.yml`
- `docs/DeveloperGuide.md`, `README.md`
