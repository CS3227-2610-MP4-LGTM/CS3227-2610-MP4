# Hosted SoC LLM specification

## Goal

Specify when hosted development and production may use live SoCLaaS for issue #65. Reserve room for the follow-on T-05 task.

## Scope

Four user–assistant exchanges on one spec change, including the correction and log.

## Session metadata

- Tool — Codex Desktop, CLI `0.167.0-alpha.3.2`
- Model — `gpt-6.1-sol`, high reasoning effort, default service tier, 4 turns
- Session ID — `01a1bf9c-1c5b-7273-b82d-fc7930b1cd13`
- Token totals as of writing — input 1080674, cached input 1015296, cache-write input 0, output 11487, reasoning output 4103, total 1092161

## Key prompts

> Specs only: no code, config, migrations or tests, and no PLAN task entry (the T-05 planner writes it).

This scoped the work to specification changes and the PLAN capacity adjustment.

> A pinned model ID, never an operator alias. A reasoning effort and an output cap for each operation; an empty or length-truncated answer is invalid output.

This defined what each live request must pin and which responses enter the existing invalid-output retry path.

> PLAN Capacity: Foundations at most 5 (total 17), so T-05 fits. This is a team decision; list it under "Decisions made".

This gave T-05 room within the team's task budget.

> Rules: one home per fact; link existing sections rather than restating ceilings, envelopes or status codes.

This kept the deployment rules in SEC-04 and linked to the existing accounting, retry, and integration contracts.

## Decisions and corrections

- SEC-04 requires stateless Chat Completions with Bearer authentication, JSON output, and no tool parameters. Settlement counts reasoning within completion tokens and discards the reasoning text. Upstream 429 and 5xx responses follow the existing transport-failure rule without an automatic retry.
- Correction — SoCLaaS publishes per-key request limits, daily and monthly budgets in microdollars, lifetime credits, and model access policy. The documented defaults are 90 requests/min, $80/day, and $800/month. Both hosted keys report 30 requests/min and $50/day.
- Whenever the key, model, or ceilings change, configuration review uses the portal budget endpoint and `GET /v1/models`. Check the environment's attempts per minute against the key's request limit and price its daily token ceiling at the pinned model's output rate against the key's daily budget. The app never calls the portal API.
- Hosted development and production can explicitly select live SoC with separate keys once SEC-04 holds. Local, test, and CI use fake AI. SYS-15 puts the model ID, per-operation reasoning efforts, and output caps in versioned constants. T-05 will select the values.
- The team raised Foundations capacity from 4 to 5 and total capacity from 16 to 17. The planner owns the T-05 entry.
- The first GitHub issue lookup could not connect from the sandbox. The read-only retry confirmed issue #65 was open. Diff, anchor, and ID checks passed. Application checks were skipped.

## Files created or modified

- `workflow/specs/AI-SECURITY-SPEC.md` — SEC-04 and the verification note under SEC-06 (+303 words, including +69 for the correction)
- `workflow/specs/TECHNICAL-SPEC.md` — SYS-13.3, SYS-15, and SYS-18.1 (+4 words)
- `workflow/PLAN.md` — Capacity (+2 words)
