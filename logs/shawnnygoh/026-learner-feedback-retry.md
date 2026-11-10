# Learner feedback and retry for #52

## Goal

Deliver T-13 with original assessment feedback, eligible cached hints and one retry pinned to the first attempt's revision. [Feature handoff](../../workflow/handoffs/52-learner-feedback-retry.md)

## Scope

One feature across six main sessions and 8 recorded user-assistant turns, including this log request.

## Session metadata

Codex Desktop, CLI `0.167.0-alpha.3.2`. All sessions used `gpt-6.1-sol` with medium effort and default tier.

Token totals as of writing (input, cached input, cache-write input, output, reasoning output, total).

```text
# Session ID                           Turns Tokens
1 01a1c407-38e9-73e3-8ee3-41f45204dc21 1 2267348 2162944 0 7505 1053 2274853
2 01a1c413-28ea-74b3-bfa6-23c731ae69f6 1 393352 357376 0 3572 166 396924
3 01a1c415-6ecc-7092-ae6a-f236d7074ede 1 8720223 8406784 0 15841 3386 8736064
4 01a1c424-84a6-7871-92ca-23623d7fe00d 2 17147007 16827904 0 35595 6716 17182602
5 01a1c57f-0afd-7e33-bece-52c5d2a87221 1 2380942 2279424 0 9400 765 2390342
6 01a1c585-7759-73a0-a647-ab77a320e423 2 8573363 8393472 0 24305 7534 8597668
```

Session 6's handoff checkpoint at G4 was `7864884` before the log request.

## Key prompts

- “Use sdd-orchestrate. Resume #52 from workflow/handoffs/52-learner-feedback-retry.md at Implement (REV-04 recovery). Supplementary G2 commit: 9707a98. Session 5 final total: 2390342.” This supplied the recovery gate and final prior-session total.
- “Cover main sessions 1–6 as recorded in workflow/handoffs/52-learner-feedback-retry.md, and write it to logs/shawnnygoh/026-learner-feedback-retry.md.” This set the scope and destination.

## Decisions and corrections

1. Ready verified the base and dependencies. G1 scoped T-13 to LRN-06 on the high route and assigned LRN-07/08 to T-14. The plan reused stored feedback, caller-scoped hints and the submission ledger.
2. G1 approved plan `cc4ff60` and narrow compatibility edits. The result DTO stayed fixed, with live retry eligibility reflected as grading completes. Each attempt uses its own eligible hints.
3. G2 verified compatibility commit `19fdb02` and acceptance commit `544cdf9` after expected failures in unit, integration and Chromium tests.
4. Implement and Review fixed stale eligibility after grading (REV-01) and draft discard and departure (REV-02). A rereview resumed after a usage limit. G3 stopped after two fix rounds with stale Forward restoration (REV-04). Security passed.
5. Shawn authorized one recovery cycle and accepted REV-03, SEC-REV-01 and SEC-REV-02 for the PR. Supplementary G2 reproduced Forward exposing the editor after unpublish.
6. Verified `9707a98`. Restored entries show “Loading retry…” and reload through the existing caller-scoped check. Rereview and Docs passed. On Node 24.22.2, 193 unit, 93 integration and 11 Chromium cases passed, plus two probes, lint and typecheck. Full verify, full e2e and Jekyll remain unverified.
7. At G4, fixed the Chromium retry test to read the second attempt ID from the result URL after document navigation while retaining the 201, request body, distinct ID and result assertions.

## Files created or modified

- `workflow/PLAN.md`, T-13 handoff, README and Developer Guide
- Learner routes and UI, workspace history tracker, submission helpers, migration and database types
- Learner acceptance, compatibility and recovery tests
