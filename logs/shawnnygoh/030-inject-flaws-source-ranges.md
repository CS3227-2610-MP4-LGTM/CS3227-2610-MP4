# Inject Flaws Source Ranges

## Goal
Fix #107 so Authors can generate publishable flaw proposals despite incorrect model-supplied source line numbers, and reduce truncated injection responses.

## Scope
Two user-assistant exchanges covering one focused fix and its session log, attributed to `shawnnygoh` as requested.

## Session metadata
Tool: Codex, CLI `0.167.0-alpha.3.2`; originator: Codex Desktop.
Model: `gpt-6.1-sol`; reasoning effort: `medium`; service tier: `default`; 2 turns.
Session ID: `01a1d0ab-2a6b-7890-8236-bcc7617b015c`.

Token totals as of writing:
```json
{
  "input_tokens": 1192886,
  "cached_input_tokens": 1126784,
  "cache_write_input_tokens": 0,
  "output_tokens": 6395,
  "reasoning_output_tokens": 766,
  "total_tokens": 1199281
}
```

## Key prompts
- “This is a focused fix in one session: don't use sdd-orchestrate or spawn agents, and don't commit.” This constrained execution to a direct, reviewable fix without workflow handoffs or agent commits.
- “derive each proposal's source range from its originalSnippet” This made unique whole-line snippet matching authoritative while preserving the stored source-range invariant.
- “Keep within SEC-04's ceilings; no other operation's settings change.” This bounded the injection-only cap increase and concise explanation/fix guidance.
- “Run the targeted unit tests under tests/unit/server/llm and tests/unit/llm-internal, the Author proposal and publication tests” This required fake-provider validation, including integration against local Supabase when available, plus lint and typecheck.

## Decisions and corrections
- Derived ranges replace provider numbers in validated output and candidate assembly. Zero or multiple whole-line matches and overlapping derived ranges reject the entire result; other contract checks remain.
- Raised injection output from 1,280 to 1,800 tokens: about 14.1 seconds at the reported 128 tokens/second, within the unchanged 15-second attempt deadline. Requested one or two sentences per explanation and fix.
- Added acceptance and rejection regressions; removed two unit range-mismatch rejection cases and one provider out-of-range integration rejection case because provider numbers are now ignored. Database tampering rejection checks remain.
- Initial sandbox diagnostics hid Docker access; an approved external check confirmed local Supabase was running. An initial unit run used the default Node; all requested checks were subsequently run under Node 24.
- Passed 734 targeted unit tests, 124 local integration tests, lint, typecheck and whitespace checks. Full-suite tests, build and e2e were not run. No live LLM calls, hosted database access, agent spawning or commits.

## Files created or modified
- `src/server/llm/contracts.ts`
- `src/server/llm/config.ts`
- `src/server/llm/soc.ts`
- `workflow/specs/INTEGRATION-SPEC.md`
- `tests/unit/server/llm/contracts.test.ts`
- `tests/unit/server/llm/soc-provider.test.ts`
- `tests/unit/server/llm/soc-smoke.test.ts`
- `tests/integration/author/proposals.test.ts`
