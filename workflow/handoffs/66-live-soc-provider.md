# #66 — Live SoC provider

- **Route:** high
- **PLAN task:** T-05, fifth and final Foundations slot
- **Branch:** `feat/66-live-soc-provider`
- **Base commit:** `a50036a385d0b28708272db0ea735c72bdddc4a0` (`upstream/master`)
- **Status:** done

## Goal

Enable hosted opt-in to the live SoCLaaS chat-completions adapter at the shared
LLM boundary. Cover SEC-04 including SEC-04.3–04.5, SYS-13.3, SYS-15 and
SYS-15.1, SYS-18.1 and all four INTEGRATION §4 contracts, including the
independent explanation and fix credit levels for `assess_review`.

## Stages

| Stage | Agent and effort | Status | Evidence | Tokens |
| --- | --- | --- | --- | --- |
| Ready | Main | Complete | [Issue #66](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/issues/66) verified OPEN. The existing branch matched the base with a clean tree. Verified cited IDs and §4 at the base. T-04 is done and Foundations has one slot. LLM and SEC work select high. | See Main sessions |
| Plan / G1 | Planner / high, Main for G1 edits | Complete | Verified `beefe1f2fbf97a3ff06ac87bc8c0c21c2fb18dae` is the first commit on the feature branch over the recorded base. Its only change adds T-05 to [PLAN](../PLAN.md) and its PLAN blob matches `8ad1ade9b2de6796ecf579778fd42f6cd3d970d1`. T-04 is done and PLAN capacity is 5 Foundations, 11 total. | 786873 (planner) |
| Tests / G2 | Test-writer / medium, Main for G2 additions | Complete | Verified Shawn's commit `95e9a1ceb4215d8917bc82d4fd42c8a483903112` immediately follows G1 and changes only the two acceptance files. Their commit, index and worktree blobs match the reviewed hashes below. At G2, 10 provider cases passed, 58 failed as expected and 36 failed on the missing smoke script. The earlier regression run passed 201 existing LLM tests. Criterion titles, targeted ESLint, direct TypeScript and whitespace checks passed. | 1532058 (test-writer), see Main sessions |
| Implement | Implementer / medium | Complete | G2 blobs remain frozen in the index and worktree. Only LLM source and Shawn's T-05-only exception paths (`workflow/scripts/soc-smoke.ts` and `workflow/scripts/fixtures/soc-smoke/`) changed after the checkpoint. Main independently ran 305 targeted tests across 11 files, lint and typecheck on Node 24 in a snapshot excluding environment files. All passed. | 1743362 (implementer) |
| Review | Reviewer / medium and security-reviewer / high | Initial reviews complete | Both exception paths were in scope. Before and after SHA-256 digests both `fe049929966309ee5baad9b81d3090280efa43e7f2b70f0afa4f8b8fef9f5112`. Shawn resolved REV-01 and SEC-REV-01 and accepted SEC-REV-03 at G3. REV-02 and SEC-REV-02 still block. No fix rounds run. | 916640 (reviewer), 2002253 (security-reviewer) |
| Supplementary Tests / G2 | Main | Complete | [Eight focused cases](../../tests/unit/server/llm/soc-provider-findings.test.ts) cover REV-02 and SEC-REV-02. Before the fix, six failed as expected, two deadline controls passed, and all 305 prior tests passed. Lint, typecheck and whitespace checks passed. Shawn's commit `1b29566f566abf7874644e94720d2021c5ef375e` immediately follows original G2 and adds only the reviewed test. Verified its commit, index and worktree blob `e3ceab1594bc002c3cd773955c94aad8ccb3ece9` and both original G2 blobs. | See Main sessions |
| Fix round 1 | Implementer / medium | Complete | Checkpoint comparison found only `execution.ts`, `soc.ts` and the authorized `soc-smoke.ts` changes outside orchestration bookkeeping. All three G2 test blobs still match. Main independently ran 313 tests across 12 files, lint, typecheck and whitespace checks on the fix. All passed. | 664662 |
| Rereview 1 | Reviewer / medium and security-reviewer / high | Complete, security blocking | Before and after SHA-256 digests both `29ffb428bfc9d839bd486b8f4ca83ac6d0915930d9b15a582a42ee1cea6462a0`. REV-02 resolved. SEC-REV-02 remains blocking because a contradictory zero can mask the other count exceeding its reservation. Both agents passed the 313 offline tests. Security independently reproduced both mixed-count cases. | 266690 (reviewer), 871079 (security-reviewer) |
| Fix round 2 | Implementer / medium | Complete | Only `soc.ts` and supplementary internal test `soc-usage.test.ts` changed. Both mixed-count cases failed before the fix. Main independently ran 315 tests across 13 files, lint, typecheck and whitespace checks. All passed. All G2 blobs match and REV-02's pass carries forward. | 504759 |
| Rereview 2 | Security-reviewer / high | Complete | Before and after SHA-256 digests both `543877a2392395c3d6a78c94003fb65875a6c3c7fdaf93d2b368a20e08a16da5`. SEC-REV-02 resolved. All 315 offline tests passed. Simulated runner probes rejected mixed zero and above-cap counts, accepted exact-cap mixed counts, and charged uncertain usage in each case. | 543878 |
| Docs | Docs / low | Complete | Only [Developer Guide](../../docs/DeveloperGuide.md) changed. Verified hosted opt-in, SEC-04 and SYS-15 anchors, repeated human settings review, script flags and fixture paths, and complete retained flaw context against the implementation. The CLI rejected an offline invocation without `--live`. | 546195 |
| Close-out / G4 | Main and Shawn | Human validation recorded | T-05 is done in PLAN. Shawn reported that `bun run verify` and `bun run test:e2e` passed on 2026-11-09 and completed live smoke with the development key. See G4 evidence below. | See Main sessions |

## Main sessions

| Session | Stages covered | Thread ID | Total tokens | Resume gaps |
| --- | --- | --- | --- | --- |
| 1 | Ready, Plan / G1 | `01a1bff0-2f57-71a1-a702-39731ef20097` | 1821693 | none |
| 2 | Tests / G2 | `01a1bff9-900e-73c2-a8db-cbc3dd3d71ad` | 3977851 | none |
| 3 | G2 verification, Implement, Review, G3 decisions and supplementary G2 | `01a1c008-18c2-7101-98e6-18e4c585f6c8` | 3544325 | none |
| 4 | Supplementary G2 verification, fixes, rereviews, Docs and G4 | `01a1c019-55c3-7850-a953-cdfd4d182b34` | 3024351 (recorded at close-out) | none |

End each main session at G1, G2, any G3 and G4 after updating this handoff.
Gate fixes requested by Shawn stay in the session that reached the gate.
Each resumed session starts here, verifies the human-provided gate commit,
copies the prior final token total verbatim and records what it had to
re-derive or ask for in Resume gaps, or `none`. Record the current thread ID
before ending. Keep this handoff for the feature commit.

## Decisions

| Date | Who decided | Decision and one-line reason |
| --- | --- | --- |
| 2026-11-09 | Shawn | Pin `qwen3.5:9b` and set `reasoning_effort` to `none` for all four operations. Keep model, per-operation effort and output cap as constants in `src/server/llm/config.ts`. |
| 2026-11-09 | Shawn, G1 | Size the app caps for realistic output so the existing 15-second attempt deadline is the binding limit for slow calls. A predictable length finish consumes the invalid-output retry. A timeout ends the operation after that attempt. Use 1,280 tokens for `inject_flaws`, 384 for `generate_hints`, 576 for `assess_review` and 1,024 for `summarize_learner`. |
| 2026-11-09 | Shawn, G1 | Each dev and prod key allows 30 requests/min, $50/day and $500/month on UTC windows. The LGTM ceiling of 20 attempts/min fits. Human-supplied evening `GET /v1/models` evidence for `qwen3.5:9b` prices input/output at 114,438/200,438 µ$ per million tokens, up from 100,000/150,000 earlier on 9 Nov. Pricing 1.5M daily tokens at the evening output rate gives about $0.30/day, within each key's daily budget. The app and agents do not call the portal. |
| 2026-11-09 | Shawn, G1 | The same evening `GET /v1/models` evidence reports `context_length`, `context_window`, `max_context_length` and `max_model_len` all at 65,536 tokens. This meets SEC-04's minimum, and 32,768 input tokens plus the largest app cap of 1,280 fits. |
| 2026-11-09 | Shawn, G1 | Hosted development defaults to fake. Hosted development and production each opt in with `AI_PROVIDER=soclaas` and their own server-only `SOCLAAS_API_KEY`. |
| 2026-11-09 | Shawn | Keep existing boundary, accounting and contracts except where SEC-04 requires changes. Derive the output schema in each model instruction from the existing contract. Settle with verified usage under SEC-05 and charge the full reservation when usage is unverifiable. |
| 2026-11-09 | Shawn | Provide a manual smoke and reasoning-effort experiment runner under `workflow/scripts/`. It requires explicit live consent and the exported dev key, accepts operation payload files with optional case IDs, operation, repeat count and a script-only effort override. Pace at no more than 15 requests/min with a per-run cap. Ship inputs for all four operations from INTEGRATION §6. |
| 2026-11-09 | Shawn | Validate smoke responses with the app's contract and SEC-02/SEC-03 checks, including every retained flaw. Emit one CSV row per call with case ID, operation, effort, latency, prompt/completion tokens, finish reason, reasoning character count, validity, rejection reason and parsed assessment credits. The script never reads `.env*` or emits the key or reasoning text. Shawn runs it live locally. Agents and tests use simulated transport only. |
| 2026-11-09 | Shawn, G1 | Pace smoke starts at least four seconds apart and cap a run at 30 calls. Add a script-only `--max-tokens` override bounded by the SEC-04 output ceiling alongside the effort override. Report the requested cap in the `max_tokens` CSV column. App caps stay constants. |
| 2026-11-09 | Shawn, G1 | Ship a separately labeled stress input alongside the §6 fixtures. It requests five injected flaws across several categories on working code long enough to accommodate them. A stress-case timeout informs Taia's SEC-04 timing decision. T-05 follows the existing timing limits. |
| 2026-11-09 | Shawn, G2 | Add smoke-only CSV rejection detail and answer character counts to distinguish empty, truncated, malformed, contract-invalid and unsafe responses without exposing model text. Preserve app error codes and messages. Reject unsupported effort overrides before file reads or dispatch. |
| 2026-11-09 | Shawn, G3 | Authorize the implementer to write `workflow/scripts/soc-smoke.ts` and `workflow/scripts/fixtures/soc-smoke/` for T-05 only. G1 PLAN Constraints required both paths, while Config paths omitted them. Treat these paths as in scope at Review. All other `workflow/` paths are outside the exception and the G2 tests stay frozen. |
| 2026-11-09 | Shawn, G3 | Resolve REV-01 and SEC-REV-01 without a code or contract change. SEC-04 configuration review is a human settings review, with review or settings evidence allowed by SYS-19.4. The app cannot observe key limits without calling the portal, which SEC-04 forbids. SoC enforces each key's rate and budget, and its 429s end the operation as transport failures. Keep the committed hosted-default test. Docs must link SEC-04 and require repeating the review whenever the key, model or ceilings change. |
| 2026-11-09 | Shawn, G3 | Accept SEC-REV-03. Smoke inputs are operator-supplied. Docs must state that they include the revision's complete retained flaw set. |
| 2026-11-09 | Shawn, G3 | Send REV-02 and SEC-REV-02 to one fix round after a human supplementary G2 commit. Main writes the focused new tests directly, leaving the original G2 files frozen. Both reviewers rereview only these two findings. |
| 2026-11-09 | Shawn, G4 | Merge T-05 as the provider foundation. Keep both hosted environments on the fake provider for now. Model answer quality and SoC latency are follow-ups outside T-05. |

## Gate and rerun state

- G1 checkpoint was the clean base plus this handoff. The only specialist edit
  was to `workflow/PLAN.md`. `git diff --check` passed. No product or test code
  was written. Unit tests, lint, typecheck, integration, verify, e2e and live
  smoke were not run. Planner thread `01a1bff0-f246-7200-b81b-1d41b9824eb9`.
- Verified G2 commit, index and worktree blobs are
  `b4c89ec92ce8b9053543a8d85a482bf7e812e865` for
  `tests/unit/server/llm/soc-provider.test.ts` and
  `598362572b1b8ff9c99aa21fa746a720d4f3e4ca` for
  `tests/unit/server/llm/soc-smoke.test.ts`. Test-writer thread
  `01a1bffb-e9aa-7271-abd3-864b3224ca0b`. The orchestrator applied the G2
  additions directly. The unchanged smoke file prefix still hashes to
  `189781226c85d2cc4c71a0a9c610ea5df3090171`.
- The provider failures show the configured path does not select or invoke SoC,
  invalid live settings can reach reservation, and versioned settings exports
  are missing. All smoke cases identify the missing script via a guarded import.
  Supabase integration, full lint/typecheck scripts, build, verify, e2e and live
  smoke were not run. The targeted TypeScript check used `tsc` directly.
- Implement checkpoint found only the existing T-05 PLAN status edit and
  this handoff beyond G2. Implementer thread
  `01a1c00b-111f-7eb3-bad4-ca6de8d17b9d`. Supabase integration, build,
  verify, e2e and live smoke were outside that stage's checks.
- Correctness reviewer thread `01a1c010-3ef7-7a51-91dd-8a49518facc2`.
  Security reviewer thread `01a1c010-68a0-7fb0-a5c4-dbf1992a4665`.
  Both reproduced failures offline. The security reviewer identified the
  intentional prompt-injection fixture at `soc-provider.test.ts:291`.
- Supplementary G2 on Node 24 used an environment-file-free snapshot. Both
  fulfilled-at-deadline cases already pass. The oversized response at the
  deadline returns `INVALID_AI_OUTPUT` in the app and smoke, and the app
  dispatches and settles twice. All four zero-usage cases settle as verified
  instead of uncertain. No new interfaces or privileged surfaces are defined.
- Fix round 1 implementer thread `01a1c01a-b548-7b80-873c-bad73d550703`.
  Main ran the LLM unit suites, lint and typecheck on Node 24 in a snapshot
  excluding environment files.
- Rereview 1 threads `01a1c01c-9e70-7b11-bbfe-3ec59fce83a6`
  (correctness) and `01a1c01c-c14d-7d72-99b0-d94deccf6ae3` (security).
- Fix round 2 implementer thread `01a1c01f-d551-7752-ac12-b6eb9a7b7e48`.
- Rereview 2 security thread `01a1c021-4b9d-7293-8916-0aef418b27ca`.
- Docs thread `01a1c023-e238-75c3-8a63-921c0482a4f0`.

### G4 evidence

Shawn reported the following on 2026-11-09:

- `bun run verify` and `bun run test:e2e` passed.
- Live smoke with the development key returned valid `generate_hints` output.
  `inject_flaws`, `assess_review` and `summarize_learner` failed contract
  validation. There were no empty or length-capped answers. The five-flaw
  stress case timed out at 15 s.
- On the diagnostic rerun, `assess_review` returned valid output in 3.7 s.
  `inject_flaws` returned one proposal for `flawCount: 2`, with a wrong
  snippet and blank explanation and fix. It took 44.7 s for 182 completion
  tokens, which Shawn attributed to SoC queueing rather than generation.
  `summarize_learner` cited categories without evidence and omitted
  `submissionIds`, using 965 tokens in 15.7 s.
- The adapter and validators behaved as specified.

### Acceptance coverage

| Criteria | Evidence |
| --- | --- |
| SYS-13.3, SYS-15, SYS-15.1, SYS-18.1 | [Provider tests](../../tests/unit/server/llm/soc-provider.test.ts) exercise hosted fake default, explicit opt-in with separate test keys, checked default composition, versioned model/effort/caps, named safe errors and offline isolation. |
| SEC-04, SEC-04.1–04.3, SEC-04.5 | Provider tests exercise fail-closed deployment checks, exact wire requests for all four operations, byte and time cutoffs, preflight and lower limits, capacity denial, redirects and upstream failures without retry. Existing `tests/integration/llm/` covers durable budget enforcement. |
| SEC-04.4, SEC-05 | Provider tests exercise empty/length retries, reservation per attempt, verified/uncertain charges and exclusion of reasoning from application results and diagnostics. |
| INTEGRATION-SPEC §4 | Provider tests cover all four output shapes and semantic guidance, invalid results, independent credits and no-match bypass. Review must verify the implementation derives the instruction shape from the existing contracts. |
| INTEGRATION-SPEC §6, SEC-02, SEC-03, T-05 smoke | [Smoke tests](../../tests/unit/server/llm/soc-smoke.test.ts) cover four §6 inputs, complete retained context, a five-flaw stress timeout, safe CSV and rejection detail, answer and reasoning character counts, explicit opt-in, bounded overrides, start spacing and run cap. |

### Interfaces defined by tests

- `createOperationRunner` and `createLlmBoundary` accept `env: Record<string,
  string | undefined>` and optional `soc: { fetch: typeof fetch; verifiedLimits:
  boolean; contextTokens: number; model?: string; destination?: string }` in
  place of the injected `provider`. Hosted composition without `soc` uses
  checked defaults. Existing injected-provider callers retain their path.
- `src/server/llm/config.ts` exports `socModel` and `socOperationSettings`
  with `{ effort, maxOutputTokens }` per operation. `getLlmConfig(env)` names
  the invalid setting without exposing its value.
- `workflow/scripts/soc-smoke.ts` exports `runSocSmoke(args: string[], deps):
  Promise<string>` returning CSV. Dependencies are `env: Record<string, string
  | undefined>`, `readFile(path: string): Promise<string>`, `fetch: typeof
  fetch`, `clock(): number` and `sleep(ms: number): Promise<void>`.
  Arguments are `--live`, `--operation`, repeatable `--input`, `--repeat`,
  `--effort` and `--max-tokens`. Input files are JSON arrays of `{ caseId?,
  payload, retainedFlaws? }`. The four §6 fixture filenames are kebab-case
  operation names plus `.json`, alongside `inject-flaws-stress.json`, under
  `workflow/scripts/fixtures/soc-smoke/`.
- The smoke CSV adds `rejection_detail`, with only `empty`, `length`, `json`,
  `contract` or `safety` for invalid responses and blank for valid, transport
  failure and timeout rows. `answer_chars` counts characters in
  `message.content` for both valid and invalid content. CSV omits answer and
  reasoning text. `--effort` accepts `none`, `low`, `medium` and `high` and
  rejects other values before file reads or dispatch.
- The tests define no new privileged database surfaces.

## Findings

| ID | Priority | Criterion | Status | Evidence and fix direction |
| --- | --- | --- | --- | --- |
| REV-01, SEC-REV-01 | P1, P2 | SEC-04, SYS-18.1 | Resolved by Shawn at G3 | SEC-04 verification is a human settings review under SYS-19.4. SoC enforces key limits and 429s end as transport failures. No code, contract or G2 test change. Docs must link SEC-04 and state when to redo the settings review. |
| REV-02 | P2 | SEC-04.1, SEC-05.3 | Resolved in rereview 1 | Both paths give the deadline precedence over provider fulfillment and rejection. The app aborts, settles once as uncertain and ends without retry. |
| SEC-REV-02 | P2 | SEC-04, SEC-04.4, SEC-05 | Resolved in rereview 2 | Contradictory zeros settle as uncertain. The adapter checks parsed counts against the reservation independently of settlement eligibility, so an above-cap count still rejects the output. |
| SEC-REV-03 | P3 | SEC-03, T-05 smoke | Accepted by Shawn at G3 | Smoke inputs are operator-supplied. Docs must require the revision's complete retained flaw set, including unmatched flaws. |

## Open questions

None.

## Next action

Shawn commits the reviewed feature and guide separately, writes the session log,
and opens the feature PR. Hosted environments continue using the fake provider.
