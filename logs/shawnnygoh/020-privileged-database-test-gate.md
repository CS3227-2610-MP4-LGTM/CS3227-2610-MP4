# Privileged database test gate

## Goal

Update the SDD workflow for issue #67 so implementers add privileged database surfaces only when a human-approved test commit defines them. Two prior runs added functions with grants that reviewers caught during review, costing a fix round each.

## Scope

Three user–assistant exchanges on one process chore, including the wording correction and this log.

## Session metadata

- Tool — Codex Desktop, CLI `0.167.0-alpha.3.2`
- Model — `gpt-6.1-sol`, high reasoning effort, default service tier, 3 turns
- Session ID — `01a1bfba-2897-7163-8a73-469ea4f4936c`
- Token totals as of writing — input 477949, cached input 430592, cache-write input unknown, output 6269, reasoning output 2245, total 484218

## Key prompts

> Agents must never add privileged database surface that no committed test defines.

This made a defining test a prerequisite and sent uncovered needs to G3.

> sdd-test: tests define and exercise every privileged surface the task plans, including grants and direct-call behaviour.

This required test authors to exercise the planned interfaces and their access rules.

> One home per rule: state it where it applies and point to it rather than repeating it.

This kept the inventory and blocking rule in `sdd-review`, with a link from `sdd-security-review` for independent application.

> Reword both places to say "a human-approved test commit" instead of "the G2 commit".

This allowed later approved tests, including supplementary tests added at G3, to define a surface.

## Decisions and corrections

- Used the low route and preserved the structure of the four named skills. The sandboxed issue lookup could not connect. The read-only retry confirmed issue #67 was open.
- The initial edits passed skill validation, cross-reference and scope checks, and `git diff --check`. The follow-up changed only the implement and review wording and skipped validation as requested.

## Files created or modified

- `.agents/skills/sdd-implement/SKILL.md` — implementation gate and G3 stop, 142 → 177 words (+35)
- `.agents/skills/sdd-test/SKILL.md` — surface coverage, grant and direct-access assertions, 246 → 285 words (+39)
- `.agents/skills/sdd-review/SKILL.md` — inventory and blocking findings, 158 → 190 words (+32)
- `.agents/skills/sdd-security-review/SKILL.md` — link to the shared review rule, 336 → 345 words (+9)
