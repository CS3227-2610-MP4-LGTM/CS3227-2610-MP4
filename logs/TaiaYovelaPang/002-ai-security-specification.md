# AI security specification

## Goal

Specify LGTM's AI attack surfaces, security controls, SoC LLM usage limits and acceptance tests on a dedicated documentation branch.

## Scope

Two user–assistant exchanges covered the specification and its session log.

## Session metadata

- Tool — Codex CLI `0.166.0-alpha.5.1`, originator Codex Desktop
- Model — `gpt-6.1-sol`, medium reasoning effort, default service tier, 2 turns
- Session ID — `01a1aacf-9144-7d53-86ac-28bec52cae3b`
- Token totals as of writing — input 449602, cached input 408832, cache-write input 0, output 4306, reasoning output 224, total 453908

## Key prompts

> Add AI-SECURITY-SPEC.md: AI attack surfaces, controls, SoC LLM usage limits and SEC requirements with security tests. May extend the SYS-10 privileged-access register.

The user requested a security specification grounded in the existing integration contracts and allowed a register extension if needed.

> Open a docs/AI-security-spec branch for the changes.

The user specified a dedicated branch and its exact name.

## Decisions and corrections

- Created `docs/AI-security-spec` from `upstream/master`. Fetching upstream and writing the branch required sandbox escalation.
- Defined SEC-01 through SEC-06 with security acceptance tests. Kept the existing SYS-10 register because the specified operations fit its privileged access and the integration spec's user-scoped persistence paths.
- Set LGTM request, token, concurrency and retry ceilings, subject to confirmed SoC limits before live use. Required server-approved learner-facing phrases to protect private answers.
- Whitespace checks, lint and type checking passed. Two Vitest workers failed during jsdom setup, so `bun run verify` did not reach the build.

## Files created or modified

- `workflow/specs/AI-SECURITY-SPEC.md`
- `workflow/specs/README.md`
- `workflow/specs/TECHNICAL-SPEC.md`
