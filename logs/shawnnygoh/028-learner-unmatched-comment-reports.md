# Learner unmatched-comment reports for #52

## Goal

Deliver T-15, all LRN-07.1–07.7: a Learner reports an unmatched comment on their own completed result, creating one immutable `learner_report` flag per submission and comment. [Feature handoff](../../workflow/handoffs/52-learner-reports.md).

## Scope

One high-route feature across five main sessions and two human-opened review sessions. Session 5 had two user-assistant exchanges (close-out, then this log request).

## Session metadata

Tool: Claude Code (desktop app). Session 5 model: Claude Opus 5.5 (`claude-opus-5-5`); other sessions' models are unknown. Stage efforts recorded in the handoff: Ready and Plan high, Tests and Implement medium, Docs and Close-out low. Session IDs: unknown. Claude Code has no readable rollout for `rollout-summary.ts`, so token totals are unavailable. Context usage at each session's end, as reported by Shawn:

```text
Session              Stages                                  Context usage
1                    Ready, Plan / G1                        128,265
2                    Tests / G2                              248.1k
3                    Implement                               214.4k
4                    Review results, REV-01 fix, Docs        110.3k
5                    Close-out / G4, this log                76.1k
Reviewer             Correctness review                      116.2k
Security reviewer    Security review                         90.1k
```

## Key prompts

- “Use sdd-orchestrate in its "Without subagent support" mode. Resume #52 from workflow/handoffs/52-learner-reports.md at Close-out.” This resumed the feature at its last stage, run in the main session because Claude Code cannot spawn specialists.
- “the Developer Guide's "Report contract and persistence" paragraph now links INTEGRATION §3 Learner surface and Transport and §5 Flags instead of listing status codes and envelopes; record it in the Docs row.” This recorded a human docs-only edit made between sessions.
- “Recheck master and PR #98, then give the G4 commands.” This required fresh collision evidence before the human commits.

## Decisions and corrections

1. Shawn made T-15 a separate PLAN task on #52 covering all of LRN-07. G1 was `93ef7a4`.
2. Decision 1 (approved with a condition): one 409 `INVALID_STATE` covers an ineligible comment, an already-reported pair and an in-progress replay, told apart by shared message constants in `src/lib/learner/`. The PLAN amendment was committed as `b434a1e`.
3. Decision 2: a comment is eligible when the completed original grade lists it as unmatched, whether or not the result is published. Decision 3: replaying a recorded success returns the flag's current `FlagView`. The migration was ordered after master and PR #98.
4. G2 tests were committed as `f6c2cde`, and implementation left them unchanged. In session 3, `bunx supabase migration up` was denied, and Shawn chose `bun run db:reset` instead.
5. Both fresh reviews ran with matching tree digests. The only finding was REV-01 (P3), which Shawn had fixed directly without a rerun.
6. Session 5 recorded the guide edit and checked its anchors. Master was unchanged at `bf16af7`. PR #98, still open, now also edits the guide, in a separate area. T-15 and the handoff are `done`. Human G4 steps (verify, e2e, commits, PR) are unverified.

## Files created or modified

- `workflow/PLAN.md`, `workflow/handoffs/52-learner-reports.md`
- Report migration, database types, report route, server and shared modules, and learner report UI
- Learner unit, integration and browser acceptance tests and fixtures
- `README.md`, `docs/DeveloperGuide.md`
