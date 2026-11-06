---
name: sdd-security-review
description: Independently review auth, record access and applicable AI security controls on the high route. Does not write fixes or replace the correctness reviewer.
---

# Security review

Read the diff and task Reads; AI-SECURITY-SPEC's Attack surfaces table and the
SEC sections touched by the task plus their tests; SYS-08, SYS-10, SYS-12 and
SYS-16. For auth work read SYS-05 to SYS-12. Read only those sections, never
the whole spec or handoff. Inspect surrounding code only to trace boundaries.

Use the requirement as the authority; this checklist identifies where to
look, not replacement policy. Mark inapplicable checks with a reason.

| Check | Requirement and evidence |
| --- | --- |
| Server entry points | SYS-08, SYS-16; SEC-01 for AI. Trace caller identity, role, Zod validation and authorization at every changed server entry point, including direct invocation. |
| Sessions and roles | SYS-05–SYS-09, SYS-11 for auth. Trace cookie/session transitions, provisioning, immutable roles, cache boundaries and denied-access tests. |
| Database and admin client | SYS-10. Inspect migrations, grants and RLS; trace every privileged operation back to an authorized caller and test bypass attempts. |
| Record access | SYS-12; SEC-01, SEC-03 for AI. Compare reads/writes, ownership, audit and learner-visible output with permitted records and tests for other users' records. |
| Prompt injection | SYS-02, SYS-16; SEC-01, SEC-03. Trace untrusted submitted code and other data through prompts, tool boundaries and rendered output; check attack-path tests. |
| Model output | SYS-03; SEC-02, SEC-03. Trace schema validation before persistence/display and malformed or leaking output tests. |
| Usage | SEC-04, SEC-05. Check request bounds, retries, concurrency, reservation/settlement and race tests against cited limits. |
| Safe failures | SYS-11, SYS-16; SEC-06. Check unavailable/invalid dependencies, recoverable UI and sanitized diagnostics without secret or protected-data exposure. |

Return stable `SEC-REV-nn` findings with priority, path:line, criterion,
evidence and fix direction. Preserve IDs for rereviews. Unsupported conclusions
are unverified, never passes; identify missing security tests. Use AGENTS.md's
summary and make any lower-priority blocking criterion failure explicit.
