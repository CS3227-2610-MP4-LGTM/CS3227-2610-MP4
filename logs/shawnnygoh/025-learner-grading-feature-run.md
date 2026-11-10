# Learner grading for #51

## Goal

Grade pinned learner submissions and support same-submission retry (T-12, LRN-05.1–05.7, SYS-10.3). [Feature handoff](../../workflow/handoffs/51-learner-grading.md)

## Scope

One feature, 15 recorded turns across 11 main sessions.

## Session metadata

Codex Desktop, CLI `0.167.0-alpha.3.2`. All 11 sessions used `gpt-6.1-sol`, medium effort, default tier.

Token totals as of writing (input, cached input, cache-write input, output, reasoning output, total).

```text
#  Session ID                           Turns  Tokens
 1 01a1c12c-d8d1-7da1-81a2-b6fe7bebf833 1 1645329 1565440 0 7209 1113 1652538
 2 01a1c133-8876-75e2-b847-ee7a6bf25d7e 2 757375 715776 0 8829 567 766204
 3 01a1c13b-bb60-7eb1-9d87-f94ac1049712 1 7894171 7645184 0 18472 3829 7912643
 4 01a1c14d-738a-76e1-8671-b422dd023bec 4 17430927 17117952 0 38049 12009 17468976
 5 01a1c394-97b7-7481-8bf1-53b9425b7d67 1 6670867 6546688 0 15522 2768 6686389
 6 01a1c3a2-9f73-7031-92d2-1c82ddbdf723 1 1762682 1688832 0 8362 1055 1771044
 7 01a1c3a8-91f1-7d82-ac8b-c1865d90d079 1 6019058 5896192 0 15782 2941 6034840
 8 01a1c3b4-75ba-7571-a974-98a80a010b50 1 1372978 1294848 0 8170 311 1381148
 9 01a1c3ba-3107-7fa0-a269-dbbdc1ed6831 1 2484439 2390528 0 11480 2438 2495919
10 01a1c3ca-4e8b-77f1-ab24-8efdef0b4fc4 1 4595287 4498688 0 10290 1537 4605577
11 01a1c3d3-7e8c-7b93-a235-06f35ba491fd 1 1345723 1276160 0 6078 973 1351801
```

## Key prompts

- “Cover the whole run recorded in workflow/handoffs/51-learner-grading.md (all 11 main sessions, gates, review findings and fix rounds), not only this session.” This sets the log’s scope.
- “Use GitHub username shawnnygoh.” This sets log attribution. Historical prompts are paraphrased below.

## Decisions and corrections

1. Ready verified issue, base and dependencies. G3 assigned bound assessment runs to T-12 (T12-G3-01).
2. G1 approved plan `6b50956` and two setup-only edits (T12-G1-01). Completion enforces a database-clock 60-second deadline. Terminal runs stay frozen.
3. G2 reproduced expected failures and verified setup `0edb365` and acceptance `81a30ef`.
4. Implemented grading. G3 approved the local fake-provider launcher (T12-G3-02). Independent reviews raised intent (REV-01), ledger access (REV-02/SEC-REV-03), replay (REV-03/SEC-REV-01), teardown (REV-04), run expiry (SEC-REV-02) and private UUID echoes (SEC-REV-04). Supplementary G2 reproduced regressions.
5. Verified `c8bd615`. Round 1 fixed intent, ledger coverage and run binding. Rereview retained replay, teardown and UUID findings and raised intent conflicts (SEC-REV-05).
6. G3 approved replay for every validated key, intent conflicts, UUID normalization and fixture locking. Supplementary G2 reproduced nine failures.
7. Verified `2c05277`. Round 2 cleared SEC-REV-05. Rereview found deadline replay mismatch, Unicode UUID bypasses and teardown lock inversion. G3 stopped the two-round loop.
8. Shawn authorized bounded recovery. Four new deadline and Unicode tests failed as expected at G2.
9. Verified `7b63100`. Recovery recorded and replayed `504 AI_TIMEOUT`, stripped ignorable characters and marks during detection, and aligned teardown lock order. Local checks and overlap probes passed. Stopped at G3 for diff review.
10. Shawn approved the recovery fixes. Verified feature, launcher and fixture commits, upstream merge `91cffee`, and TA compatibility test `0fb31bc`. Scoped checks passed, including 48 Chromium cases.
11. Docs and close-out marked T-12 done. G4 full verify, full e2e, live smoke and hosted SoC switch remain unverified.

## Files created or modified

- PLAN, handoff, README and DeveloperGuide
- Learner routes, grading UI and server modules, LLM boundary, migration and database types
- Acceptance, regression and TA compatibility tests, shared harness and smoke fixtures
