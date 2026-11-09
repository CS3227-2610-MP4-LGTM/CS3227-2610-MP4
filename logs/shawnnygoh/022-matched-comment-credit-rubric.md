# Matched-comment credit rubric

## Goal

Define what earns explanation and fix credit for issue #74 in one place, then check the existing examples and related specifications for consistency.

## Scope

Two user–assistant exchanges on one spec clarification, including this log.

## Session metadata

- Tool — Codex Desktop, CLI `0.167.0-alpha.3.2`
- Model — `gpt-6.1-sol`, high reasoning effort, default service tier, 2 turns
- Session ID — `01a1bfe7-3e40-7ce2-95e3-9a1fbef468c0`
- Token totals as of writing — input 342015, cached input 297984, cache-write input 0, output 2728, reasoning output 401, total 344743

## Key prompts

> Spec-only change for #74.

This scoped the task to documenting the grading contract.

> Add that definition in that section, as its only home:
> - Explanation: 1 states what goes wrong and its consequence; 0.5 names the right problem but leaves the consequence vague or partly wrong; 0 gives none, or doesn't describe the matched flaw's problem (a correct point about a different problem earns nothing).
> - Fix: 1 is an actionable change that would correct the flaw; 0.5 points the right way but is incomplete or unspecific; 0 gives none, or a change that wouldn't correct it.

This made §4’s matched-comment assessment the sole definition of both credit scales.

> Check that the §6 fake-provider credits still agree (Q1 (1,1), Q5 (0,1), Q6 (0,0)), and report any other spec or story text that restates what a credit means.

This required checking fixture comments against the rubric and looking for duplicate definitions across the specs and stories.

> No code, test, PLAN or other spec changes. Report the word delta.

This confined the edit to §4 and required a word-count check.

## Decisions and corrections

- Used the low route for the spec clarification. The sandboxed GitHub lookup could not connect, and the read-only retry confirmed issue #74 was open.
- Q1 explained the wrong return value and gave the correction. Q5 gave only the correction. Q6 expressed suspicion without explaining the flaw or proposing a fix. All three existing credit pairs agreed with the rubric.
- The audit found no duplicate level definitions. PRODUCT-SPEC describes the learning goals, LRN-05 displays returned credits, and LRN-06 uses below-full credit to list missed criteria.
- The scope check and `git diff --check` passed. Tests, lint, and typecheck were skipped for the spec-only edit.

## Files created or modified

- `workflow/specs/INTEGRATION-SPEC.md` — §4 only, +108 words excluding list markers or +110 by `wc -w`.
