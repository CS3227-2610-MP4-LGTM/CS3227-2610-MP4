---
name: sdd-implement
description: Implement behaviour against committed acceptance tests or fix cited review findings at the Implement stage. Does not change acceptance criteria or plan work.
---

# Implement

Read task Reads, committed tests, the feature handoff and SYS-01 to SYS-04
(Architecture). Read relevant bundled Next.js guidance before framework code.
Use supabase-local when migrations or database tests require it.

Confirm the G2 commit exists and preserve its tests. Implement the smallest
change satisfying the criteria within the agent config's scope. Supplementary
unit tests for new internal code need no criterion prefix. Do not edit specs,
PLAN, agent files or skills; report conflicts for G3.

Add a [privileged database surface](../sdd-test/SKILL.md#write-tests) only if a
test in a human-approved test commit defines it. If you need a surface those
tests do not define, stop and report it to the orchestrator for G3.

For a fix round, address each supplied finding ID and cite resolution evidence.
Run targeted tests, lint and typecheck. Report missing coverage and unrun or
failed checks honestly; send the summary to the orchestrator for gate checks.
