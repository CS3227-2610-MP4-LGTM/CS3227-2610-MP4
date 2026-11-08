# Shared LLM Boundary Agent Loop

## Goal
Implement SYS-03's server-only LLM foundation, fake provider, four integration envelopes and SEC-01–SEC-06 controls, including durable usage reservation and settlement.

## Scope
Nine user-assistant exchanges covering one feature, workflow approvals, verification diagnosis and logging.

## Session metadata
- Tool: Codex, CLI `0.166.0-alpha.5.1`; originator: Codex Desktop.
- Model: `gpt-6.1-sol`; reasoning effort: `medium`; service tier: `default`; 9 turns.
- Session ID: `01a1b9d9-480c-7741-a974-d34ba9bcd98c`.
- Token totals as of writing: input `38800574`; cached input `38562432`; cache-write input `0`; output `71949`; reasoning output `33420`; total `38872523`.

## Key prompts
- “Implement the SYS-03 server-only LLM boundary with the fake provider, the INTEGRATION-SPEC section 4 envelope, and SEC-01 to SEC-06 enforcement including SEC-04 limits and SEC-05 reservation and settlement. Role features add their own operations on top.” This defined the shared foundation while leaving role endpoints and result persistence downstream.
- “Implement this in a new feat/ branch” This required isolated feature work, carried out on `feat/38-llm-boundary`.

## Decisions and corrections
- Used the high-route specialist workflow for open issue #38. Verified upstream base `9292add`; human committed plan `fc85ac9` and acceptance tests `de5d8c7` before implementation.
- Human approved two test corrections without changing assertions: explicit PostgreSQL OID casts (`1b6440b`) and keeping an overflowing stream open until cancellation (`52d08b8`). Implementation paused at each required gate.
- Added strict schemas, authorized snapshots, Unicode learner-text checks, fake execution, limits, atomic accounting RPCs and append-only usage events. Applied two migrations locally without reset and regenerated types. Added no dependencies; live dispatch remains disabled.
- Correctness and security reviews found link-filter gaps, underbounded fake output, transport-gate bypass and expiry handling defects. One fix round resolved every finding; both rereviews passed with matching frozen-tree digests.
- Final checks passed: 201 targeted unit tests, 149 integration tests across LLM/auth/domain, a post-fix 75-test LLM rerun, three real-store expiry probes, lint, typecheck and SQL lint. Guides and links checked.
- Human full verify reported six jsdom worker errors. Reproduced Bun fallback when Node was absent from PATH; all six affected files/54 tests passed with Node 24 active. Full verify/build/e2e completion remains unverified.
- Agents did not commit, push or open a PR. Human implementation/docs commits and G4 close-out remain outstanding.

## Files created or modified
- `workflow/PLAN.md`; `workflow/handoffs/38-llm-boundary.md`
- `src/server/llm/` (contracts, safety, config, provider, execution, accounting, boundary, errors and Unicode folding)
- `src/lib/supabase/database.types.ts`
- `supabase/migrations/20261108120000_llm_accounting.sql`
- `supabase/migrations/20261108123000_llm_usage_events.sql`
- `tests/unit/server/llm/`; `tests/unit/llm-internal/`; `tests/integration/llm/`
- `vitest.integration.config.mts`; `.github/workflows/ci.yml`
- `README.md`; `docs/DeveloperGuide.md`
