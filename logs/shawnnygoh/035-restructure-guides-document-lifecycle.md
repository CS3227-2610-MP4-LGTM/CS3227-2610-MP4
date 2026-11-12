# Restructure guides and document lifecycle

## Goal

Prepare documentation for issues #109 and #101: document Author unpublication/archive accurately, reorganize the Developer Guide and shorten the README.

## Scope

Three task exchanges covering one documentation task, two follow-up corrections and this session log; GitHub attribution `shawnnygoh` was supplied by the user.

## Session metadata

- Tool: Codex Desktop; CLI `0.167.0-alpha.3.2`; source `vscode`; provider `openai`.
- Session ID: `01a1d12b-e6f4-7203-aa8c-95ac475c5c22`.
- Model: `gpt-6.1-sol`; reasoning effort: medium; service tier: default; 3 turns.
- Branch: `docs/101-109-guides`.
- Token totals as of writing: input 2287433; cached input 2178432; cache-write input 0; output 22591; reasoning output 2933; total 2310024. Obtained through `bun workflow/scripts/rollout-summary.ts`.

## Key prompts

- “Docs only: change no code, config, specs, PLAN or tests. Do not commit.” This confined the work to the three requested guides and left a reviewable diff.
- “Keep every technical fact that is still true; reorganize rather than delete.” This required preserving implementation notes while linking canonical contracts and moving screen walkthroughs into the User Guide.
- “Reword it to say that, linking INTEGRATION-SPEC ‘Code, proposals and locations’ … instead of restating the matching rules.” This corrected the proposal-source-range explanation after the main documentation pass.

## Decisions and corrections

- Used the low documentation route with sdd-orchestrate and sdd-docs; verified both issues were open. No commits or PR actions were performed.
- Added exact lifecycle confirmations, recovery actions and Learner/TA visibility consequences from components and tests. Removed the unreachable-status limitation, corrected publication/access wording and moved missing walkthrough details from the Developer Guide.
- Reorganized setup, workflow, architecture, role features, auth, AI, security, testing, deployment and requirements. Individually described all 60 workflow files. Hosted environments use live SoC; local/CI use fake AI.
- Shortened README. Initial word counts became UG 5653→7400, DG 13538→10796 and README 884→264 before follow-up corrections.
- User requested deleting the retrospective lifecycle sentence from Known limitations and correcting source-range derivation. Both were changed; the server derives ranges from unique whole-line original-snippet matches and ignores model line numbers, with a canonical spec link.
- Final link check passed 300 repository link/anchor targets; workflow coverage was 60/60 and `git diff --check` passed. Temporary checking scripts stayed outside the repository. Lint, typecheck, tests, build, verify, e2e and Jekyll rendering were not run. Hosted settings were not inspected; retained-revision “live” wording was clarified in the UG.

## Files created or modified

- `docs/UserGuide.md`
- `docs/DeveloperGuide.md`
- `README.md`
