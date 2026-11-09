# #77 — Constrained live SoC output

- **Route:** standard
- **PLAN task:** T-05, follow-up to issue #66 and PR #76
- **Branch:** `feat/77-constrained-llm-output`
- **Base commit:** `f1cf9d4ed5ba06441360683d2dd17fc48ffbc55a` (`upstream/master` at Ready)
- **Status:** done
- **Current gate:** G4, awaiting Shawn's validation and commits

## Goal

Improve the share of live SoC answers that pass the app's existing validators across all four INTEGRATION-SPEC §4 operations (SEC-02, SEC-03, SEC-04.1, SEC-04.3 and SYS-19.4).

## Stages

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | Main | Complete | GitHub [issue #77](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/issues/77) verified OPEN. The clean feature branch, HEAD and local `upstream/master` matched the base, which merged #76. T-04 and the original T-05 were done at base. Verified the cited SEC, SYS, §4, §6 and LRN-05 credit context at base. | See Main sessions |
| Plan / G1 | Planner / high and Main | Complete | Shawn supplied `cc9745e`. Verified it is the only commit after the recorded base, changes only PLAN and contains the reviewed PLAN blob `3f5f4fbce5bc1339fb0c7c860b6c92ce34deff50`. The plan budget is five Foundations tasks and 11 total. `git diff --check` passed. | 744100 (planner, `01a1c0c1-3bb4-7583-8600-3a27da2d416b`) |
| Tests / G2 | Main | Complete | Baseline provider and smoke suites passed 104 tests. After Shawn's property-order correction, the targeted rerun against `cc9745e` had 31 expected failures and 303 passes across 13 suites. Targeted lint, typecheck and `git diff --check` passed on Node 24.22.2. Verified Shawn's `272c798` directly follows `cc9745e` and commits exactly the two reviewed test blobs below. | See Main sessions |
| Implement | Main | Complete | Checkpoint at `272c798` contained only the untracked handoff. Implementation adds per-request wire schemas, the pinned model, rubric guidance and labelled smoke input/CSV. All 21 fixture payloads and retained contexts match the source JSON; labels and comment text match the CSV. Verified staged and working acceptance tests against G2. On Node 24.22.2, 334 targeted tests in 13 suites, lint, typecheck and `git diff --check` passed. | See Main sessions |
| Review | Reviewer | Complete | Initial before/after tree digests both `83b4577687e9753c4b2077bf3554468ec26ac7dab9a0239ad6a4724cc735b18c`. Round 1 before/after digests both `b1a30de69cef0b517fa19f37aa372baa3c9cb94aeb3f98680154b6f4c11464f8`. Independent rereview cleared REV-01 and confirmed REV-02 was nonblocking. Both reviews passed 334 tests with simulated transport and found no privileged database surfaces. | 670958 (initial, `01a1c0d6-0317-72b2-a8d8-d460bbe38238`), 561199 (round 1, `01a1c0d9-a180-7f90-a9d3-70bf26e518c1`) |
| Docs | Main | Complete | Only `docs/DeveloperGuide.md` changed during Docs. Verified the model, labelled CLI, CSV semantics and local targets for the SEC-04 and SYS-15 links against reviewed code and specs. `git diff --check` passed. | See Main sessions |
| Close-out / G4 | Main and Shawn | Agent stages complete. Shawn accepted the live smoke results. | G2 files still match `272c798` in index and working tree. Shawn ran live smoke with the development key on 9 Nov 2026 at approximately 23:40 SGT. E6 at default effort met the validity threshold with 19/21 valid. E06 and E20 ended with `length` at the 576-token cap. Among the 19 valid cases, 12 explanation credits, 15 fix credits and 9 credit pairs matched their labels exactly. Across three §6 runs per operation, `assess_review`, `generate_hints` and `summarize_learner` each returned 3/3 valid, with summaries taking 7.9–9.0 s. `inject_flaws` returned 0/3 valid, with two snippet/range contract mismatches and one `AI_TIMEOUT`. The five-flaw stress case returned `AI_TIMEOUT`, an accepted outcome. Full verify/build, database integration and Playwright remain unverified. | See Main sessions |

## Main sessions

| Session | Stages covered | Thread ID | Total tokens | Resume gaps |
| --- | --- | --- | --- | --- |
| 1 | Ready, Plan / G1 | `01a1c0c0-64f6-7f52-a6db-1995168a4562` | 1539174 | none |
| 2 | Tests / G2 | `01a1c0c5-55d0-7d10-8771-9f5713906a0d` | 1739261 | none |
| 3 | Implement, Review, Docs, Close-out / G4 | `01a1c0d2-ddcf-7980-b762-4b84ff474799` | 3493245 (measured at close-out) | none |

End the main session at G1, G2, any G3 and G4 after recording stage and gate evidence, test hashes when available, decisions, open questions, agents to rerun and the exact next action. Gate fixes Shawn requests stay in the session that reached the gate. Each resumed session starts from this handoff, verifies the human-provided gate commit in Git, copies the prior measured total verbatim and records any resume gaps or `none`. Record the current thread ID before ending. Keep this handoff for the feature commit.

## Decisions

| Date | Who decided | Decision and reason |
| --- | --- | --- |
| 2026-11-09 | Shawn | Downgrade #77 from high to standard. Scope excludes auth, data-boundary, accounting, migration and validator changes. Existing SEC-02/SEC-03 validators remain the acceptance gate on model output. Escalate to high if a diff reaches auth, accounting, persistence or the validators. |
| 2026-11-09 | Shawn | Approve a feature-specific exception to one task per issue/PR. Foundations is full, so amend T-05 in place to cover #66 and #77 and run a fresh loop for #77. PR #76 remains the merged baseline for #66. |
| 2026-11-09 | Shawn | SYS-19.4 human settings review for the development key. `GET /v1/models` on 9 Nov listed `qwen3.6:35b` with context 262,144 (minimum 65,536) and output at 1,561,467 µ$/M. The 1.5M tokens/day ceiling costs about $2.34 at the output rate against the key's $50/day budget. The environment's 20 attempts/min fits the key's 30 requests/min. |
| 2026-11-09 | Shawn | Authorize replacing T-05 assertions tied to `json_object`, `qwen3.5:9b` and the output shape in system instructions for #77. List each changed or removed assertion in the G2 summary. |
| 2026-11-09 | Shawn | Keep effort, output caps and SEC-04 timing unless live smoke evidence supports reconsidering them. String-length keywords stay out of the wire schema because SoC rejects them as an unparseable grammar. Existing validators enforce those bounds. |
| 2026-11-09 | Shawn | At G2, remove the injection property-order assertion. For summaries, assert only that `text` precedes `submissionIds`. Keep the measured assessment order of `feedback` before both credits. |

## Scope to carry into implementation

- Send `response_format` with `type: "json_schema"` and a strict schema built for each request from its operation contract. Pin IDs, keys, categories and submission IDs to values in the request wherever allowed by the contract. Preserve matched key/comment ID pairs, constrain credits to `0`, `0.5` or `1` and order properties so text precedes the values it justifies, including assessment feedback before credits. Count the full serialized schema in input preflight.
- Keep short semantic guidance in system instructions and put output shape in the wire schema. For assessment, credit only what the comment itself says, give explanation credit zero to a fix without explanation and ignore instructions or credit claims in the comment. Preserve independent credit rubrics and learner-safe guidance.
- Pin `qwen3.6:35b` for all four operations. Current defaults are effort `none`, output caps 1,280 / 384 / 576 / 1,024 tokens for `inject_flaws` / `generate_hints` / `assess_review` / `summarize_learner`, and 15-second attempt / 35-second operation limits.
- Add `--labelled-input` for a file of labelled assessment cases. The local inputs are `.git/e6/e6-cases.json` and `.git/e6/e6-assess-review-cases.csv`. Join `caseId` to `case_id` and copy inputs with `explanation_label` and `fix_label` into `workflow/scripts/fixtures/soc-smoke/assess-review-e6.json` in the runner's format. Ready verified 21 unique IDs matching across both sources, one match per case, comment text agreement and both labels within the allowed credits. Use the JSON as the source of payloads and retained context and the CSV as the source of labels. Verify the assembled fixture preserves those payloads and retained contexts. Leave scratch files under `.git` outside the commit. Preserve ordinary `--input`.
- Add label columns and exact agreement to the CSV. An exact match requires both credits to match their labels on a valid assessment. Report label agreement alongside validity. Keep §6 and stress smoke inputs available. Shawn runs live smoke using the development key and records at least 19/21 valid E6 cases at effort `none`, exact label agreement, valid §6 fixtures for all four operations and the five-flaw stress result. A stress timeout is acceptable.
- Use simulated transport for automated tests. Keep validator, accounting, fake-provider and safety regression coverage.

## G2 evidence

After the property-order correction, `bun --no-env-file run test tests/unit/server/llm tests/unit/llm-internal` reproduced the following results against the approved PLAN commit. Both modified suites used simulated transport.

| Criterion | Test coverage | Observed against `cc9745e` |
| --- | --- | --- |
| SEC-04.3, SYS-15, SYS-19.4 | Provider wire and settings checks, model rejection, and two snapshots per operation | Old model and context remain, the old model is admitted, and requests use `json_object`. The new schema checks stop at the missing strict wire schema. |
| SEC-04.1 | Complete request and framing at the cap and one unit beyond, plus a limit that the request without the schema could meet | Existing boundary test passes. The new test stops at the missing strict wire schema. |
| INTEGRATION-SPEC §4, LRN-05 | Semantic guidance for all operations, independent credit levels, and the three comment-only rubric clarifications | The four system prompts contain the shape. The rubric clarification test stops at the missing comment-only instruction. Existing independent-credit and isolation checks pass. |
| SEC-02.1, SEC-03.1 | Reject invalid results, preserve safety regressions and accept 500-code-point hints while rejecting 501 | Passes. Existing validators enforce the bounds. |
| INTEGRATION-SPEC §6, SYS-19.4 | Smoke protocol for four C1 fixtures, labelled CLI validation, CSV agreement and all 21 E6 labels | Smoke still sends the old model and format, lacks the three CSV columns, rejects the new option as unknown and lacks the new E6 fixture. Existing stress, pacing and smoke rejection checks pass. |

### Interfaces defined by tests

- The simulated SoC transport receives `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`. The schema carries the strict envelope and operation fields, snapshot-specific bounds and allowed values, and paired assessment keys and comment IDs. The tests assert `feedback` before both assessment credits and summary `text` before `submissionIds`.
- The existing `runSocSmoke(args, deps): Promise<string>` export accepts `--live --operation assess_review --labelled-input <path>` with a labelled file as its input. Each case uses `caseId`, `payload`, `retainedFlaws`, `explanation_label` and `fix_label`. The runner rejects missing or invalid labels before dispatch. The new fixture is `workflow/scripts/fixtures/soc-smoke/assess-review-e6.json`.
- CSV columns are `explanation_label`, `fix_label` and `exact_agreement`. Agreement is `true` when both credits match on a valid labelled response, `false` when either differs, and blank on invalid or unlabelled responses. Labels remain visible for invalid labelled responses and stay out of the SoC request.

### Changes to #76 assertions

- The `SYS-15` config assertion and all four `SEC-04.3` wire model assertions now expect `qwen3.6:35b`. All four smoke wire model assertions expect the same model.
- All four provider and all four smoke wire format assertions now expect `json_schema` with a strict schema instead of `json_object`.
- The four prompt assertions no longer require `schemaVersion`, `operation`, `payload` or the operation discriminator in system text. The schema checks cover those fields and discriminator values. The prompt checks reject embedded envelope shape and retain semantic guidance.
- Moved the remaining system-text field assertions to the corresponding schema checks. Injection fields were `proposals`, `key`, `category`, `sourceStartLine`, `sourceEndLine`, `originalSnippet`, `replacementSnippet`, `explanation` and `fix`. Hint fields were `hints`, `key` and `text`. Assessment fields were `assessments`, `key`, `commentId`, `explanationCredit`, `fixCredit` and `feedback`. Summary fields were `strengths`, `blindSpots`, `nextSteps`, `category`, `text` and `submissionIds`.
- Removed the prompt wording assertions for injection `flawCount`, one hint per flaw or key, and at least one summary item overall. The injection and hint schema tests cover exact counts. The app validator continues to enforce a nonempty summary. The exact-source, nonoverlap, evidence, independent-credit, learner-safety and untrusted-data prompt checks remain.
- The existing ordinary smoke CSV assertion now requires blank label and agreement columns. The invalid-result provider cases were retitled SEC-02.1 with their assertions preserved.

### Committed G2 test blobs at `272c798`

| Path | Git blob |
| --- | --- |
| `tests/unit/server/llm/soc-provider.test.ts` | `d139e6f5450d5c49d093d03bcdc3756ab3ee0fca` |
| `tests/unit/server/llm/soc-smoke.test.ts` | `7b51fc602f121b7675405852cddff9856a710b59` |

## Findings and open questions

- **REV-01 (P2, resolved in round 1):** The wire builder now projects the existing Zod output contracts to JSON Schema and applies snapshot-specific constraints and ordering. All 334 targeted tests, lint, typecheck and `git diff --check` passed. Independent rereview confirmed T-05/SEC-04.3.
- **REV-02 (P3, nonblocking SEC-04.1):** The committed preflight test computes its threshold from the implementation's measurement. G2 tests remain unchanged. An independent simulated check across all 26 smoke cases used captured serialized bytes plus 256 framing units and verified acceptance at that limit and rejection one unit below.
- **G4 live finding.** Shawn reported that SoC now serves `qwen3.6:35b` on vLLM. Its structured output emits keys alphabetically, so `assess_review` writes `explanationCredit` before `feedback`. The two awarded credits were equal in 17 of 19 valid cases. A scratch experiment nested the credits under a later-sorting key and restored feedback-first output. It yielded 15/21 valid, including five safety rejections among the six invalid responses, and 10/15 exact agreement on both credits. Shawn judged the experiment to offer no net gain.
- **G4 decision (Shawn, 9 Nov 2026).** Accept #77 as is, including the reported §6 injection failures, and keep T-05 done. Grading accuracy moves to T-12. `inject_flaws` quality stays with the Author role, and the stress timeout stays with the SEC-04 timing item.

## Next action

At G4, Shawn runs the labelled E6 smoke with the development key and default effort. Record at least 19/21 valid cases and the number of valid cases with exact label agreement. Record valid §6 smoke results for all four operations and the five-flaw stress result (timeout is acceptable). Run `bun run verify` and `bun run test:e2e` and report local database integration separately. Commit the reviewed implementation with the PLAN status and this handoff, commit the guide separately, then write and commit the session log and open the PR from the fork to upstream `master`.
