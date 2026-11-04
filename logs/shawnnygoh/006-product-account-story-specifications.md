# Product and Account Story Specifications

## Goal
Write LGTM's product specification, shared story template and three complete account stories, then refine the product decisions through review.

## Scope
Four task-bearing user-assistant exchanges, including this log request, covering one focused documentation task and its session record.

## Session metadata
- Tool: Codex, CLI 0.166.0-alpha.5.1; originator: Codex Desktop.
- Session ID: 01a1a584-8815-72b0-825f-772df4e56569.
- Model/effort/service tier: gpt-6.1-sol / high / default (3 turns); gpt-6.1-sol / low / default (1 turn).
- Token totals as of writing: input_tokens: 1363825; cached_input_tokens: 1311744; cache_write_input_tokens: 0; output_tokens: 25549; reasoning_output_tokens: 6498; total_tokens: 1389374.
- Attribution: user-provided GitHub username `shawnnygoh`.

## Key prompts
- “Write LGTM's product spec, the story template and the three account stories. Docs only.” This established the deliverables and excluded implementation work.
- “Reference SYS requirements instead of restating them” required the documents to respect the existing technical specification's ownership of mechanisms and access rules.
- “Grading must not reward comment spam.” This required one counted comment per flaw and identification penalties for unmatched comments, with the formula deferred to INTEGRATION-SPEC.
- “the difficulty and flaw-category lists are product decisions, not assumptions.” This corrected their placement and required assumption renumbering.

## Decisions and corrections
- Created the product overview, role navigation, end-to-end paths, product decisions and story index, plus account acceptance criteria, messages and recovery paths.
- Chose fixed role landings after authentication without resuming requested URLs; session expiry does not promise unsaved-work recovery. Publication waits for required hints.
- User made TA-04 Must, split issue reporting into non-AI LRN-07 and moved history to LRN-08. The index now contains 22 stories.
- Added scores out of 100, with the pass mark defining the moderation boundary; numerical values and formulas remain in INTEGRATION-SPEC.
- Named shared difficulty/category vocabularies, then moved them into section 4 and renumbered the remaining assumption to ASM-02; no references required updates.
- Aligned ACC-01 role-label notes, removed its account-existence claim, removed the account-files sentence and wrapped the README addition.
- Verification passed twice, including 16 tests, on installed Node 25. Temporary Node 24 acquisition failed; Node 24, separate Playwright and database checks remain unrun. Final documentation links and whitespace checks passed. No commits were made.

## Files created or modified
- `workflow/specs/PRODUCT-SPEC.md`
- `workflow/templates/story-spec.md`
- `workflow/specs/stories/ACC-01-sign-up-with-a-role.md`
- `workflow/specs/stories/ACC-02-sign-in-and-sign-out.md`
- `workflow/specs/stories/ACC-03-role-based-landing-and-navigation.md`
- `workflow/specs/README.md`
