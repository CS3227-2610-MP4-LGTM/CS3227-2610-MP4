# #38 — llm-boundary

- **Route:** high
- **PLAN task(s):** T-04
- **Branch:** `feat/38-llm-boundary`
- **Base commit:** `9292add49b42a743b2eff51c73f2ef8f6825bf2c`
- **Status:** done

## Goal

Implement the shared SYS-03 server-only LLM boundary, fake provider, INTEGRATION-SPEC §4 contracts and shared SEC-01–SEC-06 controls, including durable SEC-04 limits and SEC-05 accounting. Role features supply their own authorized operations and persistence.

## Stages

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | Codex | complete | Issue #38 verified open through GitHub. Live upstream master and local HEAD equal the recorded base; branch created there. SYS-03, INTEGRATION-SPEC §4 and SEC-01–SEC-06 exist at that commit. T-01 and T-03 are done in PLAN. Current SYS-10.3 names generated persistence and usage accounting paths. | unavailable |
| Plan / G1 | planner / high | complete | Human approved by committing `fc85ac9` and requesting continuation. Verified first feature commit changes only PLAN and matches proposed T-04. Four foundation tasks fit capacity; all four shared contracts, fake execution, safety checks and durable accounting included; role-specific mutations remain downstream. | unavailable |
| Tests / G2 | test-writer / medium | complete | Human approved by committing `de5d8c7` and requesting continuation. Verified commit contains only the 11 acceptance files and integration include list; tracked and staged baseline unchanged. Pre-implementation unit run: five missing-new-module suite failures, two expected isolation failures, one source-scan pass. Integration target: two missing-accounting-module suite failures, no hooks/assertions reached. Lint passed; typecheck only 11 missing-module diagnostics. Local fixture setup/cleanup smoke passed and synthetic records removed. Signatures/map in `tests/integration/llm/README.md`. | unavailable |
| Tests / G2 supplement | test-writer / medium | complete | Human approved G3-TEST-01 and committed `1b6440bb40003505aeb7809920f7d7c51281dfe5`. Verified commit changes only four `$2::oid` casts; all assertions and other baseline files unchanged. Orchestrator reran local accounting integration: all 29 tests passed. Revised accounting test blob `8d3c98ba8461cfb767ae358bc3b53d8c30cd6eef`. | unavailable |
| Tests / G2 supplement 2 | test-writer / medium | complete | Human approved G3-TEST-02 and committed `52d08b8`. Verified only the overflow fixture's subsequent-pull closure condition changed; all assertions unchanged. Orchestrator provider test run: all 22 passed. Revised provider blob `c8f1fe3b4b925fdb6f48436971e1e5c353a7532f`. | unavailable |
| Implement | implementer / medium | complete | Orchestrator verified pre-review 177 unit tests, 149 LLM/auth/domain integration tests, lint, typecheck and local database lint passed. Both new migrations applied without reset; database types regenerated. Acceptance paths match G2 plus both human supplements, including staged changes. Implementation scope checked; no dependency/spec/agent edits. Final post-review checks appear in fix round 1 below. | unavailable |
| Review | reviewer / medium and security-reviewer / high | completed with blocking findings | Both reviewers completed read-only review and reran 177 unit tests. Tree digest matched before/after: `2e56c3e248358fe52cf635f2e788a7b2aadf988aa827cd9387a2071bb9f6d3c0`. Blocking P2 findings grouped below. Fix round 1 authorized by workflow; no acceptance changes required. | unavailable for both |
| Implement / fix round 1 | implementer / medium | complete | Orchestrator verified 201 unit tests, 75 LLM integration tests, lint and typecheck passed. Three real runner/PG-store probes passed: provider expiry at 35s, close crossing expiry before DB completion, and clock crossing after committed close; all returned AI_TIMEOUT, active slots zero, correct full/verified charges and late-settlement denial. Durable usage events present; fixtures cleaned. No SQL or acceptance changes in fix round. Source frozen for rereview. | unavailable |
| Rereview / fix round 1 | reviewer / medium and security-reviewer / high | complete | Both reviewers closed all their findings and found no new blocking regressions; each reran 201 unit tests and security ran independent in-memory probes. Digest matched before/after: `d4a24c4097150c64a55e882b84f33ae6be5a8e17b9bc9e873eaed6a1744d9ff0`. Their DB checks remained unrun as instructed; orchestrator supplies the 75 post-fix integration tests and three real-store expiry probes above. | unavailable for both |
| Docs | docs / low | complete | README and DeveloperGuide document reviewed foundation, fake-only runtime, usage accounting, checks and downstream responsibilities. Guide-only scope, source accuracy and Markdown checked; 44 repository link targets exist. | unavailable |
| Close-out / G4 | Codex | awaiting human validation | All agent stages pass; one review fix round used. Final acceptance baselines unchanged. Human verify reported six jsdom worker startup errors. Orchestrator reproduced the failure when Node was absent from PATH (Bun fallback), then all six affected files / 54 tests passed with Node 24 on PATH. Full verify/build/e2e completion remains unverified; rerun with Node 24 active. Commits, log and PR remain human-owned. | unavailable |

## Decisions

Human approved G3-TEST-01 on 2026-11-08: add explicit OID casts to the four existing privilege-function relation parameters without changing assertions.

Human approved G3-TEST-02 on 2026-11-08: keep the overflowing response fixture open until cancellation, without changing assertions.

## Findings

| ID | Priority | Criterion | Status | Evidence and fix direction |
| --- | --- | --- | --- | --- |
| REV-01 / SEC-REV-02 | P2 blocking | SEC-03.1 | Resolved | Link filtering covers URI schemes and reference Markdown; hint/feedback regressions and both reviewers' probes pass. |
| REV-02 | P2 blocking | SEC-04.1, SEC-05.2–05.3 | Resolved | Accounting commits expiry separately around failed transitions; runner preserves timeout. Three real-store probes verify expiry, charges and late rejection. Correctness rereview closed the finding. |
| REV-03 / SEC-REV-04 | P2 blocking | SEC-04.1 | Resolved | Fake adapter measures serialized UTF-8 output, enforces its ceiling and reports verified usage. Equality/overflow and actual-runner regressions pass; both reviewers closed findings. |
| SEC-REV-01 | P2 blocking | SEC-01.2, SYS-13.1, SYS-18.1 | Resolved | Real live destinations remain denied; offline transport seam requires test runtime, reserved .invalid destination, injected transport and fake configuration, rechecked per dispatch. Security rereview probe confirms zero unapproved calls. |
| SEC-REV-03 | P2 blocking | SEC-04.1, SEC-05.2 | Resolved | Deadline carried through close and final boundary reauthorization/capture. Late completion and reauthorization regressions pass; security rereview closed finding. |

G3-TEST-01 and G3-TEST-02 are resolved by human approvals and test commits `1b6440b` and `52d08b8`. The OID-cast and stream-source corrections preserve all assertions. Both were committed before implementation resumed. No unresolved findings remain.

## Interfaces defined by tests

See [the acceptance contract](../../tests/integration/llm/README.md) for original signatures and criterion mapping, and [the Developer Guide](../../docs/DeveloperGuide.md#shared-llm-boundary) for reviewed behavior. Implemented modules under `src/server/llm/`: `contracts` (validation, candidate assembly and bounded JSON parsing), `safety`, `config`, `provider` (request construction, measurement, fake provider and restricted offline transport seam), `execution` (trusted runner), `accounting` (durable accounting RPC port), and `boundary` (verified authorization, snapshots and own usage projection).

The acceptance reference's missing-import notes describe G2, not current behavior. Final unit and database evidence is recorded above. Reviewers did not run database checks; the orchestrator did. Account-budget races retain the one-active-operation ceiling, so that ceiling can mask which admission check rejects the loser; sequential budget equality/exhaustion tests additionally verify each budget. Full Next production client-build evidence remains G4. Role endpoints, result persistence, scoring/flags, browser rendering and cached-hint reads remain downstream.

## Open questions

None. Both G3 corrections and supplemental human test commits verified.

## G2 baseline

Final Git blobs from `de5d8c7` with approved supplements `1b6440b` and `52d08b8` (acceptance paths must remain unchanged, including staged changes):

| Path | Git blob |
| --- | --- |
| `tests/integration/llm/README.md` | `251c9063bf2dde8247c82700a732b5b9ad2a14c4` |
| `tests/integration/llm/accounting.test.ts` | `8d3c98ba8461cfb767ae358bc3b53d8c30cd6eef` |
| `tests/integration/llm/boundary.test.ts` | `e7877645bd75ff3522e834e2071c98c1396d04fa` |
| `tests/integration/llm/harness.ts` | `49830a293c017d6a9e07d845a6cfb6c39f612a87` |
| `tests/unit/server/llm/config.test.ts` | `a02eb595dcdb58a82e54699382c8cf1dbc5acb57` |
| `tests/unit/server/llm/contracts.test.ts` | `3845a1959d769516d7f583bb3ae6e2932ea84b89` |
| `tests/unit/server/llm/execution.test.ts` | `0d661ed10264935316788eb9aceaed66dced60b6` |
| `tests/unit/server/llm/fixtures.ts` | `4c7002663d10cefe3ca42714e58813313a099a15` |
| `tests/unit/server/llm/isolation.test.ts` | `4b5051a21b7eb069992aa0f2c8054cedaa9028b0` |
| `tests/unit/server/llm/provider.test.ts` | `c8f1fe3b4b925fdb6f48436971e1e5c353a7532f` |
| `tests/unit/server/llm/safety.test.ts` | `6018013403b40db5af0594a6f54c662004342488` |
| `vitest.integration.config.mts` | `33851549625f2a5510e2c031e85b4d6727eec8a4` |

## Next action

Human G4: run `bun run verify` and `bun run test:e2e`, review the diff, commit implementation then docs separately, write the session log and open the feature PR from the fork to upstream master. Agents have not committed, pushed or opened a PR.

```sh
bun run verify
bun run test:e2e

git add src/server/llm src/lib/supabase/database.types.ts supabase/migrations/20261108120000_llm_accounting.sql supabase/migrations/20261108123000_llm_usage_events.sql tests/unit/llm-internal .github/workflows/ci.yml workflow/PLAN.md workflow/handoffs/38-llm-boundary.md
git commit -m "feat(llm): add server-only boundary and usage accounting" --trailer "Agent: Codex"

git add README.md docs/DeveloperGuide.md
git commit -m "docs(llm): explain shared boundary and accounting" --trailer "Agent: Codex"
```

After writing `logs/TaiaYovelaPang/005-llm-boundary-agent-loop.md`:

```sh
git add logs/TaiaYovelaPang/005-llm-boundary-agent-loop.md
git commit -m "chore(logs): record LLM boundary agent loop" --trailer "Agent: Codex"
```
