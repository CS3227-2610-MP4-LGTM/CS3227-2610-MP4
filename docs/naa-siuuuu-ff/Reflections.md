---
layout: default
title: naa-siuuuu-ff
parent: Reflections
---

# Reflections: naa-siuuuu-ff

[Back to team reflections](../Reflections.md)

I came into MP4 with one experiment behind me: in Week 9 I compared a single
test-writing agent against a designer → writer → verifier pipeline. The
pipeline did not catch more bugs, but it cost about eight times the tokens.
That result shaped most of my choices in MP4. I kept agents independent where
independence buys something, mainly review. Everywhere else I ran stages in one
session and paid for the extra context instead.

The evidence is in my feature handoffs ([81][h81], [82][h82], [83][h83],
[84][h84]), my session logs in [`logs/naa-siuuuu-ff/`][logs] and the PRs
listed below. Token numbers come from my Claude Code session records (section 4.4
explains how I counted them).

## 1. My role and features

I owned the **Author** role: every Author story, AUT-01 to AUT-06, across the
four PLAN tasks the budget allowed. All four ran on the high route, because
each one added database functions with grants, a private idempotency ledger,
row-level security changes or an LLM operation.

| Task | What it delivers | PR | Session tokens |
| --- | --- | --- | ---: |
| T-20 | Create, configure, list and edit drafts (AUT-01, AUT-02, AUT-06.1–06.3) | [#93][pr93] | ≈ 81M |
| T-21 | Generate, preview and decide flaw proposals (AUT-03, AUT-04) | [#94][pr94] | ≈ 52M + part of 21M |
| T-22 | Publish a challenge with generated hints (AUT-05) | [#95][pr95] | ≈ 105M for T-22 and T-23 together (shared sessions) |
| T-23 | Unpublish and archive (AUT-06.4–06.7) | [#98][pr98] | (included above) |

Team-level work: local Supabase setup, the forking workflow notes and the
`supabase-local` skill ([#4][pr4]); a CI `migrations` job that applies every
migration to a fresh Postgres, lints it and fails on stale generated types
([#5][pr5]); the reflection scaffolds ([#85][pr85]); and a spec-only change that
gave the Author list a lightweight `AuthorChallengeCard` before any code was
written ([#86][pr86]).

The Author role has two LLM features, both through the shared boundary in
`src/server/llm/`:

- **Flaw proposals** (`inject_flaws`): the model proposes realistic flaws to
  plant in the Author's working code. The Author approves or rejects each one
  and previews the final challenge as a diff.
- **Hints at publication** (`generate_hints`): when a challenge is published,
  the model writes graded hints for each approved flaw. These are stored with the
  immutable published revision.

## 2. Multi-Agent SE

### 2.1 Designing the coordination pattern

The team's pattern is the `sdd-orchestrate` stage machine: Ready → Plan →
Tests → Implement → Review → Docs → Close-out, with human gates G1–G4. On paper,
the high route spawns a separate agent for every specialist stage. I did not
run it that way, and the Week 9 experiment is why.

| Week 9 finding | What I did in MP4 |
| --- | --- |
| Pipeline and generalist caught the same 5/5 bugs; mutation 81.75% vs 80.7% | Plan, Tests, Implement and Docs ran in the main session with each stage's skill loaded, not in spawned agents. |
| Pipeline cost ~8× the tokens | Subagents were used only for Review, where a fresh context is the whole point. |
| The value was the verifier refusing to weaken tests and escalating instead | The human commits tests at G2 before any code exists, and the implementer may not touch them. The orchestrator checks `git diff <G2 commit> -- tests` is empty. |
| "Separate who decides *correct* from who sees the code" | The reviewer gets no handoff, no implementation narrative and no parent history, only the diff, the tests and the task's spec sections. |

The review pattern changed partway through. T-20 and T-21 used the documented
pair: a reviewer and a security reviewer in parallel. After T-21's first
review I switched to a **generator plus one verifier**. The main session
generates; one fresh subagent loads both `sdd-review` and
`sdd-security-review` and verifies. Experiment 2 (section 5) has the reason
and the numbers.

The gate that caught the most was **G3**. Every task stopped there at least
once, and in every case the decision was the same kind: should a review
finding become a new committed test before the fix? I said yes in all four
tasks (T-20 REV-02, T-21 REV-01, T-22 SEC-REV-01, T-23 S-01/R-01/R-02), so
findings turned into failing tests first, as in Week 9.

Route selection was straightforward for my tasks: all four touched migrations
and grants, so high was forced. The one call that needed thought was the
`AuthorChallengeCard` change. It looked like docs, but it changed an API
contract. I kept it as a separate spec-only PR so that T-20's tests were
written against the approved contract.

### 2.2 Verifying the pattern was followed

I did not trust agent reports as proof. The checks I relied on were mechanical:

- **Gate commits.** After each human commit I had the agent check it with
  `git log`/`git show`: only `workflow/PLAN.md` for G1, only `tests/` for G2.
  Early on I gave commit IDs by hand. In T-20 I told the agent to check them
  itself, and it did from then on ([log 003][l003]).
- **Test baseline.** At G2 the handoff stores blob hashes of every acceptance
  test file ([81 "G2 baseline"][h81]). Every later stage starts with
  `git diff <G2> -- tests` and must find it empty.
- **Read-only reviewers.** A digest of `git status --porcelain` plus
  `git diff HEAD` is taken before and after each review batch. Every batch
  matched (for example `982b3697…` for T-20, `a589c4d0…` and `69b6d944…` for
  T-22). One T-23 verifier was interrupted when my session ended. The agent
  checked that the fingerprint (`959fe1c3…`) was unchanged before resuming it,
  rather than assuming nothing had happened ([log 008][l008]).
- **Criterion IDs in test titles.** Every acceptance test starts with its
  criterion ID, so coverage can be checked with a grep instead of a judgement.
- **The summary block.** Every subagent returns the fixed `Status / Criteria /
  Files changed / Checks / Findings` block. Reviewers marked e2e criteria
  `unverified` when they had not run Playwright, rather than `met`.

The checks also caught deviations, and I recorded them instead of hiding them.
The Stages table says "main running sdd-test (no test-writer subagent)" for all
four tasks. In T-21, a REV-08 fix went in *after* the re-review and was never
re-reviewed. The handoff says exactly that ([82 Findings][h82]).

### 2.3 Idle, overloaded or blocked agents

**Blocked on a human.** T-21's first review stopped at G3 as `blocked`, because
REV-01 needed a change to committed tests. Only I may approve that. T-23's
re-review verifier started on 12 Nov at 02:36. My next prompt was at 09:46, so
the session sat idle for seven hours overnight. Nothing was lost, because the
state was in the handoff, but the cache went cold (see 4.2).

**Idle in a parallel batch.** In T-21's paired review the security reviewer
finished at 02:22 and the reviewer at 02:25. The batch is only complete when
both are, so the faster agent's result waited. Three minutes is small, but it
is the structural cost of a parallel pair with a single gate.

**Overloaded.** The overloaded agent was always the main session, never a
subagent. T-20's main session did the survey, the spec change, Plan, Tests,
Implement and the first review. It reached 166 API calls with an average of
about 308k tokens of context per call, and a 5 MB transcript. I had it write
the handoff and started a fresh session, which continued from the handoff alone
at about 177k tokens per call (section 3.5).

### 2.4 Retries, repeated analysis and unnecessary tool calls

| Task | Review rounds | Fix rounds | What caused the extra round |
| --- | --- | --- | --- |
| T-20 | 2 | 1 | 2 blocking P2s: NUL bytes passed validation; private ledger grants untested |
| T-21 | 2 | 1 (+1 post-review fix) | 3 P2s: private surfaces untested, code snippets bypassed the shared diff view, focus lost after generation |
| T-22 | 2 | 1 | Four P3s; I chose to fix three |
| T-23 | 2 (+1 for a CI fix) | 1 | S-01: failed lifecycle outcomes not recorded in the ledger |

No task needed the second fix round the workflow allows.

The most expensive repeated work was a **CI-only failure** on PR #98. The
`integration` job failed on all three CI runs, while every local run passed.
Much of session `bdf05059` (35M tokens in total) went on ruling things out one
at a time: an unrelated merge, AI limits (they return 429, not 409),
unawaited settlement. The breakthrough was reproducing CI's file order locally
with a temporary Vitest sequencer. The response body then showed
`VERSION_CONFLICT`. The cause was a real T-22 bug: the publication capture read
`proposal_decisions` without an `ORDER BY`, so the fingerprint changed between
two reads of the same data ([log 009][l009]). With hindsight, test order should
have been the first hypothesis, not the last. I now put "CI runs files in a
different order" in the pitfalls I paste at the start of every session.

Smaller waste: Write and Edit calls that failed because the file had not been
read first (logs [001][l001] and [008][l008]); an e2e run that broke because
the agent ran Playwright twice at once and one run deleted the other's
artefacts ([log 003][l003]); and an integration file that hangs in fixture
provisioning when run twice in a row, which needs `bun run db:reset`.

### 2.5 Conflicts and disagreements between agents

**Severity: verifier vs generator (T-23 S-01).** The verifier rated S-01, failed
lifecycle outcomes not being recorded in the idempotency ledger, as P3. While
writing the failing test, the generator found it was worse: a failed archive
with a future `expectedRowVersion` could be replayed later, after a separate
unpublish reached that version, and would then archive the challenge. The
tiebreaker was the spec, INTEGRATION-SPEC §3 ("failed operations record
failure"), not either agent's opinion. I chose that option at G3.

**Root cause: verifier vs evidence (T-23 REV-03).** The re-review reported a
flaky setup in 1 of 3 runs and suggested the cause was "likely state shared
with another Author test file", which reads as a test problem. The evidence
showed a product bug from T-22. I treated it as a product bug: failing test
first (it failed 2/2 without the fix), then a one-line `.order("proposal_id")`
fix.

**Unreproducible finding (T-20 REV-06).** The re-reviewer flagged a `::bigint`
cast sharing an `OR` chain with its regex guard. A local probe could not
reproduce the failure. I accepted it as a known P3 rather than paying for a
second fix round.

**Agent vs human.** The agent once refused to create issues, citing PLAN's
planner rule that humans create them. That rule applies to the planner, and
`gh issue create` was not denied, so I authorised it ([log 002][l002]).

**Across teammates.** Rebasing T-20 onto master collided with the Learner work
in two places: a migration with the same timestamp version, and
`src/server/learner/submissions.ts`, whose helpers I had extracted into
`src/server/http/request.ts`. The agent kept upstream's new functions,
re-exported the moved helpers and renamed my migration. Learner behaviour did
not change.

### 2.6 Did the benefits outweigh the costs?

Across my four tasks, independent review produced **24 findings** before merge,
5 of them blocking P2s. Every review together cost about **21.5M tokens**,
8.5% of my 252M total. The generator sessions cost the other 91.5%.

| Measure | Value |
| --- | --- |
| Findings raised by fresh reviewers | 24 (T-20: 7, T-21: 9, T-22: 4, T-23: 4) |
| Examples of real defects they caught | NUL bytes giving a repeated 503; focus lost after generation; S-01 replay archiving a challenge; publish 409 from unordered reads (surfaced as a flake) |
| Review cost | ≈ 21.5M tokens (12 subagent runs) |
| Generator sessions | ≈ 230M tokens |
| Author defects found after a merge | 1 (the T-22 unordered read, found during T-23) |

My verdict: **independent review paid for itself; independent test writing
would not have.** Review is about 9% of my cost and caught every blocking
issue before merge. A separate test-writer would have meant a second cold
context for every task, and Week 9 gives no evidence that it finds more bugs.
The G2 commit gives me what I wanted from separation, an oracle the
implementer cannot weaken, for the price of one human read.

The one defect that escaped (the unordered read) also escaped T-22's tests and
its verifier. More reviewers would probably not have found it; a test run in a
different order did. Running integration files in shuffled order locally would
be a cheaper safeguard than another reviewer.

### 2.7 When to use multi-agent coordination, and when not

My rule of thumb:

- **Use a separate agent where its value is *not knowing* something**: review,
  and any judgement that the generator's reasoning would bias. A fresh context
  is the feature.
- **Use one agent, plus a human gate, where the value is a checkpoint**: Plan,
  Tests and Docs. The G1/G2 commit gives the independence; a separate agent
  would only add another cold start.
- **Do not split a single-file, low-route change**, such as the
  `AuthorChallengeCard` spec or this reflection. The orchestration overhead
  would cost more than the change.

If I started again, I would make the generator plus one verifier the default
on the high route. I would also add "run integration files in shuffled order"
to the Implement stage's checks.

## 3. Context Engineering

### 3.1 System prompts and skills

I barely touched AGENTS.md; it is the team's always-loaded contract and is kept
short. My context engineering happened in three other places:

1. **A skill for a recurring chore.** `supabase-local` ([#4][pr4]) holds the
   start, reset, migration and type-generation steps and a read-only
   `doctor.sh` that prints no keys. `sdd-test` and `sdd-implement` reference
   it, so no agent has to work out the Supabase CLI v3 flags again (the CLI
   dropped `--local`, which cost my first attempt).
2. **Guardrails as configuration, not prose.** CLI v3 reaches hosted databases
   with `--remote`, which the existing rules missed. I added deny rules to
   `.claude/settings.json` and the Codex rules instead of a sentence asking
   agents not to use it.
3. **A session-start brief and memory.** Each session started with a pasted
   brief: role, working agreements and known pitfalls. Corrections that should
   last went into Claude Code memory files, for example "check gate commits
   with `git log` yourself" and "every review uses ONE fresh verifier". Before
   the first, I gave the commit ID at every gate. After it, the agent checked
   by itself in every later session, without being reminded.

### 3.2 Upfront context vs retrieval on demand

**Upfront**: anything that changes what the agent is *allowed* to do, or that
it would otherwise rediscover expensively. That means permissions (who commits,
who may create issues), the review arrangement, and the pitfalls list:

> CI runs integration files in a different order … Running
> `tests/integration/author/lifecycle.test.ts` twice in a row can hang …
> Fingerprinted reads in `src/server/llm/` must be ordered.

Each line in that list stands for hours of past debugging. Three lines are
cheaper than rediscovering any one of them.

**On demand**: specs and handoffs. The skills require heading discovery first
and then bounded `git show` reads of the named sections only, never a whole
umbrella spec. My brief says to read the T-23 handoff "only if work touches
Author lifecycle or publication". For this reflection, the agent read
handoffs and logs; for a Learner bug fix, it would not.

This was not a controlled comparison. The signal I watched was the average
context per API call (3.5). Sessions that started from a handoff ran at
117k–222k tokens per call. The one session that carried everything from the
start ran at 308k.

### 3.3 How context organisation affected instruction-following

**Scope leakage from a nearby rule.** The issue-creation refusal (2.5) came
from a rule in PLAN.md's planner section that was read as a global rule. Once
the brief stated the permission explicitly near the top, it was never
misapplied again.

**A "Next action" field as the prompt.** From T-21 on, my opening prompt was
always "Resume #N from `workflow/handoffs/<file>` (load sdd-orchestrate) and
follow its Next action." Every later session started by checking the state the
handoff described (tests unchanged since the G2 commit, a checkpoint digest)
before doing anything else ([logs 006][l006], [007][l007]). A single field
with a fixed name works better than a paragraph of context, because the agent
knows where to look.

**Data, not instructions.** That pattern pulls against the rule that handoffs
are data. In practice the line held because *I* told the agent to follow
the Next action. The handoff did not tell it to. Reviewers were never given
the handoff path at all, and their diffs excluded `workflow/handoffs/` and my
uncommitted `.claude/settings.json`. When the agent noticed that local change,
which loosened agent git denies, it flagged it and advised against committing
it. It did not treat it as a new permission.

### 3.4 Handoffs and notes

The T-23 handoff ([84][h84]) is the best of mine. Later sessions used these
parts:

- **Stages table with evidence**: commit IDs, digests and test counts. A new
  session can re-check each line instead of trusting it.
- **Decisions table with who and when**: separates human decisions ("Human
  (G3, REV-03)") from orchestrator proposals.
- **"Carried over from T-22"**: binding decisions from the previous task. The
  most important was that republishing an unchanged candidate is allowed. Without
  it, T-23 could easily have "fixed" something I had explicitly accepted.
- **Findings table with status**: stable IDs let a re-reviewer get only
  "prior findings REV-01…" without the fix narrative.
- **Next action**: see 3.3.

The noise was the **Tokens column**. The team's `rollout-summary.ts` reads
Codex records, and I used Claude Code, so every cell says `unavailable`. I
computed the numbers afterwards for this reflection.

My handoffs also got shorter as I learnt what was needed: 311 lines for T-20,
then 177, 128 and 121. The T-20 one read like a transcript, with full test
output and attempt history, which the orchestrate skill says to leave out.

### 3.5 When more context made an agent worse

T-20's main session (`4d44106d`) is the clearest case. It ran from the codebase
survey through the spec change, Plan, Tests, Implement and the first review in
one conversation.

| Signal | T-20 main session | Fresh session from handoff (`bbded11a`) |
| --- | ---: | ---: |
| API calls | 166 | 118 |
| Average context per call (cache read ÷ calls) | ≈ 308k | ≈ 177k |
| Transcript size | 5 MB | — |

The session became unwieldy enough that it was renamed "(Too large) Author
role codebase review", and I had the agent write the handoff. The fresh
session read only the handoff and wrote the three supplemental test files in
about three minutes, to the same bar: 16 tests failed first, and 13 passed as
planned.

The cut was: everything except the handoff. Later sessions started at Ready
from the handoff and stayed between 117k and 259k per call.

## 4. Resource-aware Use

### 4.1 Choosing and configuring models

**Agents.** Everything ran on Claude Opus 5.5 in Claude Code. The team's role
configs in `.codex/agents/` set Codex models and efforts (planner and security
reviewer high, implementer, test-writer and reviewer medium, docs low). Claude
Code cannot select those configs, so I passed each role's instructions in the
spawn prompt. For T-20 I asked for medium effort for the reviewer and high for
the security reviewer. I did not try a smaller model for any stage. With a
deadline and the high route on every task, a missed P2 would have cost more
than the tokens saved, and output is only 0.5% of my tokens anyway (4.3).

**App.** Both Author operations run on the SoC model `qwen3.6:35b` with
reasoning effort `none` and fixed output caps:

| Operation | Effort | Max output tokens | Why |
| --- | --- | ---: | --- |
| `inject_flaws` | none | 1,800 (1,280 when T-21 shipped) | Structured JSON proposals checked by a schema and a SQL validator; reasoning adds latency and quota without improving checked output |
| `generate_hints` | none | 384 | Short hints per flaw |

At T-21's G1 I decided to keep the `inject_flaws` cap unchanged and record the
live-length risk instead of guessing. The cap was later raised to 1,800 in the
shared LLM work (`866e8b3`).

### 4.2 Reducing cache misses

Across all my sessions, **97.6% of input tokens were cache reads** and 2.4%
were cache writes. Uncached input was negligible.

| Component | Tokens | Share |
| --- | ---: | ---: |
| Cache read | 244.8M | 97.1% |
| Cache write | 6.1M | 2.4% |
| Output | 1.29M | 0.5% |
| Uncached input | 3k | 0.0% |

The practices that kept it high: the fixed dispatch prefix in
`sdd-orchestrate` (fixed text first, task values last), so every review spawn
shares a prefix; AGENTS.md and skills that rarely change mid-task; and one
session per stage group rather than restarting for every stage.

The misses I can point to come from **long human gaps**: the seven-hour
overnight wait in T-23 (2.3) meant the next turn rewrote the cache. I did not
run a before-and-after comparison, so I cannot claim a saving from any change.
What the numbers do show is that the cost driver was not misses but **the size
of what is re-read on every call**, which is why 3.5 matters more than 4.2.

### 4.3 Reasoning tokens

Claude Code stores thinking blocks redacted, so I estimated the reasoning
share as output tokens minus visible output (text and tool inputs, at about 4
characters per token):

| Session | Output tokens | Visible output (est.) | Reasoning share (est.) |
| --- | ---: | ---: | ---: |
| T-20 fix round (`bbded11a`) | 88,345 | ≈ 36.6k | ≈ 59% |
| T-21 plan → review (`8b309868`) | 183,601 | ≈ 78.3k | ≈ 57% |
| T-23 review → merge (`bdf05059`) | 120,596 | ≈ 44.0k | ≈ 64% |

So roughly **55–65% of output was reasoning**. But output is only 0.5% of
all tokens, so reasoning is about 0.3% of the total. Persisting reasoning
matters less for its own cost than for what it prevents: re-reading. The T-23
CI debugging is the example. The handoff and the pitfalls list now keep the
conclusion ("CI order", "unordered fingerprint read"). Without them, a later
agent would rebuild that by re-running suites and re-reading files, which is
exactly the cache-read volume that dominates the bill.

### 4.4 Monitoring and reducing token usage

**Monitoring.** The team's `rollout-summary.ts` reads Codex rollouts, so it
recorded `unavailable` for all my Claude Code stages. For this reflection I
summed usage from the Claude Code session files instead, one record per API
message ID.

That step matters. Claude Code writes one line per content block, and each
line repeats the message's usage. Summing every line gave T-20's main session
**140M** cache-read tokens. Counting each message once gives **51M**. An
earlier presentation brief of mine used the inflated number, overstating it by
about 2.7×. **De-duplicate before you trust a token count.**

**Reducing.** What I changed, with what I can measure:

| Change | Effect |
| --- | --- |
| Generator + one verifier instead of a parallel pair | First reviews ≈ 51% cheaper (Experiment 2) |
| Fresh session from a handoff when the main session grew | Context per call 308k → 177k (3.5) |
| Re-reviews get only prior finding IDs | Re-reviews cost 0.55M–1.77M vs 2.1M–5.5M for first reviews |
| Targeted tests (`bun run test <path>`) in sessions; full `verify` only at G4 | Not measured separately |
| Shorter handoffs (311 → 121 lines) | Not measured separately |

### 4.5 Which tasks used the most tokens

| Session | Work | Total tokens |
| --- | --- | ---: |
| `4d44106d` + 2 reviewers | Survey, spec, T-20 Plan → first review | 58.0M |
| `a514a9a4` + 2 verifiers | T-22 Implement → merge, T-23 Plan → Implement | 44.7M |
| `8b309868` + 2 reviewers | T-21 Plan → first review | 41.8M |
| `bdf05059` + 2 verifiers | T-23 G3 → merge, including the CI-order debugging | 35.1M |
| `bbded11a` + 2 reviewers | T-20 fix round → close-out | 23.0M |
| `d4ed0367` | T-21 Docs, T-22 Ready → Implement | 21.4M |
| `98a349c3` + 1 verifier | T-21 fix round → re-review | 10.1M |
| Others | Supabase, issues, scaffolds, T-23 first review | 17.6M |

By stage type, **Implement plus debugging in the main session** was the most
expensive. The most expensive single episode was the CI-only failure. Review
was the cheapest per finding. I brought implementation cost down mainly by
cutting context (3.5). I did not lower quality to do it: no task needed a
second fix round, and only one Author defect escaped into a merged PR.

### 4.6 Resource-aware use in the app

Every Author AI call goes through the shared boundary, which enforces the
team's ceilings below the SoC key's limit of 30 requests per minute:

| Scope | Active | Per minute | Per day | Tokens per day |
| --- | ---: | ---: | ---: | ---: |
| Account | 1 | 4 | 20 | 300,000 |
| Environment | 4 | 20 | 100 | 1,500,000 |

Each attempt has a 15 s timeout, each operation 35 s, with at most 2 attempts.

On top of that, the Author features add:

- **Idempotency ledgers** (`private.author_proposal_requests`,
  `private.author_publication_requests`). A retried "Generate proposals" or
  "Publish challenge" with the same key replays the stored result instead of
  calling the model again. Failures are recorded too, so a replay cannot spend
  quota twice.
- **Output validated twice**: by the TypeScript boundary and again by a SQL
  validator before anything is saved. A T-21 test sends six tampered payloads
  through the real `complete` path; each must fail with `INVALID_AI_OUTPUT` and
  save nothing.
- **Clear limit and timeout states**: 429 for limits, 504 `AI_TIMEOUT` when a
  late result arrives after the operation expired (T-21 REV-07).
- **A known cost I accepted**: republishing an unchanged candidate creates a
  new identical revision and spends hint-generation quota (T-22 REV-03). I
  allowed it at G3 and recorded it in the PR.

All of this is tested with the fake provider and local Supabase. No test makes
a live SoC call.

## 5. Experiments

### Experiment 1: one test-writing agent or a specialised pipeline? (Week 9, applied in MP4)

| Item | Detail |
| :- | :- |
| Question | Does a designer → writer → verifier pipeline write better tests than one generalist agent? |
| Setup | Apache Commons CLI cut to 10 files (3,203 lines), renamed so the model cannot recall its tests; a 130-requirement spec; 5 planted one-line bugs. Condition A: one generalist. Condition B: designer (spec only) → writer (may not change expected outcomes) → read-only verifier. Same model (Opus 5.5, medium), fresh session per run, interleaved A, B, A, B. The project's own 199 tests as a human baseline. |
| Metric | Bugs caught, line coverage (JaCoCo), mutation score (PIT), tokens, time |
| Result | Bugs: 5/5 for both. Coverage 92.6% (A) vs 92.85% (B) vs 94.4% (human). Mutation 80.7% vs 81.75% vs 84.6%. Tokens ≈ 108.5k vs ≈ 870k (**8×**). Time ≈ 6.5 vs ≈ 15 min. |
| Analysis | No quality difference at n = 2. The pipeline's value was behavioural: in run 4 the verifier reported 31 failing tests as "suspected code defects", said "No test should be changed" and escalated. In MP4 I bought that property with the G2 human test commit instead of a second agent, and kept separate agents for review. |
| Limits | n = 2 per condition, one codebase, one model, planted bugs, isolation enforced by instruction only. |

### Experiment 2: a reviewer pair or one combined verifier?

| Item | Detail |
| :- | :- |
| Question | Does one fresh verifier with both review skills cost less than a parallel reviewer + security-reviewer pair, without losing findings? |
| Setup | T-20 and T-21 first reviews used the pair; T-22 and T-23 used one verifier. Same model, same fixed dispatch prefix, no handoff for either. Not the same task, so this is an observational comparison, not a controlled one. |
| Metric | Total tokens per review run (including cache reads); findings raised |
| Result | See the table below |
| Evidence | Handoffs [81][h81]–[84][h84]; logs [004][l004], [005][l005], [007][l007], [008][l008] |

| Review | Arrangement | Tokens | Findings |
| --- | --- | ---: | --- |
| T-20 first | Pair | 5.45M | 6 (2 × P2), one found by both |
| T-21 first | Pair | 5.24M | 8 (3 × P2), one found by both |
| T-22 first | One verifier | 3.12M | 4 (P3) |
| T-23 first | One verifier | 2.12M | 3 (P3), incl. S-01 |
| T-20 re-review | Pair | 1.77M | 1 new P3 |
| T-21 re-review | One verifier | 1.24M | 1 new P3 |
| T-22 re-review | One verifier | 0.55M | 0 |
| T-23 re-review | One verifier | 1.17M | 1 new P3 |

**Analysis.** First reviews averaged 5.35M with the pair and 2.62M with one
verifier, about **51% less**. Findings per million tokens were about the same
(≈ 1.3/M either way), and the pair spent part of its budget finding the same
issue twice: T-20 REV-02 = SEC-REV-01, T-21 REV-01 = SEC-REV-02. The single
verifier still found the most consequential issue in my work, S-01.

The honest limits: the tasks differ, so some of the saving may be task size
rather than arrangement. The single verifier also missed the T-22 unordered
read, and I cannot know whether a pair would have caught it. Both reviewers
would have read the same code with the same blind spot. That defect was caught
by test order, not by reviewers.

## 6. Key takeaways

1. **Make independence mechanical, not organisational.** The G2 test commit,
   blob hashes and review digests gave me the separation Week 9 showed was
   valuable, without an 8× pipeline (2.1, Experiment 1).
2. **Spend agents on not-knowing.** A fresh reviewer is cheap (8.5% of my
   tokens) and caught every blocking issue before merge. A fresh test-writer
   would mostly repeat the cold start (2.6).
3. **Context size is the bill.** 97% of my tokens were cache reads, so the
   lever is how much each call re-reads, not cache hit rate. A handoff and a
   fresh session cut context per call by about 43% (3.5, 4.2).
4. **Write down pitfalls the moment they cost you.** The CI-order failure took
   much of a 35M-token session. The same knowledge now costs three lines of the
   session brief (2.4, 3.2).
5. **Count tokens carefully before reasoning about them.** My first count was
   2.7× too high because the session records repeat usage per content block
   (4.4).

[h81]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/81-author-drafts.md
[h82]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/82-author-proposals.md
[h83]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/83-author-publication.md
[h84]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/handoffs/84-author-lifecycle.md
[logs]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/tree/master/logs/naa-siuuuu-ff
[l001]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/logs/naa-siuuuu-ff/001-supabase-setup-and-forking-workflow.md
[l002]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/logs/naa-siuuuu-ff/002-author-survey-and-list-spec.md
[l003]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/logs/naa-siuuuu-ff/003-author-drafts-fix-round-close-out.md
[l004]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/logs/naa-siuuuu-ff/004-author-proposals-plan-to-review.md
[l005]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/logs/naa-siuuuu-ff/005-author-proposals-fix-round-rereview.md
[l006]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/logs/naa-siuuuu-ff/006-author-proposals-docs-close-out.md
[l007]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/logs/naa-siuuuu-ff/007-author-publication-implement-to-close-out.md
[l008]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/logs/naa-siuuuu-ff/008-author-lifecycle-review-to-close-out.md
[l009]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/logs/naa-siuuuu-ff/009-author-lifecycle-ci-fix-merge.md
[pr4]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/pull/4
[pr5]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/pull/5
[pr85]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/pull/85
[pr86]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/pull/86
[pr93]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/pull/93
[pr94]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/pull/94
[pr95]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/pull/95
[pr98]: https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/pull/98
