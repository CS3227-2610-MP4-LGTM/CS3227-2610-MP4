---
name: session-log
description: Summarize the current session and write a concise numbered log when the user asks to summarize a session and generate logs for it.
---

# Session Log

Use this skill when the user wants the current session summarized and recorded as a log. Read the whole available conversation context first, then capture the important interactions and decisions rather than repeating every turn.

Create exactly one file at `logs/<github-user>/<NNN>-<session-name>.md` in the current repository:

- Run `gh api user --jq .login` to determine `<github-user>` unless the user explicitly provides a GitHub username.
- If the user is unauthenticated, explain the problem and provide the user with the recovery commands before stopping:
  ```sh
  gh auth status
  gh auth login --hostname github.com --web
  gh api user --jq .login
  ```
- If the command fails for other reasons, explain the issue and provide the user with the relevant fix before stopping. Let the user know they can provide their GitHub username explicitly instead of using the command to determine it.
- If the user explicitly provides a GitHub username, use it as user-provided attribution instead of using the command.
- Inspect only that user's `logs/<github-user>/` directory and choose the next unused three-digit number. Start at `001` when the directory has no numbered logs.
- Use a concise 3–6 word kebab-case `<session-name>` describing the session.
- Keep the log under 500 words.
- Omit the current log file itself from the `## Files created or modified` section.
- Do not modify unrelated files, and do not commit.
- If no files were created or modified during the session, state that explicitly under the `## Files created or modified` section. 

For Codex sessions, obtain Session metadata immediately before writing with
`bun workflow/scripts/rollout-summary.ts` from the repository root. This reads
`$CODEX_HOME/sessions` (default `~/.codex/sessions`), preferring `CODEX_THREAD_ID`,
then `CODEX_SESSION_ID`; without either, it selects the newest rollout whose
session cwd matches this repository. Never inspect rollouts directly: they contain
transcripts and private account data. The CLI outputs only approved summary fields.

- Record Tool as Codex with the CLI version and originator when confirmed. Use
  `turnValues` for model and effort, including each distinct model/effort/service-tier
  combination and its turn count when settings switch. Never infer effort or model
  from your own identity or instructions.
- Record `sessionId` as Session ID. Include Thread ID only when `threadId`
  differs from `sessionId`. Use `tokens` verbatim for input, cached input,
  cache-write input, output, reasoning output and total. Label these cumulative
  values “token totals as of writing” (an active session's totals can increase).
  Do not add reasoning to output or recompute total.
- If the CLI fails, is unavailable, returns unknown, or cannot resolve an ID
  uniquely, write “unknown” for unconfirmed fields; never guess. An explicit
  `--id ID` or `--path FILE` selects a known rollout. `--list [N]` lists recent
  rollouts for this repo separately, including shared session IDs; do not assume
  the newest rollout belongs to this chat when identity evidence disagrees.
- For other tools, keep the existing behavior: record only metadata you can
  confirm and use “unknown” otherwise.

Use this exact structure:

```markdown
# Session Title

## Goal
One or two sentences on what the session set out to do.

## Scope
One line on the number of user-assistant exchanges and whether the session was one focused task or several unrelated tasks.

## Session metadata
Tool and model, reasoning effort if set, and session ID if known. For Codex, use the CLI metadata above, including thread ID only when different from session ID, and token totals as of writing. Write "unknown" for anything you cannot confirm; never guess.

## Key prompts
The 2–5 instructions that materially shaped the work, quoted in the user's own wording, each followed by a sentence explaining what it asked for and why it was framed that way. Omit routine follow-ups, approvals, and clarifications.

## Decisions and corrections
Every important user decision, disagreement, rejected tool call, or correction and redo. Be specific where needed.

## Files created or modified
- File 1
- File 2
```
