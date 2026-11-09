# Live SoC provider foundation

## Goal

Implement #66 (T-05) at the shared LLM boundary, with hosted opt-in, existing validation and accounting, and a manual smoke runner.

## Scope

One focused task across four main sessions. Session 4 recorded 4 exchanges as of writing. The earlier exchange count is unknown.

## Session metadata

Codex 0.167.0-alpha.3.2 (Codex Desktop). Session 4 used gpt-6.1-sol, medium reasoning, default service tier (4 turns).

| Main session | ID | Stages | Total tokens in handoff |
| --- | --- | --- | --- |
| 1 | `01a1bff0-2f57-71a1-a702-39731ef20097` | Ready, Plan / G1 | 1821693 |
| 2 | `01a1bff9-900e-73c2-a8db-cbc3dd3d71ad` | Tests / G2 | 3977851 |
| 3 | `01a1c008-18c2-7101-98e6-18e4c585f6c8` | G2 verification, implementation, review, G3, supplementary G2 | 3544325 |
| 4 | `01a1c019-55c3-7850-a953-cdfd4d182b34` | Supplementary G2 verification, fixes, rereviews, docs, G4 | 3024351 at close-out |

Session 4 token totals as of writing

| Input | Cached input | Cache-write input | Output | Reasoning output | Total |
| --- | --- | --- | --- | --- | --- |
| 3890704 | 3780352 | 0 | 15464 | 1179 | 3906168 |

## Key prompts

- “Use sdd-orchestrate. Run #66 (T-05: live SoC provider at the shared LLM boundary) on the high route…” This set the route for separate correctness and security reviews.
- G1 (handoff summary). Size output caps for realistic answers so the 15-second attempt deadline governs slow calls.
- G3 (handoff summary). Resolve REV-01 and SEC-REV-01 through human settings evidence under SYS-19.4. Repeat the SEC-04 review when the key, model or ceilings change.
- “Decision: merge T-05 as the provider foundation; hosted environments stay on fake for now.” Live smoke established how the adapter handled model failures and informed the rollout decision.

## Decisions and corrections

- Pinned `qwen3.5:9b` with reasoning effort `none` and caps of 1,280, 384, 576 and 1,024 tokens for injection, hints, assessment and summary respectively. Limited smoke to 30 calls, four seconds apart, with script-only overrides and complete retained flaw context.
- Supplementary G2 covered deadline precedence and uncertain usage. The second fix separated cap checks from settlement eligibility after rereview exposed a bypass. All 315 targeted tests, lint and typecheck passed.
- Shawn passed verify and e2e. Live smoke validated hints and later assessment. Injection and summary exposed contract failures, and the five-flaw stress case timed out. Answer quality and SoC latency remain follow-ups.

## Files created or modified

- `src/server/llm/`, provider and smoke tests, and the internal usage regression test
- `workflow/scripts/soc-smoke.ts` and its fixtures
- `workflow/PLAN.md`, [#66 handoff](../../workflow/handoffs/66-live-soc-provider.md), and `docs/DeveloperGuide.md`
