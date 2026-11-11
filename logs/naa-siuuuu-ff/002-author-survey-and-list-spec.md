# Author survey and list response spec

## Goal
Survey the codebase from the Author role's perspective, settle the Author task split and issues, and make a spec change giving `GET /author/challenges` a lightweight list response.

## Scope
Three user exchanges on one focused task: Author onboarding survey, then issues and a spec-only change, then this log.

## Session metadata
Claude Code (VS Code extension), model Claude Opus 5.5 (`claude-opus-5-5`), reasoning effort unknown, session ID `4d44106d-148b-4472-bbee-733d2e312e4f`.

## Key prompts
- "The role I am in charge of is the author. Look through the codebase, and tell me what is already there. Tell me what I need to do and decisions I need to give from my end … Dont do any coding yet as of this round" — asked for a read-only survey of existing Author specs, schema and code, plus the decisions needed now.
- "Also let me know what you have permission to do and what you need my clearance/ need me to do manually" — asked for the agent/human boundary from `.claude/settings.json` and AGENTS.md.
- "Go ahead with your recommendation … Yes fix this. … Why cant you publish git issues?" — approved the four-task Author split and the list-response spec change, and authorised issue creation.
- "For now, use subagents for reviews, but in the future, if I feel that it is taking too long … I will let you know" — set how the Review stage runs for Author tasks.

## Decisions and corrections
- Survey findings: all six Author stories (AUT-01–06) and the Author API contract are already specified, so no new stories are needed. Author tables exist with owner read policies only; no Author write paths, admin-only functions, routes, UI or tests exist, so every Author task is high route.
- PLAN budget: 11 tasks used plus Learner T-12/T-13 leaves exactly four Author slots. The user approved T-20 (AUT-01, AUT-02, AUT-06.1–06.3), T-21 (AUT-03, AUT-04), T-22 (AUT-05) and T-23 (AUT-06.4–06.7), all high route, chained in that order.
- Issue creation: the agent first said only the human creates issues, citing PLAN's planner rule. The user pointed out `gh issue create` is not denied and authorised it; the agent created #80 (spec) and #81–#84 (T-20–T-23) on upstream with `docs`/`feat` and `role: author` labels.
- Spec change (low route, issue #80): added `AuthorChallengeCard` (`id, status, title, language, difficulty, createdAt`, drawn from the working draft, with no code, configuration, proposals or answers) and made `GET /author/challenges` return `Page<AuthorChallengeCard>`. Detail and mutation endpoints keep `AuthorDraft`. No story file changed.
- T-20 planning waits until #80 merges so the plan is based on the approved spec.
- Reviews will use fresh reviewer subagents until the user asks for separate terminal sessions.
- The user's local `.claude/settings.json` permission edit is excluded from this PR.
- No checks were run for the spec-only change. No commits or pushes were made by the agent.

## Files created or modified
- `workflow/specs/INTEGRATION-SPEC.md`
