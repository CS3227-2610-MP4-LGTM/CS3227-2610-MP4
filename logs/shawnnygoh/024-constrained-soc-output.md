# Constrained SoC output for #77

## Goal

Improve the validity of live SoC responses across four operations and measure assessment agreement against 21 labelled E6 cases. [Feature handoff](../../workflow/handoffs/77-constrained-llm-output.md)

## Scope

One feature across seven recorded user-assistant exchanges in three main sessions on 9 Nov 2026.

## Session metadata

Codex Desktop, CLI `0.167.0-alpha.3.2`. All main sessions used `gpt-6.1-sol`, medium reasoning effort, default service tier.

Token totals as of writing.

| Session | Session ID | Turns | Input | Cached input | Cache-write input | Output | Reasoning output | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ready and Plan | `01a1c0c0-64f6-7f52-a6db-1995168a4562` | 1 | 1531822 | 1457664 | 0 | 7352 | 548 | 1539174 |
| Tests | `01a1c0c5-55d0-7d10-8771-9f5713906a0d` | 3 | 1722227 | 1629184 | 0 | 17034 | 2735 | 1739261 |
| Implement through G4 | `01a1c0d2-ddcf-7980-b762-4b84ff474799` | 3 | 4185178 | 4072704 | 0 | 20587 | 5241 | 4205765 |

## Key prompts

- “Use sdd-orchestrate. Resume #77 from workflow/handoffs/77-constrained-llm-output.md at Implement. G2 commit: 272c798. Session 2 final total: 1739261.” This anchored implementation to the approved tests and carried forward Session 2’s measured total.
- “Record it in the handoff's Close-out evidence and Findings, then stop; no code changes.” This recorded the operator’s smoke results and deferred quality work.

## Decisions and corrections

- **Session 1.** Shawn approved the standard route and extended T-05 in place because Foundations was full. The plan landed at `cc9745e`. Shawn reviewed the development key limits and pinned `qwen3.6:35b` with the existing effort, caps and timing.
- **Session 2.** Shawn dropped the injection order assertion and narrowed the summary assertion to text before evidence IDs. Assessment feedback remained before both credits in the schema. The revised tests had 31 expected failures and 303 passes before G2.
- **Session 3.** Review prompted deriving wire schemas from the app contracts. Rereview, 334 targeted tests, lint and typecheck passed. An independent simulated byte-boundary check covered the remaining test gap.
- **G4.** E6 returned 19/21 valid, with exact explanation, fix and joint agreement of 12/19, 15/19 and 9/19. Three §6 operations returned 3/3 valid each. Injection returned 0/3 and the stress run timed out. vLLM reordered keys alphabetically. Nesting credits restored feedback-first output but yielded 15/21 valid and 10/15 joint agreement. Shawn accepted #77, kept T-05 done and assigned grading accuracy to T-12, injection quality to Author and stress timing to SEC-04. Full verify, database integration and Playwright remain unverified.

## Files created or modified

- `workflow/PLAN.md` and `workflow/handoffs/77-constrained-llm-output.md`
- `tests/unit/server/llm/soc-provider.test.ts` and `tests/unit/server/llm/soc-smoke.test.ts`
- `src/server/llm/{config,contracts,soc}.ts`
- `workflow/scripts/soc-smoke.ts` and `workflow/scripts/fixtures/soc-smoke/assess-review-e6.json`
- `docs/DeveloperGuide.md`
