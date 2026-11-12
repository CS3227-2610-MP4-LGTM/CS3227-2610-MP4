# User Guide for peer testers for #90

## Goal

Write `docs/UserGuide.md` for peer testers of the deployed app, covering only behaviour on master, and publish it as the second page of the GitHub Pages site.

## Scope

Two user-assistant exchanges: one focused low-route docs task, then this log request.

## Session metadata

Tool: Claude Code (desktop app). Model: Claude Opus 5.5 (`claude-opus-5-5`). Reasoning effort: unknown. Session ID: unknown. Claude Code has no readable rollout for `rollout-summary.ts`, so token totals are unavailable.

## Key prompts

- "Use the sdd-docs skill for its writing rules. This is a low-route, docs-only task for #90: no loop, no feature handoff, no diff to read." This set a single-session route with no stages, subagents or handoff, while still applying the docs skill's rules for verifying text and links.
- "Scope: only behaviour on master. … Unpublishing and archiving challenges are not on master; leave them out. Don't describe planned features." This limited the guide to ACC, LRN, AUT-01–05, the AUT-06 behaviour already on master and TA stories, because inaccuracies count as bugs.
- "Take the numbers from src/server/llm/config.ts and the LLM accounting migration, not from the spec." The limits had to be the enforced values.
- "Check every label, heading, message and route against the components, the message constants in src/lib or the e2e tests … The Developer Guide's screen descriptions are leads to check, not a source." All on-screen text had to be quoted from the implementation.
- "Boundaries: change only docs/UserGuide.md, docs/index.md and the Developer Guide's front matter." This protected the Developer Guide and README for a later restructure.

## Decisions and corrections

- I verified the text against the components, `src/lib` constants and the server grading and LLM runner code, without starting the app or Supabase.
- Usage limits come from `config.ts` and `20261108120000_llm_accounting.sql`. The account limits are 1 active action, 4 requests per minute, 20 per day and 300,000 tokens per day. The app-wide limits are 4 active, 20 per minute, 100 per day and 1,500,000 tokens per day. The guide notes that an invalid-output retry is a second counted request, that grading with no matched comment makes no AI call, and that hints never use AI.
- Self-corrections after re-checking the code: the logo label (**LGTM**, not **LGTM.**), the flag queue's default (open flags only), and wording for an oversized summary (Generate summary stays available).
- The guide mentions the Author **Status** filter's Unpublished and Archived options only as a known limitation, without describing those features.
- A script checked every anchor and link against both GitHub and kramdown slugs. All 44 resolve, and neither file contains Liquid markers.
- Flagged for Shawn but not changed, because of the boundary: `docs/Reflections.md` also has `nav_order: 3`. The modified `workflow/handoffs/52-learner-reports.md` predates the session and was left alone.
- Flagged for owners: the Author and TA sections, with their AI feature subsections.

## Files created or modified

- `docs/UserGuide.md` (created)
- `docs/index.md`
- `docs/DeveloperGuide.md` (front matter `nav_order` only)
