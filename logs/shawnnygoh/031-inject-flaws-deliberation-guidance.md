# Inject Flaws Deliberation Guidance

## Goal
Fix issue #115's runaway constrained JSON output in SoC flaw injection, using offline tests and leaving an uncommitted diff on `fix/115-constrained-whitespace`.

## Scope
Three task exchanges, including this log request, covering one focused fix and a correction based on the user's live diagnostics.

## Session metadata
- Tool: Codex; CLI version `0.167.0-alpha.3.2`; originator: Codex Desktop.
- Model: `gpt-6.1-sol`; reasoning effort: `medium`; service tier: `default`; 3 turns.
- Session ID: `01a1d0c8-7ee4-7f11-971c-43f69da0265f`.
- Token totals as of writing: input `806085`; cached input `756992`; cache-write input `0`; output `4640`; reasoning output `580`; total `810725`.

## Key prompts
- “add the vLLM per-request option structured_outputs: { disable_any_whitespace: true } for every operation” — Initially requested suppressing whitespace between JSON tokens while preserving the existing schema format.
- “ask for each flaw to be planted in the smallest range that shows it, usually one to three lines, never a whole function.” — Requested concise source ranges to reduce unnecessary generated snippet text.
- “the vLLM structured_outputs option is rejected without a duplicated schema and, when accepted, has no visible effect, so remove it.” — Replaced the initial approach after the user's live diagnostics identified deliberation inside explanation fields as the cause.
- “Decide every flaw before writing any field. Each explanation states only the planted flaw and its consequence in one or two sentences; never deliberate, weigh alternatives or think aloud in any field.” — Supplied the exact additional guidance to append and pin in the offline test.

## Decisions and corrections
- Initially added the vLLM option, request-body assertions for every operation, and corresponding request-field documentation.
- Removed those changes after the user's correction. The smoke test, developer guide and security spec now match `upstream/master`.
- Kept the smallest-range instruction and appended the user's exact guidance against deliberating in output fields. The guidance test checks both requirements.
- Preserved caps, deadlines, schemas, retries and validation. Made no live calls or commits.
- Demonstrated the new guidance assertion failing before implementation. Final validation passed all 137 affected offline unit tests across five files, lint, typecheck and `git diff --check`, using Node 24. Full verify and e2e were not run.

## Files created or modified
- `src/server/llm/soc.ts`
- `tests/unit/server/llm/soc-provider.test.ts`
