# Model-written hints and feedback specification

## Goal
Revise issue #29's learner-facing hint and feedback security requirements in `workflow/specs/AI-SECURITY-SPEC.md`, then record the session for GitHub user `shawnnygoh`.

## Scope
Three task exchanges covering one focused spec change, its refinement and session logging.

## Session metadata

- Tool: Codex Desktop; CLI 0.167.0-alpha.3.2; originator: Codex Desktop.
- Model: gpt-6.1-sol; reasoning effort: high; service tier: default; 3 turns.
- Session ID: `01a1aff7-c111-7ef1-bf2d-c7092d6bb5cc`.
- Token totals as of writing: input 544691; cached input 491904; cache-write input 0; output 7611; reasoning output 2023; total 552302.

## Key prompts
- “Spec-only change to `workflow/specs/AI-SECURITY-SPEC.md`. No code, PLAN or other spec files.” This constrained the work to requirements and decisions, following the spec conventions and named reading sections.
- “Decision: learner-facing hints and feedback are model-written plain text, accepted only after server-side checks.” This replaced exact approved phrases while preserving integration contracts, failure behaviour and cached-hint access.
- “Values under 4 tokens are not checked; add them to the accepted residual risk” and “Drop the general Markdown-formatting rule, since accepted text is shown as inert plain text.” These corrections reduced ordinary-prose false positives and narrowed prohibited markup.

## Decisions and corrections
- Defined the protected-text overlap rule across every retained flaw's original snippet, replacement snippet, private explanation and fix, including the matched flaw for feedback.
- Initially used individual symbols as tokens and whole-value checks below eight tokens. The user corrected this to NFKC and full Unicode case folding followed by maximal letter/mark/number runs; punctuation, symbols and whitespace only separate tokens. Reject eight-token contiguous matches, or complete protected sequences of four to seven tokens; skip shorter values.
- Recorded location-revealing paraphrases and protected values under four tokens as accepted residual risks, mitigated by prompts and deterministic checks. Checking short values would reject ordinary prose such as “return a value”.
- Limited prohibited markup to HTML/XML tags or comments and backtick spans or fences; retained Markdown links, autolinks and bare-URL rejection. Removed duplicated hint-cardinality wording.
- Updated SEC-03.1's fake-provider criteria for rejection, thresholds, punctuation, short-value acceptance and harmless Markdown emphasis. Preserved SEC-03.2 exactly; SEC-02 already covers inert rendering, so no SEC-03.3 was added.
- Updated the publication-hints attack surface. SEC-03 grew from 183 to 469 words initially, then 511 after refinement, counting its heading and criteria.
- Diff and scope checks passed. Runtime tests, lint and typecheck were not run for the spec-only change. No commits were made; no open questions remained.

## Files created or modified
- `workflow/specs/AI-SECURITY-SPEC.md`
