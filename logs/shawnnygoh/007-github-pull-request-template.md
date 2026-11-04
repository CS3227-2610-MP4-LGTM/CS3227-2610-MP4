# GitHub Pull Request Template

## Goal
Add a consistent GitHub pull request body for issue #19 in `.github/pull_request_template.md`, using fields supported by the current workflow.

## Scope
Three user-assistant exchanges covering one focused task, its corrections, and this session log.

## Session metadata
- Attribution: `shawnnygoh` (user-provided).
- Tool: Codex, CLI `0.166.0-alpha.5.1`; originator: Codex Desktop.
- Model/settings: `gpt-6.1-sol`, reasoning effort `medium`, service tier `default` (3 turns).
- Session ID: `01a1a5a7-7a57-79f2-b553-24295e824d7f`.
- Token totals as of writing: input `265114`; cached input `229760`; cache-write input `0`; output `1754`; reasoning output `163`; total `266868`.

## Key prompts
- “Add a GitHub pull request template for issue #19.” This requested a shared PR body with ordered sections for purpose, decisions, evidence, and unchecked verification items.
- “Only fields that exist today: no PLAN.md tasks field and no handoff-report fields (they arrive with the agent workflow, #18).” This kept the template aligned with the current workflow rather than introducing future fields.
- “Change only this file. Don't run `bun run verify`; I run it.” This limited the template work to one file and reserved full verification for the user.
- “The Requirement IDs comment: the IDs this PR adds or implements (spec PRs allocate new ones), not only existing ones; n/a if none.” This corrected guidance that initially excluded newly allocated spec IDs.
- “Write a session log for this session using the session-log skill. Use GitHub username `shawnnygoh`.” This authorized the additional log file with explicit attribution.

## Decisions and corrections
- Read only the Identifiers section of `workflow/specs/README.md` for requirement-ID guidance. Included SYS, ACC, LRN, AUT, TA, and SEC forms.
- Used short HTML comments for guidance and angle-bracket placeholders; kept wording agent-neutral and omitted future workflow fields.
- Included editable scope exclusions and unchecked items for local verification, secret handling, and agent commit trailers.
- At the user's request, bolded Requirement IDs, Kind, Spec approval, and Session log labels. Revised requirement guidance to include IDs added or implemented, with spec PRs allocating new IDs.
- Changed only the template during implementation; created this log on the later explicit request. Did not commit.
- `git diff --check` completed after initial creation. No application tests or `bun run verify` were run; the user will run verification. Initial template word counts were reported before the follow-up edits.

## Files created or modified
- `.github/pull_request_template.md`
