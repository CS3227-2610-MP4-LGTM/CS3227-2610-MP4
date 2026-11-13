# User Guide Testing Walkthrough

## Goal
Add a first-time testing walkthrough before the Learner guide, covering challenge creation, learner review and TA inspection, with equivalent downloadable Python and Java examples.

## Scope
Three user-assistant exchanges covering one focused documentation task, its readability revision and this log.

## Session metadata
- Tool: Codex, CLI version `0.166.0-alpha.5.1`; originator: Codex Desktop.
- Session ID: `01a1d324-bf9f-7781-b394-ce836b2ae4e5`.
- Model: `gpt-6.1-sol`; reasoning effort: `medium`; service tier: `default`; 3 turns.
- Token totals as of writing: input `773016`; cached input `701184`; cache-write input `0`; output `7532`; reasoning output `653`; total `780548`.

## Key prompts
- “Before the learner's guide section in the user guide, can you help me add a complete testing walkthrough section.” The user wanted a connected introduction for first-time testers, progressing through Author, Learner and TA roles.
- “write this code in python and java language but they do the same thing” requested equivalent ready-made examples so testers would not need to supply their own code.
- “Can you make the walkthrough shorter such that it is easier for testers to read and they don't have to spend so much time reading through” redirected the initial detailed walkthrough toward a concise sequence of essential actions.

## Decisions and corrections
- Used the low documentation route and checked described controls against the existing implementation.
- Added working delivery-fee calculators in both languages. Clarified that testers paste downloaded source into **Working code**; the application displays code rather than executing it.
- Covered publication, commenting and grading, TA evidence inspection, conditional grade overrides and flag resolution, and learner verification of moderation.
- Avoided prescribing fixed AI-generated flaws, line numbers or scores.
- Shortened the walkthrough from 1,517 to 586 words, retaining downloads, sample form values, role steps and checkpoints; linked detailed guides for additional help.
- Python and Java passed all documented examples and negative-input checks; demonstration outputs matched. Markdown links, section placement, sample size limits and diff whitespace checks passed.
- Live application testing, lint and typecheck were not run for these documentation changes. No commits were made.

## Files created or modified
- `docs/UserGuide.md`
- `docs/assets/testing-walkthrough/delivery_fee.py`
- `docs/assets/testing-walkthrough/DeliveryFee.java`
