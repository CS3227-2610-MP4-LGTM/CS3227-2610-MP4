# #37 — domain-schema

- **Route:** high
- **PLAN task(s):** T-03
- **Branch:** `feat/37-domain-schema`
- **Base commit:** `8544ba66608441d48445b9baba72b57f8ad7cee4`
- **Status:** done

## Goal

Add the INTEGRATION-SPEC §2 domain schema with generated types and direct database protections under SYS-10.1–10.2, SYS-12 and the applicable direct database clauses of SYS-12.1, SYS-12.4, SYS-12.5 and SEC-01.1.

## Stages

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | Codex | complete | [#37](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/issues/37) open. HEAD, local `upstream/master` and live upstream `master` match the recorded base. Cited criteria and sections exist at that commit. T-01 is done. Ports 54321/54322 belong to the existing `lgtm` stack. T-01 deletes its Auth fixtures and uses the existing profile cascade. | unavailable |
| Plan / G1 | planner / high | complete | Human approved [T-03](../PLAN.md#t-03-domain-schema) and the high route. Verified `6c0de34aaf920cd0f20e2082a7e0ffed6ef4ff28` is the first feature commit and changes only PLAN. No scope deferral. | unavailable |
| Tests / G2 | test-writer / medium | complete | Human approved `9f3f76230260e413350eb469fc940847bd4bcdb2`. The test commit contains only the two domain test files and the integration config. The pre-migration suite recorded 5 expected failures and 34 skips. Three checks report missing relations. The public default ACL probe detects function and sequence access, and the private probe detects function access. The T-01 Auth baseline passed (31 tests). Targeted lint and typecheck passed. | unavailable |
| Implement | implementer / medium | complete | Added the domain migration and regenerated types for `public`, `graphql_public` and `private`. Local reset, the 39 domain and 31 Auth tests, Supabase SQL lint, repository lint and typecheck passed on Node 24.22.2. G2 file hashes and implementation scope verified. | unavailable |
| Review | reviewer / medium and security-reviewer / high | blocked at G3 | Both reviewers identified blocking P2 criterion failures. Review tree digest matched before and after (`b2de4933ffa2491caf91b762403ccdbba254cbfe49d49d6aa6c488697599d862`). G2 test hashes match. No review fix round started. | unavailable for both |
| Tests / G2 supplement | test-writer / medium | complete | Human approved `73047d1000b68856adcf8e6143017a5ef215fc75`, which adds only the [REV-01 probes](../../tests/integration/domain/grading-run-history.test.ts#L90). All four failed as expected on the pre-fix local database and rolled back their changes. Both G2 baselines match. | unavailable |
| Implement / REV-01 | implementer / medium | complete | Added the [grading-run protection trigger](../../supabase/migrations/20261107120000_domain_schema.sql#L699). Local reset, all 74 integration tests, Supabase SQL lint, type generation, repository lint and typecheck passed on Node 24.22.2. Regenerated types are byte-identical to the initial implementation output. Both G2 baselines match. | unavailable |
| Rereview / REV-01 | reviewer / medium and security-reviewer / high | complete | Both scoped rereviews closed REV-01 / SEC-REV-02. Review tree digest matched before and after (`52843d2ac6bd68beea00d4a4567e593ccaaee9e5856b77397dc4413b810fe820`). Both G2 baselines match. | unavailable for both |
| Docs | docs / low | complete | [Developer Guide](../../docs/DeveloperGuide.md#domain-schema) and [README](../../README.md) describe the reviewed schema and local checks. Guide-only scope and Markdown links verified. | unavailable |
| Close-out / G4 | Codex | awaiting human validation | Agent stages complete. Human `bun run verify` and `bun run test:e2e` remain unverified. | 31159918 |

## Decisions

| Date | Who decided | Decision and one-line reason |
| --- | --- | --- |
| 2026-11-07 | Human | T-03 has no new table access for `service_role` and denies all direct writes by `anon` and `authenticated`. Reviewers should treat zero `service_role` access as intentional. Role tasks own their entry points and corresponding SYS-10.3 uses. |
| 2026-11-07 | Human | Proposal, hint and summary persistence fails closed. A team spec PR will settle server-generation provenance before T-04. |
| 2026-11-07 | Human | The orchestrator runs all database-backed checks with per-command escalation. Specialists report them as unrun. Use separate domain fixtures so no test deletes an Auth user who owns domain rows. |
| 2026-11-07 | Human | Store only fields `LearnerGrade` may expose in the Learner-readable grade record. Store matching and per-flaw assessments in a separate foreign-key-linked table with TA-only reads. Both roles use `authenticated`, so column grants cannot distinguish them. |
| 2026-11-07 | Human | The owning Learner and TAs can read or derive every `LearnerGrade` field except `passMark` from the same scoped grade data. Store each grade fact once. Comment classifications, credits and feedback and eligible hint IDs and categories are Learner-readable. Flaw links, match distances, missed-flaw identities and grade-to-run and retry provenance stay in TA-only evidence. TAs read both parts. |
| 2026-11-07 | Human | Fix REV-01 / SEC-REV-02 narrowly in T-03 to preserve grading-run provenance. A run's submission, run number and creation time are immutable, and `completed` is terminal for trusted writers too. The Learner grading task owns other state transitions. |
| 2026-11-07 | Human | Defer REV-02 / SEC-REV-01 because T-03 adds no write path and only a future privileged write path could add late children. Role tasks must create a parent and all its immutable children in one operation. No write path may add children to an existing submission, revision, grade or summary. Reviewers of those role tasks check that rule. |

## Findings

| ID | From | Priority | Criterion | Status | Resolution |
| --- | --- | --- | --- | --- | --- |
| REV-01, SEC-REV-02 | Correctness and security | P2 blocking | INTEGRATION-SPEC §2, SYS-12.1, SYS-12.4 | Resolved | The [grading-run update trigger](../../supabase/migrations/20261107120000_domain_schema.sql#L699) freezes submission, run number and creation time for every run and makes `completed` terminal. The four approved regression probes passed. Both reviewers verified the full guard by inspection. |
| REV-02, SEC-REV-01 | Correctness and security | P2 blocking | INTEGRATION-SPEC §2, SYS-12.4 | Resolved by human decision | Deferred to the role tasks and their reviews under the 2026-11-07 parent-and-children write rule above. |

## Interfaces defined by tests

The [domain fixture](../../tests/integration/domain/fixture.ts) lists the 22 required SQL relations, seed columns and access matrix. The six FK-backed additions to the 16 logical records are `proposals` for proposal identity, `ai_grade_evidence` and `ai_grade_assessments` for TA-only evidence, `ai_grade_comment_results` and `ai_grade_eligible_hints` for the owning Learner and TAs, and `performance_summary_evidence` for summary-to-submission references. Tests discover placement in `public` or `private`.

## G2 baseline

| Path | Git blob at G2 |
| --- | --- |
| `tests/integration/domain/fixture.ts` | `001532ce944056def93ab04e741a136497d39307` |
| `tests/integration/domain/schema.test.ts` | `70b7ae109ea1e1c39a95ef323ff0ebbe2221df95` |
| `vitest.integration.config.mts` | `0c867cf6c14aa079a70a7a359c80f88ade1421cc` |
| `tests/integration/domain/grading-run-history.test.ts` | `9623ac7f949d7ccfa06c04fc7218909deba1f1d2` |

## Open questions

None. The human resolved both G3 decisions on 2026-11-07.

## Next action

At G4, the human runs `bun run verify` and `bun run test:e2e`, commits the reviewed implementation and handoff and then the guide updates, writes the session log, and opens the feature PR. Include the G3 decisions in the PR. Human validation remains unverified until reported.
