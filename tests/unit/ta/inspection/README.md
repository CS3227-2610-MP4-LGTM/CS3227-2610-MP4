# T-30 acceptance test contract (G2)

No runtime behavior is implemented here. Missing modules below are intentional
failing-first interfaces, matching the existing learner suite's read/component
separation. Fake providers only; the fixture uses loopback-validated localHarness
and the domain insert helper. Browser tests run through the production-build
Playwright server. Specialists do not start database-backed suites.

## Interfaces defined by tests

- `src/server/ta/validation.ts`:
  - `parseSubmissionQuery(search: URLSearchParams)` returns validated filters
    `learnerId?`, `challengeId?`, `gradingState?`, numeric `limit` (default 20,
    inclusive 1–50), and decoded `anchor?: { submittedAt: string; id: string }`.
    Throws for invalid/duplicate/unknown fields and invalid or filter-mismatched
    cursors. It validates strict UUIDs and states, and a cursor cap of 512.
  - `encodeSubmissionCursor(anchor: { submittedAt: string; id: string }, filters:
    { learnerId?: string; challengeId?: string; gradingState?:
    'pending' | 'running' | 'failed' | 'completed' }): string`.
- `src/server/ta/submissions.ts`:
  - `readSubmissionPage(search: URLSearchParams): Promise<
    { status: 'ok'; page: Page<SubmissionCard> } | ReadFailure>`.
  - `readSubmission(id: string): Promise<
    { status: 'ok'; submission: TaSubmissionView } | ReadFailure>`.
  - ReadFailure categories exercised: `invalid`, `not_found`, `unavailable`,
    `unauthenticated`, `role_denied`, `account_unavailable`,
    `account_service_unavailable`; shared account recovery categories preserve
    the existing workspace foundation's distinction from record failures.
  - TaSubmissionView private per-flaw records are named `assessments`, since the
    spec defines their shape but does not name that field. Its `matching`,
    answer key and all remaining fields follow INTEGRATION-SPEC exactly.
- `src/app/api/v1/ta/submissions/route.ts`: `GET(request: Request): Promise<Response>`.
- `src/app/api/v1/ta/submissions/[id]/route.ts`: `GET(request: Request, context:
  { params: Promise<{ id: string }> }): Promise<Response>`.
  Both follow canonical `{data}`/`{error}` envelopes and private/no-store
  headers. Detail rejects unknown query fields. GET causes no grading/moderation.
- `src/components/ta/submission-list.tsx`: `SubmissionList({ search: string,
  readPage: (search: string) => Promise<ListResult>, navigate: (href: string) =>
  void })`. ListResult has the read contract above. `search` omits leading `?`.
- `src/components/ta/submission-detail.tsx`: `SubmissionDetail({ submissionId:
  string, search: string, readSubmission: (id: string) => Promise<DetailResult> })`.
  DetailResult has the read contract above. It composes existing `CodeDiffView`.
  Original assessment and Current grade are separately labelled regions.
- Return URL context defined by tests: `from=flags`, or
  `from=learner&learnerId=<UUID matching the submission learner>`. Unrecognized,
  external and mismatched contexts expose only Back to submissions. These query
  fields belong to the page; they are not forwarded to the detail data endpoint.

## Criterion map

Every test title starts with its criterion ID. Paths relative to this directory
unless otherwise specified.

| Criterion | Evidence |
| --- | --- |
| TA-01.1 | list.test.tsx separate attempts, metadata/links and empty state; integration reads strict cards for both TAs; browser navigation |
| TA-01.2 | validation.test.ts; list.test.tsx atomic Apply, cursor reset, errors, URL change, clear, filtered empty and stale completion; browser URL reload/back |
| TA-01.3 | validation.test.ts cursor bound/filter binding; list.test.tsx pending, controls, next/first, retry and invalid cursor; integration stable ordering/paging; browser failure recovery |
| TA-01.4 | detail.test.tsx shared real-diff renderer, ordered comments, answers, empty review, read-only and inert content; integration exact pinned DTO; browser source/return links |
| TA-01.5 | detail.test.tsx labelled original/current, Not assessed, duplicate/unmatched/missed; integration exact S1 credits/matching, override/resolution DTO fields and derived duplicate |
| TA-01.6 | list/detail state parameterization, completed zero and explicit refresh; integration unchanged stored runs on reread; browser GET-only refresh |
| TA-01.7 | detail.test.tsx loading/error/retry/not found; read-failures.test.ts account errors; integration direct-entry denials; browser account recovery and transition |
| TA-01.8 | detail.test.tsx validated return context; integration draft/R2/unpublish/archive equality and learner retained access; browser context links |
| SYS-02.1–2 | validation.test.ts malformed/oversized/unknown/duplicate inputs; no-query validation in read-failures.test.ts; inert UI payloads in detail.test.tsx |
| SYS-04.1–2 | read-failures.test.ts uses shared getAccount policy; detail.test.tsx invokes actual shared CodeDiffView with TA real diff |
| SYS-08.2–3 | integration reads.test.ts two users per role + anonymous through both handlers and direct application reads |
| SYS-09.2–3 | no-store assertions; browser prefetch/sign-out/switch/reload/back; source review still required to reject cache directives |
| SYS-11.1–4 | read-failures.test.ts all account categories; browser post-entry recovery without replay |
| SYS-12.1–2, .4 | integration role/RLS/columns/joins, strict no-email DTOs and historical equality |
| SYS-17.1, .3 | unit labels/error association/live states; browser keyboard focus and 320px overflow |
| SYS-19 | unit, local real Auth/RLS integration and production-server browser suites; CI ownership stays with existing workflow |

Review/build evidence still required: SYS-09.1 Suspense/static shell production
build; SYS-09.2 no cache scopes; SYS-17.2 measured contrast. Browser and database
checks must be reported separately by the orchestrator. T-31 detailed override and
flag forms/history presentation and T-32 learner destination are outside T-30;
these tests cover retained DTO fields and navigable composition links only.
