# Learner Story Specifications and Review

## Goal

Write LRN-01–LRN-08 for issue #13, link the Learner story index, and apply the
user's review fixes without increasing any story's word count.

## Scope

Three user-assistant exchanges covering one focused spec-writing task, review
corrections and this session log.

## Session metadata

- Tool: Codex, CLI version `0.167.0-alpha.3.2`; originator: Codex Desktop.
- Model: `gpt-6.1-sol`; reasoning effort: `high`; service tier: `default`;
  3 turns.
- Session ID: `01a1b083-4cb9-79b0-9ddf-65ba86ff1dab`.
- Attribution: `shawnnygoh`, explicitly supplied by the user.
- Token totals as of writing, from `bun workflow/scripts/rollout-summary.ts`:
  - input_tokens: 2182020
  - cached_input_tokens: 2113152
  - cache_write_input_tokens: 0
  - output_tokens: 39762
  - reasoning_output_tokens: 10908
  - total_tokens: 2221782

## Key prompts

> write the Learner story specs LRN-01 to LRN-08 for issue #13, one file per story in workflow/specs/stories/, using workflow/templates/story-spec.md.

This established the eight deliverables and shared structure, with ACC-01–03 as
the detail and length reference.

> Stories own screens and journeys. Link contracts, formulas, bounds and limits; don't restate them.

This kept shared definitions authoritative while requiring precise, checkable
screen behavior and dependencies.

> Review fixes for the LRN story drafts. Keep each change minimal and keep word counts at or below their current values.

This bounded the correction pass to specific presentation and recovery issues.

## Decisions and corrections

- Followed the low, spec-only route; confirmed issue #13 was open. Left
  INTEGRATION, TECHNICAL, AI-SECURITY, ACC stories and PLAN unchanged.
- Drafted all eight journeys; only LRN-05 and LRN-06 include AI sections.
  No blocking contract gaps were found. Did not copy ACC's stale existence notes.
- On review, removed the Code/Diff toggle for one labelled Learner source region
  and removed the comment editor's switching reference.
- Kept components, statuses and credits rendered once under LRN-05; LRN-06 adds
  matched-comment feedback alongside that display.
- Replaced TA actor identifiers with anonymous TA-action labels. Removed grading
  retry for oversized AI input while preserving the submission-saved message.
- Rewrapped prose without changing link or table lines. Final word counts:
  LRN-01 859; LRN-02 872; LRN-03 949; LRN-04 1,015; LRN-05 1,162;
  LRN-06 1,258; LRN-07 985; LRN-08 1,161. None increased during review.
- Validated 178 relative links/anchors initially and 155 story links after fixes;
  checked structure, metadata, whitespace and word-count ceilings.
  `git diff --check` passed. Application tests, lint, typecheck and build were
  not run for this spec-only change. No commits were made.

## Files created or modified

- `workflow/specs/PRODUCT-SPEC.md`
- `workflow/specs/stories/LRN-01-browse-challenges.md`
- `workflow/specs/stories/LRN-02-view-a-challenge-as-a-pr.md`
- `workflow/specs/stories/LRN-03-manage-line-comments.md`
- `workflow/specs/stories/LRN-04-submit-a-final-review.md`
- `workflow/specs/stories/LRN-05-grade-a-submitted-review.md`
- `workflow/specs/stories/LRN-06-feedback-hints-and-retry.md`
- `workflow/specs/stories/LRN-07-report-an-unmatched-comment.md`
- `workflow/specs/stories/LRN-08-review-history.md`
