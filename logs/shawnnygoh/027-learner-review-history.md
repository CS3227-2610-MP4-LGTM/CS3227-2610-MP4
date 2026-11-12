# Learner review history for #52

## Goal

Deliver T-14, all LRN-08.1–08.8: own-attempt history, effective grades and retained read-only moderation. [Feature handoff](../../workflow/handoffs/52-learner-history.md).

## Scope

One feature across seven main sessions and eight recorded user-assistant exchanges, including this log request.

## Session metadata

Tool: Codex, CLI `0.167.0-alpha.3.2`, originator Codex Desktop. All seven sessions used `gpt-6.1-sol`, medium effort, default service tier: one turn each in sessions 1–6; two in session 7.

Each row was measured with `bun workflow/scripts/rollout-summary.ts --id <Session-ID>`. Token totals as of writing are verbatim, ordered: input, cached input, cache-write input, output, reasoning output, total.

```text
# Session ID                           Turns Input Cached-input Cache-write Output Reasoning Total
1 01a1cef2-69be-7c33-b92a-f738b70f378c 1 527211 485760 0 4367 227 531578
2 01a1cef9-7d4b-7751-8ca1-da4cf409174d 1 1220633 1166720 0 5182 463 1225815
3 01a1cf01-951d-7d00-9e86-d83340d165e4 1 6598680 6487040 0 17077 4133 6615757
4 01a1cf14-d92e-72a3-bc5a-3f6ff930a024 1 1448354 1390592 0 5048 535 1453402
5 01a1cf1b-1e21-7e52-bcbf-8b34dba7afd4 1 2471201 2359552 0 7326 852 2478527
6 01a1cf23-a6c2-7492-b3a7-fba90b395bcd 1 1482133 1415808 0 8246 1410 1490379
7 01a1cf2b-7522-7521-8cbc-fb6e6dae020c 2 4851785 4755584 0 13480 1888 4865265
```

Sessions 1–6 are completed totals. Session 7 is this session's checkpoint as of writing; its totals can increase. The earlier G4 checkpoint was 4458046.

## Key prompts

- “Use sdd-orchestrate. Resume #52 from workflow/handoffs/52-learner-history.md at Implement.” This resumed the approved feature and preserved its human gates.
- “Before stopping for any further committed-test repair, run the full history e2e file with --repeat-each 3 and the existing learner e2e regressions, and report every test-side failure together.” This required complete browser evidence before another repair decision.
- “Cover every main session in the handoff's Main sessions table: for each, record the session ID and token totals using rollout-summary --id.” This defined the log's seven-session scope and measurements.

## Decisions and corrections

1. Session 1 stopped at capacity G3. Shawn approved 19 total / six Learner tasks; session 2 verified policy commit `63b1975` and G1 plan `437f7cf`.
2. T-14 covers all eight history criteria; reports remain T-15. Reuse canonical result readers, preserve feedback/retry and DTO identities, render generic “TA action”, and share neutral flag labels. Add caller-scoped listing/private projection; retain the optional challenge filter.
3. Session 3 demonstrated expected acceptance failures; G2 was `6bdcf67`.
4. Sessions 4–6 stopped for committed-test defects. Human supplementary G2 commits repaired retry-page discovery (`12c1e42`), canonical pending/running fixtures (`4fb58d8`), and both visibility-aware main locators (`644d43a`). Acceptance hashes were renewed; source also suppressed noncompleted overrides.
5. Session 7 passed 83 units, 15 repeated history/browser cases, 16 existing learner browser cases, 8 history integration and 15 TA reads, lint/typecheck. An overlapping fixture run was invalid; serialized reruns passed. Independent correctness/security reviews found no issues; Docs passed.
6. Upstream migration ordering remained compatible; #84 remained open. PLAN/handoff reached done at G4. Human full verify/e2e, commits and PR remain unverified; agents did not commit.

## Files created or modified

- `workflow/PLAN.md`, `workflow/handoffs/52-learner-history.md`
- Learner history API, readers, UI, moderation labels, migration and database types
- Learner unit/integration/browser acceptance tests and fixtures
- `README.md`, `docs/DeveloperGuide.md`

