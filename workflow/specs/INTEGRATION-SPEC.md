# LGTM integration specification

## 1. Scope and contract conventions

This document owns the domain model, role integration contracts, LLM schemas,
grading rules and shared fixtures for LRN-01–LRN-08, AUT-01–AUT-06 and
TA-01–TA-05 in [the product specification](PRODUCT-SPEC.md#3-story-index).
It specifies behavior to implement; the current foundation does not implement
these tables or endpoints. Account contracts remain in SYS-05–SYS-06 and ACC-01–ACC-03.
Authorization and record visibility remain authoritative in
[SYS-12](TECHNICAL-SPEC.md#sys-12--record-access-and-audit), including database access.
AI controls, provider budgets, timeouts and retry limits belong to
`AI-SECURITY-SPEC.md`; live AI remains blocked by SYS-18 until those exist.

JSON field names are camelCase; logical database names below are snake_case.
All IDs are UUIDs, times are UTC RFC 3339 strings, and line numbers are positive
one-based integers. Arrays are ordered. Objects are strict: unspecified fields
are rejected, never silently stripped. A field is required unless marked `?`;
`null` is permitted only when explicitly stated. Zod validates requests, provider
output and cross-field invariants before writes or successful results.

### Shared values and bounds

| Name | Contract |
| --- | --- |
| `Language` | `python`, `java`, `javascript`, `typescript` |
| `Difficulty` | `easy`, `medium`, `hard`; display Easy, Medium, Hard |
| `Category` | `logic_bug`, `edge_case`, `error_handling`, `security`, `performance`; display the corresponding labels in PRODUCT-SPEC |
| `Role` | `learner`, `author`, `ta`, as defined by SYS-06 |
| `Text(n)` | Trimmed nonblank plain text of at most n Unicode code points |
| Title / description | `Text(120)` / `Text(4000)` |
| Comment / moderation reason / report reason | `Text(2000)` each |
| Flaw explanation / fix / assessment feedback | `Text(2000)` each |
| Hint | `Text(500)` |
| Summary text | `Text(2000)` per strength, blind spot or next step |
| Flaw count | Integer 1–5; category selections are unique and contain 1–5 categories |
| Review comments | 0–50 per attempt; zero comments is a valid submission |
| `Credit` | Exactly `0`, `0.5` or `1` |
| `Page<T>` | `{ items: T[], nextCursor: string | null }`; default limit 20, integer 1–50 |

Strings above are plain text even when they contain markup. Empty optional text
is not a substitute for omission. No file uploads, repository URLs or filenames
are accepted; a challenge is one pasted source file. Its display path is derived
from language: `challenge.py`, `Challenge.java`, `challenge.js` or `challenge.ts`.

### Pasted-code cap

Working code and assembled flawed code each have a maximum of **20,000 UTF-8
bytes**, inclusive, after converting CRLF and lone CR to LF. No other trimming,
Unicode normalization or tab expansion occurs. Reject ill-formed Unicode and code
blank after a whitespace check. Byte length is measured with UTF-8 encoding,
not JavaScript string length. Display and location calculations use the same
normalized stored string. Splitting on LF defines lines; a trailing LF creates
no extra commentable line. A nonblank file without a trailing LF is valid.

Every pasted-code entry point and generated candidate applies the same cap.
Requests have a separate **128 KiB UTF-8 JSON body limit**, checked before parsing;
this allows escaped code and comments but prevents oversized envelopes. Excess
body/code size returns 413 without writes or provider calls. A provider candidate
over the code cap is invalid output and leaves the draft unchanged. Boundary
checks include 20,000/20,001 bytes, multibyte characters and CRLF normalization.
These data bounds do not set provider token or usage budgets.

## 2. Domain model and publication lifecycle

The following are logical records, not permission to expose whole database rows.
Foreign keys, checks, unique constraints and transactions enforce these invariants
alongside the access rules in SYS-10–SYS-12. All relationships use IDs, never email.

| Record | Fields and invariants |
| --- | --- |
| `profiles` | Existing SYS-06 identity: `id` references Auth user, `displayName`, immutable `role`. No application email column. |
| `challenges` | `id`, immutable `authorId`, `status: draft | published | unpublished | archived`, `publishedRevisionId: UUID | null`, `createdAt`, `updatedAt`, integer `rowVersion >= 1`. Published pointer belongs to this challenge. |
| `challenge_drafts` | One per challenge: `challengeId`, title, description, language, difficulty, `workingCode`, `flawCount`, `categories`, `generationId: UUID | null`, integer `draftVersion >= 1`. Each edit increments draftVersion. |
| `proposal_sets` | `id`, `challengeId`, `sourceDraftVersion`, immutable input snapshot, validated proposals, `createdAt`. A new generation replaces the draft's active set, not historical sets. |
| `proposal_decisions` | One per active proposal: `proposalId`, `decision: pending | approved | rejected`. Any active-set decision change increments draftVersion. |
| `challenge_revisions` | `id`, `challengeId`, integer `revisionNumber >= 1`, title, description, language, difficulty, `flawedCode`, `publishedAt`. Unique `(challengeId, revisionNumber)`; immutable after publication. |
| `revision_answers` | Unique `revisionId`, `workingCode`, server-derived real diff; immutable after publication. |
| `revision_flaws` | `id`, `revisionId`, `proposalId`, `category`, `originalSnippet`, `replacementSnippet`, `sourceStartLine`, `sourceEndLine`, `startLine`, `endLine`, `explanation`, `fix`. Source and final flawed-code ranges are inclusive. |
| `flaw_hints` | `id`, unique `flawId`, `revisionId`, `text`, generation metadata. Immutable after publication, never a learner-editable cache. |
| `submissions` | `id`, `learnerId`, `challengeId`, `revisionId`, `attemptNumber: 1 | 2`, `previousSubmissionId: UUID | null`, `submittedAt`. Unique `(learnerId, challengeId, attemptNumber)`; immutable content. |
| `submission_comments` | `id`, `submissionId`, `ordinal` (zero-based input order), `line`, `body`. Unique ordinal per submission; immutable. |
| `grading_runs` | `id`, `submissionId`, `state: pending | running | failed | completed`, `failureCode: string | null`, integer `runNumber`, `createdAt`, `finishedAt: timestamp | null`. No provider prompts in role DTOs. At most one active run per submission. |
| `ai_grades` | `id`, unique `submissionId`, `gradingRunId`, deterministic matching result, validated per-match credits/feedback, component totals, `score`, `passed`, `providerOutputRetried`, `createdAt`. Original grade is insert-only. |
| `grade_overrides` | `id`, `submissionId`, `actorId`, server timestamp, server `auditOrder`, `score` (integer 0–100), reason. Append-only, original grade retained. |
| `review_flags` | `id`, `submissionId`, `source: rule | learner`, `kind`, `commentId: UUID | null`, `reason: string | null`, `createdAt`. Kinds and uniqueness are in section 5. |
| `flag_resolutions` | `id`, `flagId`, `actorId`, server timestamp, server `auditOrder`, `disposition: upheld | dismissed`, reason. Append-only; corrections append. |
| `performance_summaries` | `id`, `learnerId`, `requestedBy`, input fingerprint, immutable validated output, `createdAt`. No email, Auth records or unrestricted profile payloads. |
| `ai_usage_records` | Server-derived account and operation IDs, operation kind, reservation/settlement state and usage events under SYS-10/SYS-12. Budget fields and accounting transitions are owned by AI-SECURITY-SPEC, not accepted from role clients. |

`revision_answers` and `revision_flaws` are private answer material under
[SYS-12](TECHNICAL-SPEC.md#sys-12--record-access-and-audit), physically separate
from learner-readable revision fields. Learners cannot read them through server
entry points or direct user-scoped database access.

`auditOrder` is a unique monotonically increasing server-assigned integer within
each submission's audit stream. Allocate it transactionally while serializing
that stream. Latest override/resolution is the entry with largest auditOrder,
including when timestamps tie; clients cannot supply actors, times or order.

Generated proposals, publication hints and TA performance summaries use the
named persistence paths in [SYS-10.3](TECHNICAL-SPEC.md#sys-10--database-enforcement-and-privileged-access).
Direct user writes cannot impersonate server generation.

### SYS-12 decision: immutable published revisions

**Choose versioning.** Editing a published challenge creates/changes its mutable
draft; publishing creates a new immutable revision and atomically moves the live
pointer. This supports AUT-06 maintenance without changing past assessment evidence.
Published revisions, their answer keys and hints are never edited or deleted.

- Initial state is `draft` with no published pointer. A published challenge may
  have an unpublished working draft while its current revision stays discoverable.
- Publish requires a current proposal set, every proposal decided, at least one
  approval, valid assembled code/key and a valid hint for every approved flaw.
  Rejected flaws contribute neither code changes nor answers nor hints. The
  configured flawCount controls proposal generation; the approved count may be smaller.
- Generate hints against the complete approved candidate. Persisting the revision,
  private answers, flaws, all hints and published pointer is one transaction. Failure or a changed
  draftVersion leaves the existing publication intact and creates no partial revision.
  No database transaction is held open during a provider call.
- Any title, description, language, difficulty, working-code or configuration edit
  invalidates the active proposal set and decisions. Rejection/approval changes
  invalidate the assembled candidate and its uncommitted hints. Regeneration needs
  a fresh set of decisions; proposals from different sets cannot be combined.
- Unpublish changes `published` to `unpublished`, retaining its pointer for history.
  It prevents discovery and new attempts. Republishing makes a new revision from
  the current draft. Archive is terminal, hides the catalogue entry and disallows
  edits, publication and new attempts. Neither action deletes drafts or history.
- Submissions pin a revision, not the current pointer. First submission requires
  that the requested revision is the live published revision. A retry pins its first
  attempt's revision, even if a newer revision is live, but the challenge must still
  be published. There are at most two attempts per learner per challenge across
  all revisions. A retry requires the first attempt's completed original grade.
- Publication, lifecycle changes and attempt creation serialize on the challenge
  row so an unpublish/submit race has one committed order. Concurrent edits/publish
  use expected versions and return 409 on conflict. Old revisions remain available
  through authorized submission detail, never through general catalogue access.

### Code, proposals and locations

The shared `CodeDiff` DTO is `{ path, before, after, hunks }`; `after` is always
flawedCode. A hunk is `{ oldStart, oldCount, newStart, newCount, lines }`;
each line is `{ kind: context | added | removed, text,
oldLine: integer | null, newLine: integer | null }`. Context has both line numbers,
added has newLine only, removed has oldLine only; counts and text must reproduce
`before` and `after`. Zero starts/counts are permitted for an empty side. Diff text
is computed by the server, never trusted from an LLM or request.

**Decision: project code by recipient role.** Every Learner projection uses a
new-file diff: `before` is empty and one hunk contains every flawedCode line as
`added`, with `oldLine: null` and consecutive `newLine` values starting at 1.
For N lines under section 1's line convention, the hunk has `oldStart: 0`,
`oldCount: 0`, `newStart: 1`, `newCount: N`; `after` preserves the stored string,
including its trailing LF if present. This applies to live challenge views, own
SubmissionView code (including pinned history) and retries. Authors and TAs
receive the real workingCode-to-flawedCode diff, with `before: workingCode`.
This prevents diff hunks from identifying retained flaws or exposing their fixes.

A proposal replaces an inclusive, full-line range in workingCode. Its
originalSnippet must exactly equal that range joined with LF. ReplacementSnippet
is nonblank source without a trailing LF; deletions of the entire range are not
supported. All proposed ranges are disjoint and within the source. Apply retained
replacements in source order, preserving untouched text and the file's trailing
LF. The final flaw range is the range occupied by its replacement, shifted by
prior retained edits. Server derivation, not model-supplied final line numbers,
defines the answer key. The server also derives each proposal's source range
from originalSnippet, ignoring model-supplied source line numbers: the snippet
must match exactly one run of whole lines in workingCode joined with LF; zero or
multiple matches invalidate the entire result. Comments reference `after` lines
only, including unchanged lines; removed-line comments and client-supplied paths/sides are not accepted.

## 3. API contracts

### Transport, concurrency and errors

The canonical HTTP surface is `/api/v1`. Server Actions, if used by a screen,
invoke the same validated application contracts and preserve failure categories.
All endpoints require a verified session and stored role; the table's role is
necessary but not sufficient: ownership and visibility are checked under SYS-12.
Actor IDs, timestamps, grades, answer keys and lifecycle fields never come from
general-purpose client row updates. Unknown query/body fields fail validation.

Success is `{ data: T }` (201 for creation, otherwise 200). Failure is
`{ error: { code, message, fieldErrors?: { [field: string]: string[] } } }`;
no prompts, submitted code, secrets or database diagnostics appear in errors.
Protected responses use SYS-09 cache prevention. Existing resources outside a
caller's permission return 403; absent resources return 404.

| HTTP | Codes / meaning |
| --- | --- |
| 400 | `VALIDATION_ERROR`, including unknown enum, out-of-file line or malformed JSON |
| 401 / 403 / 503 | `UNAUTHENTICATED` / `FORBIDDEN` / `SERVICE_UNAVAILABLE`, following SYS-11 |
| 404 | `NOT_FOUND` |
| 409 | `VERSION_CONFLICT`, `INVALID_STATE`, `ATTEMPT_LIMIT`, `IDEMPOTENCY_CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 422 | `INVALID_AI_OUTPUT`, schema/semantic rejection after permitted provider retries |
| 429 | `RATE_LIMITED`, including usage limits once specified in AI-SECURITY-SPEC |
| 502 / 504 | `AI_UNAVAILABLE` / `AI_TIMEOUT`; no successful result |

Every POST accepts required `Idempotency-Key` UUID, scoped to actor, method and
resource. A replay with the same canonical validated payload returns the recorded
result and IDs; a different payload returns 409. Concurrent duplicates execute
once. An in-progress duplicate returns 409 `INVALID_STATE` and is safe to replay.
Retain mutation keys with their records; failed operations record failure but do
not permanently prohibit a new explicit attempt with a new key. Keys do not
replace unique submission/grade constraints. PATCH requires expected draftVersion
and rowVersion; lifecycle POSTs require expected rowVersion as specified below.

Lists accept `limit?` and `cursor?` (opaque, at most 512 characters, bound to
filters/order). Default order is createdAt descending, then ID ascending;
catalogue uses publishedAt descending, then challengeId ascending. Invalid or
filter-mismatched cursors return 400. No list returns unbounded rows.

### Shared response types

| DTO | Exact fields |
| --- | --- |
| `ChallengeCard` | `id, revisionId, title, description, language, difficulty, categories: Category[], publishedAt`. Categories are the sorted unique approved categories. |
| `ChallengeView` | ChallengeCard plus `code: CodeDiff` (Learner: new-file; Author/TA: real diff), per [section 2](#code-proposals-and-locations). No separate proposals, answer key, fix text, original annotations or hints. |
| `AuthorDraft` | `id, status, rowVersion, publishedRevisionId, draftVersion, title, description, language, difficulty, workingCode, flawCount, categories, generationId, proposals: ProposalWithDecision[]`. Empty proposals if invalidated. |
| `AuthorChallengeCard` | `id, status, title, language, difficulty, createdAt`. Title, language and difficulty come from the working draft. No description, code, configuration, proposals or answer material. |
| `AuthorPublication` | `id, status, rowVersion, revisionId, revisionNumber, publishedAt`. Detailed own revision access also includes Author-projected CodeDiff under [section 2](#code-proposals-and-locations), private flaws and hints. |
| `Comment` | `id, ordinal, line, body` |
| `SubmissionView` | `id, challengeId, revisionId, learner: { id, displayName }, attemptNumber, previousSubmissionId, submittedAt, challenge: ChallengeView, comments: Comment[], grading: GradingView, flags: FlagView[]`. Nested ChallengeView uses the authenticated recipient's projection per [section 2](#code-proposals-and-locations). No learner email. |
| `GradingView` | `state: pending | running | failed | completed`, `failureCode: string | null`, `original: LearnerGrade | null`, `effective: { score, passed, source: ai | ta } | null`, `overrides: { id, actorId, createdAt, auditOrder, score, reason }[]`. Original/effective are nonnull only on completed grading. |
| `LearnerGrade` | `score, passMark, passed, identificationPoints, explanationPoints, fixPoints, matchedCount, missedCount, unmatchedCommentIds: UUID[], duplicateCommentIds: UUID[], comments: { commentId, matched: boolean, explanationCredit: Credit | null, fixCredit: Credit | null, feedback: string | null }[], eligibleHints: { hintId, category }[]`. No private flaw IDs, locations, explanation or fixes. |
| `FlagView` | `id, submissionId, source, kind, commentId, reason, createdAt, status: open | resolved, resolutions: { id, actorId, createdAt, auditOrder, disposition, reason }[]` |
| `SubmissionCard` | `id, challengeId, revisionId, title, learner: { id, displayName }, attemptNumber, submittedAt, gradingState, effectiveScore: integer | null, openFlagCount` |
| `TaSubmissionView` | SubmissionView with the TA code projection, plus `answerKey: RevisionFlaw[]`, `matching` and per-flaw original assessment records from section 5. |

`RevisionFlaw` has exactly the revision_flaws fields in section 2. `CodeDiff`
is the code/diff DTO in section 2. `Proposal`
is defined in section 4; ProposalWithDecision adds its persisted `id` and decision.
An ungraded attempt has no zero-score placeholder. Learner feedback discusses the
learner's existing comment without disclosing missing flaw locations or fixes;
private rationale is not reused as learner feedback.

### Author surface

Only Authors use these endpoints, always scoped to their own challenge.

| Method and path | Input (JSON unless GET) | Result |
| --- | --- | --- |
| `GET /author/challenges` | Pagination; `status?` | `Page<AuthorChallengeCard>` |
| `POST /author/challenges` | `title, description, language, difficulty, workingCode, flawCount, categories` | 201 AuthorDraft, initial versions 1 |
| `GET /author/challenges/:id` | None | AuthorDraft |
| `PATCH /author/challenges/:id` | `expectedRowVersion, expectedDraftVersion`, at least one of the seven draft fields above | AuthorDraft; metadata/code/config edits invalidate generation |
| `POST /author/challenges/:id/proposals` | `expectedRowVersion, expectedDraftVersion` | AuthorDraft with fresh proposal set; no publication change |
| `PATCH /author/challenges/:id/proposals/:proposalId` | `expectedRowVersion, expectedDraftVersion, decision: approved | rejected` | AuthorDraft; proposal must be in the active set |
| `GET /author/challenges/:id/preview` | None | `{ draftVersion, code: CodeDiff, flaws: RevisionFlawPreview[] }`; 409 if decisions incomplete or none retained |
| `POST /author/challenges/:id/publish` | `expectedRowVersion, expectedDraftVersion` | AuthorPublication; hint generation and atomic publication per section 2 |
| `POST /author/challenges/:id/unpublish` | `expectedRowVersion` | `{ id, status, rowVersion }` |
| `POST /author/challenges/:id/archive` | `expectedRowVersion` | `{ id, status, rowVersion }` |
| `GET /author/challenges/:id/revisions/:revisionId` | None | `{ publication: AuthorPublication, challenge: ChallengeView, answerKey: RevisionFlaw[], hints: { id, flawId, text }[] }` |

RevisionFlawPreview is RevisionFlaw without the not-yet-created `id`/`revisionId`.
All draft mutations increment rowVersion; only draft changes increment draftVersion.
Preview and publication assemble the same retained proposals. Generation/publish
compare versions again after model completion before committing.

### Learner surface

Only Learners use these endpoints. Draft review comments live in client state;
this contract does not create server-side mutable draft submissions.

| Method and path | Input | Result |
| --- | --- | --- |
| `GET /challenges` | Pagination; `language?`, `difficulty?`, `category?` | `Page<ChallengeCard>`; only live published revisions; filters combine with AND |
| `GET /challenges/:id` | None | ChallengeView for live revision |
| `POST /challenges/:id/submissions` | `revisionId, comments: { line, body }[], previousSubmissionId?: UUID` | 201 SubmissionView with pending grade; first attempt omits previous ID, retry names owned completed first attempt |
| `POST /submissions/:id/grade` | Empty object | GradingView; run grading or return existing completed grade; failed run may be retried without a new learner attempt |
| `GET /submissions` | Pagination; `challengeId?` | `Page<SubmissionCard>` for self |
| `GET /submissions/:id` | None | Own SubmissionView, including pinned historical challenge |
| `GET /submissions/:id/hints/:hintId` | None | `{ hintId, category, text }`; completed original grade and missed flaw required, bound to exact submission/revision |
| `POST /submissions/:id/reports` | `commentId, reason` | 201 FlagView; only an unmatched comment in own completed submission |

Comment IDs, ordinals and attempt numbers are assigned by the server. Duplicate
same-line comments are allowed within the cap. Both attempts retain independent
comments and grades; retry does not edit the first. A stale first-attempt
revision returns 409, with no automatic switch to different code.

### TA surface

Only TAs use these endpoints within SYS-12 moderation scope. They cannot create
or edit challenges/submissions or call Author endpoints.

| Method and path | Input | Result |
| --- | --- | --- |
| `GET /ta/submissions` | Pagination; `learnerId?`, `challengeId?`, `gradingState?` | `Page<SubmissionCard>` |
| `GET /ta/submissions/:id` | None | TaSubmissionView |
| `GET /ta/flags` | Pagination; `status?: open | resolved`, `kind?`; default open | `Page<FlagView>` |
| `POST /ta/submissions/:id/overrides` | `score: integer 0–100, reason` | 201 `{ override, grading: GradingView }`; requires completed grade |
| `POST /ta/flags/:id/resolutions` | `disposition: upheld | dismissed, reason` | 201 FlagView; resolving again appends a correction |
| `GET /ta/learners` | Pagination | `Page<{ id, displayName }>`; Learners only |
| `GET /ta/learners/:id/progress` | None | CategoryProgress from section 5 |
| `GET /ta/learners/:id/recommendations` | `limit?`, integer 1–10, default 5 | `{ items: { challenge: ChallengeCard, targetCategories: Category[] }[] }` |
| `GET /ta/learners/:id/summary` | None | `{ summary: SummaryRecord | null, stale: boolean }` |
| `POST /ta/learners/:id/summaries` | Empty object | 201 SummaryRecord; 409 if no completed submissions |

SummaryRecord is `{ id, learnerId, createdAt, inputFingerprint, output: SummaryOutput }`.
An override changes effective score/pass status immediately; it never rewrites
AI credits, matching evidence or hints. A flag resolution never implies an
override. No role endpoint accepts row deletion or replacement of audit history.

## 4. Server-only LLM contracts

All operations cross `src/server/llm/` under SYS-03. Every envelope has required
shape `{ schemaVersion: 1, operation, payload }`, with the operation discriminator
and payload defined below; input and output use separate
strict schemas. No model assigns trusted actors, timestamps, published IDs,
scores, pass/fail outcomes, flag dispositions or database permissions. Source,
comments and other user/AI text are data under SYS-02, never instructions.
Fake and live adapters obey the same schemas. A call's result is accepted only
against the server's captured input snapshot. Provider metadata is recorded
separately, never interpolated into role-visible feedback.

### Flaw injection: `operation: inject_flaws`

Input payload: `{ language, difficulty, workingCode, flawCount, categories }`.
Output payload: `{ proposals: Proposal[] }`, exactly flawCount elements.

`Proposal = { key: string, category: Category, sourceStartLine: integer,
sourceEndLine: integer, originalSnippet: string, replacementSnippet: string,
explanation: Text(2000), fix: Text(2000) }`.

Keys are unique within the result, ASCII `[a-z0-9_-]{1,40}`. Each category belongs
to the requested categories; source ranges/snippets and candidate size satisfy
section 2. Every snippet is at most the code cap. The output proposes code and
answer together; the server assigns proposal IDs. An invalid or overlapping
proposal invalidates the entire result; there is no partial accepted set.

### Publication hints: `operation: generate_hints`

Input payload: `{ language, difficulty, flawedCode, flaws: { key, category,
startLine, endLine, explanation, fix }[] }`, containing only retained flaws.
Output payload: `{ hints: { key, text: Text(500) }[] }`, exactly one unique key
per input flaw and no extras. This generates the whole publication's cache once,
never per learner. Text must avoid exact locations, identifying snippets and
fixes, per PRODUCT-SPEC. Schema validation alone cannot establish that semantic
condition; AI-SECURITY-SPEC owns its enforcement. Hints that fail it cannot publish.

### Matched-comment assessment: `operation: assess_review`

Input payload: `{ language, flawedCode, matches: { key, category, startLine,
endLine, explanation, fix, comment: { id, line, body } }[] }`. Keys are private
flaw IDs. Only deterministically selected matched comments are sent, never
unmatched/duplicate comments or learner emails. Output payload:
`{ assessments: { key, commentId, explanationCredit: Credit, fixCredit: Credit,
feedback: Text(2000) }[] }`, exactly one pair for each input match, no extras.
Feedback meets the learner-safe rule in section 3. The model cannot alter
identification or match a different comment. With no matches the server produces
the grade without calling the provider. Failure leaves no original grade;
retry operates on the identical pinned submission and key.

Assess `explanationCredit` and `fixCredit` independently against the matched flaw.

- `explanationCredit` is `1` if the comment states what goes wrong and its
  consequence, `0.5` if it names the right problem but leaves the consequence
  vague or partly wrong, and `0` if it gives no explanation or does not describe
  the matched flaw's problem. A correct point about a different problem earns
  zero explanation credit.
- `fixCredit` is `1` for an actionable change that would correct the flaw,
  `0.5` for a change that points in the right direction but is incomplete or
  unspecific, and `0` if the comment gives no fix or proposes a change that
  would not correct the flaw.

### TA performance summary: `operation: summarize_learner`

Input payload: `{ submissions: { submissionId, revisionId, attemptNumber,
submittedAt, originalScore, effectiveScore, categories: { category, totalFlaws,
identifiedFlaws }[], comments: { commentId, body, feedback: string | null }[] }[],
progress: CategoryProgress }`. Use the learner's latest 20 completed submissions
by submittedAt descending, ID ascending; progress uses all eligible first attempts.
The snapshot fingerprint covers selected evidence, effective overrides and progress.
Do not send learner name/email, other learners, whole Auth/profile records or
private answer explanations/fixes. Summary input is built from authorized data,
not from caller-supplied learner evidence.

`SummaryOutput = { strengths: SummaryItem[], blindSpots: SummaryItem[],
nextSteps: SummaryItem[] }`, with 0–5 elements per array and at least one item
overall. `SummaryItem = { category: Category, text: Text(2000),
submissionIds: UUID[] }`; evidence contains 1–20 unique IDs, all in the input,
and its category must occur in those submissions. SummaryRecord is stale exactly
when its input fingerprint no longer matches a freshly selected snapshot.

## 5. Deterministic grading, moderation and progress

### Matching and score

For each comment/flaw pair on the pinned flawedCode, distance is zero inside
the flaw's inclusive final range, otherwise the distance to its nearest endpoint.
A pair is eligible when distance is **at most one line**. Sort eligible pairs by
distance ascending, comment ordinal ascending, then flaw startLine ascending,
then flaw ID ascending. Greedily select pairs whose comment and flaw are both
unassigned. One comment counts for at most one flaw and vice versa. An unselected
comment with any eligible pair is a duplicate; one with none is unmatched.
Unassigned flaws are missed. These rules also resolve adjacent/ambiguous ranges.

The persisted/private `matching` shape is `{ matches: { flawId, commentId,
distance }[], missedFlawIds: UUID[], unmatchedCommentIds: UUID[],
duplicateCommentIds: UUID[] }`. Matches and missed flaws use final startLine/ID
order; comment ID lists use comment ordinal order. Private per-flaw assessments
are `{ flawId, commentId: UUID | null, explanationCredit: Credit,
fixCredit: Credit, feedback: string | null }[]`, one per retained flaw in that
same order. Missed flaws have null commentId/feedback and zero credits. The
LearnerGrade comment list covers every comment in ordinal order; unselected
comments have matched false, null credits and null feedback. eligibleHints are
the missed flaws' cached hint IDs/categories in final startLine/ID order.

Let F be retained flaw count, M selected matches, U unmatched comments; duplicates
earn no points and incur no penalty. Missing flaws receive zero explanation/fix
credit. Let E and X be the sums of explanation and fix credits of selected pairs.

- Identification points = `50 × max(0, (M − U) / F)`.
- Explanation points = `30 × E / F`; fix points = `20 × X / F`.
- Score = `floor(identificationPoints + explanationPoints + fixPoints + 0.5)`.
  Retain unrounded component values for computation, expose components rounded
  to two decimals, and never sum display-rounded values to obtain the score.
- Pass mark = **60**; passed is `score >= 60`. No partial-credit threshold changes
  identification. Unavailable/failed assessment is not a completed zero grade.
- Persist the original grade and its rule flags atomically, once per submission.
  Retry/replay cannot create another original. Effective score is the latest
  override score, otherwise original score; effective passed uses the same mark.

### Flags

| Kind | Creation rule |
| --- | --- |
| `near_pass_mark` | Original rounded score is 55–65 inclusive, once per submission. |
| `grading_output_retried` | Successful grading required a repeat provider request after invalid output, once per submission. Transport-only retry does not satisfy this rule. Retry counts/limits remain in AI-SECURITY-SPEC. |
| `assessment_disagreement` | A selected location match receives both explanationCredit 0 and fixCredit 0, once per submission, with matched comment IDs in private matching evidence. |
| `learner_report` | Owner reports an unmatched comment after completed grading, once per `(submissionId, commentId)`, with nonblank reason. |

Rule flags have source rule, null commentId and null reason; learner reports have
source learner, the reported commentId and supplied reason. Idempotent replays
return the same flag; another report for that same pair returns 409. A flag is
open until its first resolution, then resolved with the latest disposition.
Score overrides do not remove or regenerate original rule flags. A learner report
does not silently add a flaw to a published key or trigger regrading other attempts.

### Category progress and recommendations

`CategoryProgress = { learnerId, categories: { category, totalFlaws,
identifiedFlaws, identificationRate: number | null, completedFirstAttempts }[] }`.
Return all five categories in the enum order of section 1. Include only completed
first attempts, across all history including unpublished/archived challenges.
For a category sum original key flaws and selected identified flaws; rate is
identifiedFlaws / totalFlaws rounded to four decimals, or null if denominator zero.
completedFirstAttempts counts distinct eligible submissions containing that category.
Retries and score-only TA overrides do not change this identification evidence;
effective scores in history/summary still reflect overrides.

Select up to two weakest observed categories by unrounded rate ascending,
totalFlaws descending, then enum order. Unobserved categories are not inferred
weaknesses. Candidate recommendations are live published challenges in at least
one selected category with no attempt by this learner on any revision. Sort by
number of selected categories covered descending, difficulty easy/medium/hard,
then challenge ID ascending. targetCategories contains their intersection in enum
order. If there are no observed categories or eligible candidates, return `[]`.

## 6. Shared deterministic seed fixtures

These are normative fake-provider/local-development fixtures, not hosted data or
already-installed seed records. Implementations of seeds, UI mocks and integration
tests use these same IDs and values. Do not run pasted snippets or make live LLM
calls to generate fixture results. Auth fixtures use local test identities through
the normal SYS-06 provisioning path; credentials are test-harness configuration,
not domain records. Add a second user per role for the SYS-12 denial matrix.

For compactness, the table defines IDs by suffix: prefix every suffix below with
`00000000-0000-4000-8000-` to obtain its full UUID. All seeded creation times are
`2026-01-01T00:00:00Z`; later events advance by one second in the order stated.

| Suffix | Record |
| --- | --- |
| `000000000001` / `000000000002` | Authors, display names Author A / Author B |
| `000000000011` / `000000000012` | Learners, display names Learner A / Learner B |
| `000000000021` / `000000000022` | TAs, display names TA A / TA B |
| `000000000101` / `000000000201` | Challenge C1 / revision C1-R1, owned by Author A |
| `000000000102` / `000000000202` | Challenge C2 / revision C2-R1, owned by Author B |
| `000000000301` / `000000000302` | C1 flaws F1 / F2 |
| `000000000303` | C2 flaw F3 |
| `000000000401` / `000000000402` / `000000000403` | Cached hints H1 / H2 / H3 |
| `000000000501` / `000000000502` / `000000000503` | Submissions S1 / S2 / S3 |
| `000000000601` / `000000000602` | S1 comments Q1 / Q2 |
| `000000000603` / `000000000604` | S2 comments Q3 / Q4 |
| `000000000605` / `000000000606` | S3 comments Q5 / Q6 |
| `000000000701` / `000000000702` | S1 / S3 original grades |
| `000000000703` | S2 original grade |
| `000000000801` | S1 learner-report flag |
| `000000000802` / `000000000803` | S3 near-pass / disagreement flags |
| `000000000901` / `000000000902` | S1 override / report resolution |

### C1: Checkout totals

Published JavaScript/Easy challenge, title “Checkout totals”, description
“Review the changes to discounts and basket totals.” Approved categories are
logic_bug and edge_case. Both code strings below end in LF; displayed fence
line numbers are the source line numbers, starting at 1.

Working code:

```javascript
function discounted(price, percent) {
  const fraction = percent / 100;
  return price * (1 - fraction);
}

// Basket totals use whole currency units.

function basketTotal(items) {
  const prices = items.map(item => item.price);
  return prices.reduce((sum, price) => sum + price, 0);
}
```

Retain two proposals, each replacing only its named source line:

| Flaw | Category / range | Original snippet → replacement snippet | Private explanation / fix | Cached hint |
| --- | --- | --- | --- | --- |
| F1 | logic_bug, source/final line 3 | `  return price * (1 - fraction);` → `  return price * fraction;` | Returns the discount amount instead of the payable price. / Multiply price by one minus fraction. | H1: “Consider what the returned value represents at the extremes of a discount.” |
| F2 | edge_case, source/final line 10 | `  return prices.reduce((sum, price) => sum + price, 0);` → `  return prices.reduce((sum, price) => sum + price);` | An empty basket causes reduce to throw. / Supply zero as the initial accumulator. | H2: “Consider the smallest possible basket.” |

The C1 flawedCode is exactly workingCode with these two substitutions and no
other changes; the Author/TA diff has removed/added pairs at lines 3 and 10.
Learner code follows [section 2](#code-proposals-and-locations), for C1 and C2.
This derivation defines the full fixture string without a second independently
maintained copy.

### C2: Safe quotient

Published Python/Medium challenge, title “Safe quotient”, description
“Review the changes to the quotient helper.” One error_handling flaw F3, source
range 2–4. Working code ends in LF:

```python
def quotient(a, b):
    if b == 0:
        raise ValueError("zero divisor")
    return a / b
```

Replace lines 2–4 with `    try:\n        return a / b\n    except Exception:\n        return 0`
(the `\n` notation denotes actual LF characters in the stored snippet).
F3 final range is **2–5**, since the replacement has four lines. Private
explanation: “A broad exception handler silently turns failures into success.”
Fix: “Validate zero explicitly and let unexpected exceptions propagate.”
H3: “Consider whether callers can distinguish success from failure.”
The configured count is 1 and the category selection is `[error_handling]`.

### Submissions and expected outcomes

All submissions pin C1-R1 and have completed grading. Assessments listed below
are the fake provider's exact credit pairs `(explanationCredit, fixCredit)`;
its feedback for `(1,1)` is “The consequence and proposed fix are clear.”,
for `(0,1)` is “Explain why the behavior is incorrect.”, and for `(0,0)` is
“Explain the consequence and propose an actionable change.”

| Submission | Learner / attempt | Ordered comments and fake assessment | Original result |
| --- | --- | --- | --- |
| S1 | Learner A / 1 | Q1 line 3: “This returns the discount rather than the payable amount; multiply by one minus fraction.” → F1 `(1,1)`. Q2 line 6: “Whole currency units may discard cents; document the rounding policy.” → unmatched. | M=1, U=1, F=2; components 0/15/10, score 25, fail; H2 eligible only. |
| S2 | Learner A / 2, previous=S1 | Q3 line 3, same body as Q1 → F1 `(1,1)`. Q4 line 10: “An empty basket makes reduce throw; pass zero as the initial accumulator.” → F2 `(1,1)`. | Components 50/30/20, score 100, pass; no eligible hints. |
| S3 | Learner B / 1 | Q5 line 3: “Multiply by one minus fraction.” → F1 `(0,1)`. Q6 line 10: “This seems suspicious.” → F2 `(0,0)`. | Components 50/0/10, score 60, pass; near_pass_mark and assessment_disagreement flags; no eligible hints. |

After S1 grades, Learner A reports Q2 with reason “Rounding is unspecified for
fractional prices.” This creates flag `801`. After S2 and S3 grade, TA A appends
S1 override `901`, score 70, reason “The additional currency concern merits
credit.”, then resolution `902` for flag `801`, disposition upheld, reason
“The rounding requirement is ambiguous.” The override has auditOrder 1 and the
resolution 2. S1 effective score is 70/pass while original remains 25/fail.
Flags `802`/`803` stay open. No fixture needed a grading-output retry.

Expected cross-role observations:

- Authors see their own publication/key/hints, never S1–S3 or their grades.
- Learner A sees S1/S2 and their audit history, cannot see S3, and can request H2
  only through S1. Learner B sees S3, cannot request H1/H2 through it.
- Both TAs see all three submissions, private evidence and flags, without emails.
- Learner A progress is logic_bug 1/1 and edge_case 0/1; Learner B progress is
  1/1 for both. All other rates are null. S2 and override 901 do not change these
  counts. Recommendations are empty: C1 is attempted and C2 covers neither
  learner's observed categories.
- A valid Learner A summary example has an empty strengths array, one blindSpots
  item `{ category: edge_case, text: "The first review missed an empty-input case.",
  submissionIds: [S1] }`, and one nextSteps item `{ category: edge_case,
  text: "Check empty collections during the first review.", submissionIds: [S1] }`.
  Expand S1 to its full UUID in JSON; a summary containing S3 evidence is invalid
  for Learner A.

### Derived fixture scenarios

Each scenario starts independently from the base fixtures, preserving their IDs.
Additional IDs are stable within the test harness and cannot collide with base IDs.

| Scenario | Required expected outcome |
| --- | --- |
| Author A edits C1 after publication | Draft versions advance; catalogue and S1–S3 still show R1 until successful publication. |
| Publish C1-R2 with changed code/key | New revision/key/hint IDs; live pointer R2; S1–S3 and their grades/hints remain pinned to R1. |
| Unpublish or archive C1 | Catalogue and new first/retry attempts deny access; existing learner/TA submission detail still works. |
| One hint fails, output exceeds size cap, or draft changes during generation | No partial revision, pointer change or successful AI result. |
| Invalid, oversized or extra request fields | No writes/provider calls; cap boundaries follow section 1. |
| Duplicate submit/grade and concurrent override/resolution | One attempt/original grade; both audit appends retained with deterministic ordering. |
| No comments, duplicate eligible comments, tolerance edges, equal-distance matches | Formula and tie-breakers from section 5 apply; no model-based identification. |
| One invalid assessment followed by valid output within allowed retries | One original grade plus one grading_output_retried flag. |
| Java/TypeScript drafts with no proposals | Valid language/filter mocks, empty preview/publish denied; no invented fallback answer key. |

## 7. Integration verification

Role implementations share these DTOs, enum encodings, normalized source strings
and fixture identities; they must not introduce role-local equivalents. Contract
tests validate strict shapes, bounds, derived line shifts, exact assessment keys
and summary evidence. Database tests enforce cross-record ownership, pinned
revisions, attempt limits, original-grade uniqueness, all-or-nothing publication
and append-only audit behavior. Exercise the SYS-12 two-user-per-role matrix
through server endpoints and direct user-scoped database access, including private
column/join projections, historical reads and forged IDs/actors/times.

Verify [section 2's code projections](#code-proposals-and-locations) in live
Learner challenge responses, own SubmissionView responses (including pinned
history after edits/unpublishing/archiving) and retries. Assert no workingCode
or real diff is exposed; the empty-before, single all-added hunk reproduces
flawedCode exactly with valid counts and line numbers, including trailing-LF
and no-trailing-LF cases. Direct Learner reads, including columns, joins and
historical revisions, cannot expose workingCode or the real diff. Author and
TA responses retain the real diff. Comment lines still address flawedCode;
matching and scoring outcomes remain unchanged.

Fake-provider integration connects Author publication → Learner submission and
grading → TA override/resolution → Learner history using section 6. Rejection
tests include missing hints, stale versions, malformed/extra provider fields,
provider failure, unchanged history after editing/unpublishing/archiving, no
premature or cross-submission hints, and no email or private-answer leakage.
Security-specific semantic controls and retry/usage exhaustion tests additionally
depend on AI-SECURITY-SPEC; this specification does not authorize live calls.
