# T-31 acceptance test contract (G2)

These tests intentionally precede implementation. No runtime code, dependencies,
configuration, handoff or commits are changed. Existing T-30 local Auth/inspection
fixtures and suite inclusion are reused. No environment files or live providers
are used. New modules below are intentional missing-interface red evidence.

## Interfaces defined by tests

Existing types are `TaSubmissionView`, `ReadFailure`, and its nested grading/flag
DTOs from `src/lib/ta/submissions.ts`. The original evidence fixture is parsed
through the existing schema before passing it to the new component.

- `src/server/ta/moderation-validation.ts`:
  - `parseOverride(input: unknown): { score: number; reason: string }`.
  - `parseResolution(input: unknown): { disposition: 'upheld' | 'dismissed'; reason: string }`.
  - Both throw on strict validation failure, trim reasons, count Unicode code
    points, and accept 1–2000 code points after trimming. Scores are numeric
    integers in 0–100; actor/time/order/IDs are never accepted in the body.
  - `parseFlagQuery(search: URLSearchParams): { status: 'open' | 'resolved';
    kind?: FlagKind; limit: number; anchor?: { createdAt: string; id: string } }`.
    FlagKind is the four spec encodings. Default status=open/limit=20; limit
    1–50. Reject duplicate/unknown fields and malformed/filter-bound cursor reuse.
  - `encodeFlagCursor(anchor: { createdAt: string; id: string }, filters:
    { status: 'open' | 'resolved'; kind?: FlagKind }): string`. Bounded opaque
    cursor, descending createdAt and ascending ID anchor, at most 512 chars.
- `src/server/ta/moderation.ts`:
  - `readFlagPage(search: URLSearchParams): Promise<{ status: 'ok'; page:
    { items: FlagView[]; nextCursor: string | null } } | ReadFailure>`.
  - `appendOverride(id: string, payload: unknown, idempotencyKey: string):
    Promise<{ status: 'ok'; override: GradingView['overrides'][number];
    grading: GradingView } | MutationFailure>`.
  - `appendResolution(id: string, payload: unknown, idempotencyKey: string):
    Promise<{ status: 'ok'; flag: FlagView } | MutationFailure>`.
  - MutationFailure is ReadFailure plus `invalid_state`, `conflict` (stale flag),
    and `idempotency_conflict`. Preserve workspace account categories:
    unauthenticated, role_denied, account_unavailable, account_service_unavailable.
    Each call rechecks identity, stored role and record permission.
- `src/app/api/v1/ta/flags/route.ts`: `GET(request: Request): Promise<Response>`.
- `src/app/api/v1/ta/submissions/[id]/overrides/route.ts` and
  `src/app/api/v1/ta/flags/[id]/resolutions/route.ts`: `POST(request: Request,
  context: { params: Promise<{ id: string }> }): Promise<Response>`.
  Apply canonical strict bodies, Idempotency-Key UUID, same-origin checking,
  no-store headers, `{data}`/`{error}` envelopes and documented status codes.
  Creation returns 201. Idempotent success replay returns the recorded 201 data.
- User-scoped database append functions (no admin-client permission):
  - `public.append_ta_override(p_id uuid, p_payload jsonb, p_key uuid) returns jsonb`.
  - `public.append_ta_resolution(p_id uuid, p_payload jsonb, p_key uuid) returns jsonb`.
  - Results use the corresponding application status/data shape above;
    denied authenticated callers return `{status:'forbidden'}` or a database
    permission error; anon may lack execute. Invalid payloads return
    `{status:'invalid'}` or constraint/permission errors. Missing completed grade
    returns `{status:'invalid_state'}`. Derive actor from authenticated claims,
    server time/order and serialize the submission-wide audit stream atomically.
    Concurrent duplicate calls may return the same success or invalid_state;
    subsequent replay returns the recorded successful result.
  - Concurrency tests use separate connected PostgreSQL clients, each with its
    own real authenticated identity, transaction and commit. They do not use an
    enclosing rollback transaction or a global mutable route-client mock.
    Timestamp ties are deliberately seeded after commits with privileged local
    fixture writes; both histories and effective projection must use auditOrder.
  - Storage for retained mutation keys is deliberately not prescribed. Ensure
    fixture-owned records/keys clean up when the fixture identities/resources are
    deleted; if the new private key store needs explicit teardown, extend only
    the T-31 test teardown accordingly. T-30's shared fixture is unchanged.
- `src/lib/grading/effective-grade.ts`:
  `projectEffectiveGrade(originalScore: number | null, overrides:
  readonly { score: number; auditOrder: number }[]):
  { score: number; passed: boolean; source: 'ai' | 'ta' } | null`.
  Pure shared projection, maximum auditOrder wins, pass mark 60, no mutation.
  Null original remains null. Use this shared projection in TA and owning-Learner
  reads; the integration test feeds real learner-authorized stored rows through
  it and compares against TA response. Learner pages remain out of scope.
- `src/components/ta/flag-queue.tsx`: `FlagQueue({ search: string,
  readPage: (search: string) => Promise<FlagPageResult>, navigate: (href: string)
  => void })`. search omits '?'. Same URL/read separation as T-30's list.
- `src/components/ta/moderation-panel.tsx`: `ModerationPanel({ submission:
  TaSubmissionView, selectedFlagId?: string, saveOverride: (id: string, payload:
  { score: number; reason: string }, key: string) => Promise<OverrideResult>,
  saveResolution: (id: string, payload: { disposition: 'upheld' | 'dismissed';
  reason: string }, key: string) => Promise<ResolutionResult>, refresh:
  () => Promise<DetailResult> })`. The result aliases correspond to server
  contracts above. Compose this panel into T-30 detail, keeping original/current
  grade visible and histories/flag context labelled. Reject stale response
  regressions by server auditOrder. Forms hold a key for uncertain retries;
  editing a failed payload starts a new explicit action with a new key.
- Page context: queue links `/ta/submissions/:id?from=flags&flagId=:flagId`.
  Extend T-30's validated return context to permit the single UUID `flagId`
  selection while preserving safe return navigation. Flag existence belongs to
  the selected submission; missing selection shows Flag not found. No external
  redirect or automatic write is authorized by page context.

## Criterion map

All test titles begin with criterion IDs. Unit paths below are in this folder;
`integration` means tests/integration/ta/moderation/writes.test.ts; `browser`
means tests/e2e/ta/moderation/journeys.spec.ts.

| Criterion | Evidence |
| --- | --- |
| TA-02.1 | queue distinct entries/metadata/times/links/default empty; integration default open and distinct kinds; browser navigation |
| TA-02.2 | validation filters/kinds; queue exact labels/full inert report/URL apply; integration rule nulls + learner comment ID; browser selected-flag detail |
| TA-02.3 | validation cursor/bounds; queue pending/disabled/retry/invalid/empty/first/next/stale response/URL change; integration bounded pages/filter binding; browser reload/back/failure |
| TA-02.4 | forms every history entry/oldest audit order/timestamp ties/inert reasons/verified actors/no edit-delete/awaiting/no flags; integration shared audit races; browser history |
| TA-02.5 | validation disposition/reason/Unicode bound/strict extras; forms placeholder/required/error associations/focus/draft/cancel/pending; browser keyboard resolve |
| TA-02.6 | forms open save + correction/no grade change/other awaiting; integration selected flag only and preserved grades/key/hints; browser open queue removal/resolved discovery |
| TA-02.7 | forms uncertain retry same key/new explicit action/conflict refresh/no replay; integration both concurrent decisions/duplicate race/replay/conflict; browser lost response |
| TA-02.8 | forms absent flag/back link; access categories; integration role/ID denial + historical archive/unpublish; browser access/session recovery without replay |
| TA-03.1 | forms original/current/guidance/empty explicit inputs/cancel; browser cancel/focus/reopen |
| TA-03.2 | validation integer/type/bounds/reason/Unicode; forms associated errors/draft/focus; integration strict HTTP + direct DB validation; browser keyboard |
| TA-03.3 | forms saving/disable/returned grading only/no optimistic unsaved score; projection boundaries; integration originals/comments/credits/matching/hints/other attempt unchanged + learner projection; browser current vs original/focus |
| TA-03.4 | forms full ordered/inert attributable history/empty state/same score; integration same-score appends + timestamp tie; browser history |
| TA-03.5 | forms all incomplete states and rejected in-flight refresh with retained draft; integration HTTP and DB invalid_state without original creation; projection null original |
| TA-03.6 | forms retries/refresh and older response after newer refreshed audit; projection maximum auditOrder; integration distinct/duplicate races/replay/conflict; browser lost-response recovery |
| TA-03.7 | integration unchanged flags/key/evidence/other attempts and historical R2/edit/unpublish/archive |
| TA-03.8 | validation forged actor/time/order; access no query/write fallback; integration direct boundary/forged DB writes; browser session/role failures/no false success/no recovery replay |
| SYS-02.1–2 | validation strict malformed/missing/oversized/type/extra inputs; access malformed raw JSON; inert queue/history/browser script reasons; no provider/admin mocks |
| SYS-08.2–3 | access application + every handler; integration two users per role + anon, varying IDs and constrained direct DB entry |
| SYS-09 | access repeated account checks + no-store responses; stale queue/grade completion; browser sign-out/account switch/reload/back/prefetch baseline in T-30; production shell/cache review below |
| SYS-10.1–2, .4 | integration RLS + forged raw insert/update/delete and user-scoped append matrix; admin mock throws for human moderation |
| SYS-11 | access 401/403/503/missing profile/outage role categories with zero queries; browser removes evidence and no replay |
| SYS-12.1–5 | integration all relevant role reads/writes, no emails, retained histories, immutable originals, shared audit concurrency/forgery, private learner key denial/historical scope |
| SYS-16.2 | access + integration untrusted Origin denied before writes; validated page-return context extends existing T-30 tests |
| SYS-17.1, .3 | forms associated errors/first invalid focus/live states; browser visible keyboard focus, cancel/save focus, 320px overflow/history/actions |
| SYS-19 | unit, real local Auth/RLS/committed DB and production-build browser suites, using existing configs; CI/settings review below |

Explicit review/build evidence still required at implementation/review: SYS-09.1
Suspense and no protected data in prerendered shell; SYS-09.2 no protected cache
scopes; shared projection usage in each owning-Learner/TA server read (the tests
exercise the pure shared function and authorized real rows, not an invented
learner endpoint); SYS-17.2 measured 4.5:1 text and 3:1 control/focus contrast;
SYS-19.3 existing CI runs all suites. Full verify/build/browser/database runs are
reported separately by the orchestrator. No live LLM evaluation is authorized.
