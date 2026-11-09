# T-32 acceptance tests — G2 review map

Scope: TA-04.1–.2 directory/detail shell and TA-05.1–.7. Summary generation,
stored-summary presentation and freshness belong to T-33. These tests deliberately
leave the Performance summary composition region available without fabricating a
summary or adding a generation action. No dependencies or configuration changed.

## Criterion map

| Criteria | Evidence |
| --- | --- |
| TA-04.1 | `directory.test.tsx` identity/duplicate names/inert markup/detail links; `detail.test.tsx` heading, identity and summary slot; integration `reads.test.ts` learner-only rows; e2e `journeys.spec.ts` role navigation and supporting-submission round trip |
| TA-04.2 | Directory pending/disabled pagination, same-query retry, invalid/empty states and URL restoration; detail pending/missing identity; integration bounded/default/order/cursor/strict input tests; e2e reload/back/invalid/missing learner |
| TA-05.1 | `rules.test.ts` exact five-row DTO; `detail.test.tsx` labels, percentages, null/zero distinction and explanation; integration retained original S1/S3; phone-width browser case |
| TA-05.2 | Rules exclude incomplete/failed/retry/other-learner evidence and count distinct submissions per category; four-decimal aggregation; base persisted S1/S2/S3 plus effective override 901; zero/duplicate and pending/running/failed fixtures; retained R1 evidence after R2/unpublish/archive |
| TA-05.3 | Rules exercise exact ratios which all round to .5000, denominator/enum ties, coverage/difficulty/ID ordering, default/1/10 bounds and target intersection; UI uses server targets; integration live candidate DTO/order/limit |
| TA-05.4 | Rules empty/unobserved/no eligible/no fallback/partial results, nonlive and attempted ID exclusions; integration later pending/running/failed attempts and pinned old revision exclusion; UI no Learner review links/actions; snapshots verify read-only results |
| TA-05.5 | Detail independent loading, both-refresh disabling, successful-only replacement, retained labels and retry; integration subsequent candidate publication/attempt/unpublish/archive; browser refresh and retained section failures |
| TA-05.6 | Initial failures differ from empty results; both directions of independent failed refresh/retry with summary slot preserved; direct database failure returns unavailable without diagnostic leakage |
| TA-05.7 | Server/direct database matrix with two users per role plus anonymous caller; wrong-role and missing IDs; identity projection; supporting-submission round trip; account failure and sign-out/switching/prefetch/reload browser tests; no admin/provider calls or record mutations |
| SYS-02.1–.2 | Strict invalid/repeated/extra/bounded query and UUID tests; inert display-name markup in directory |
| SYS-04.1, SYS-08.2–.3 | Shared direct DAL entry points and canonical HTTP entry points both enforce role/identity/record boundaries; user-scoped client mocks and local role matrix |
| SYS-09 | Endpoint `no-store` assertions and browser transition tests. Suspense/static-shell and no-cache-scope review, and production build execution, remain orchestrator/reviewer checks |
| SYS-10, SYS-12.1–.2/.4 | `database.test.ts` profile/evidence/joins matrix, exact directory RPC privileges and denied calls; `reads.test.ts` retained evidence and no email/answer leakage |
| SYS-11 | Unit missing session/profile, wrong role and auth/profile outage categories; permitted database outage is a separate unavailable result; browser removes protected content on account failures |
| SYS-17 | Region/column labels and live pending/error announcements; browser keyboard visible-focus and 320px layout tests. Contrast requires review evidence; not claimed verified here |
| SYS-19 | Deterministic unit fixtures, T-30 real local Auth/RLS harness, browser tests confined to e2e. DB/browser execution is explicitly unrun here |

## Interfaces defined by tests

All following production modules are absent at the Tests stage. Names below are
the minimum callable seams needed for executable acceptance tests. DTOs reuse
INTEGRATION-SPEC; these test fixtures are not an alternative domain vocabulary.

`src/lib/ta/progress.ts`:

```ts
type Evidence = {
  id: string; learnerId: string; attemptNumber: number;
  gradingState: "pending" | "running" | "failed" | "completed";
  flaws: { id: string; category: Category }[];
  matchedFlawIds: string[];
};
aggregateCategoryProgress(learnerId: string, evidence: Evidence[]): CategoryProgress;
selectRecommendations(
  progress: CategoryProgress,
  candidates: { challenge: ChallengeCard; status: "draft" | "published" | "unpublished" | "archived" }[],
  attemptedChallengeIds: string[],
  limit?: number, // default 5; validated caller supplies 1–10
): { items: { challenge: ChallengeCard; targetCategories: Category[] }[] };
```

The selector must calculate weakness from original count ratios, not the rounded
`identificationRate`. Evidence construction uses original per-flaw matching, not
effective scores, credit totals or the current live revision's key. The shared
aggregation is reusable by T-33 and must not be duplicated there.

`src/server/ta/progress.ts` (all asynchronous, verified TA/user-scoped):

```ts
readLearnerPage(query: URLSearchParams): Promise<{ status: "ok"; page: Page<LearnerIdentity> } | ReadFailure>;
readLearner(id: string): Promise<{ status: "ok"; learner: LearnerIdentity } | ReadFailure>;
readCategoryProgress(id: string): Promise<{ status: "ok"; progress: CategoryProgress } | ReadFailure>;
readRecommendations(id: string, query: URLSearchParams): Promise<{
  status: "ok"; recommendations: { items: { challenge: ChallengeCard; targetCategories: Category[] }[] }
} | ReadFailure>;
```

`LearnerIdentity` is exactly `{ id, displayName }`. `ReadFailure` preserves the
existing TA/workspace statuses (`invalid`, `not_found`, `unavailable`,
`unauthenticated`, `role_denied`, `account_unavailable`,
`account_service_unavailable`). Existing nonlearner profile IDs return forbidden,
not a fabricated learner or a missing result.

Canonical handlers export `GET(Request): Promise<Response>` at
`src/app/api/v1/ta/learners/route.ts` and
`GET(Request, { params: Promise<{ id: string }> }): Promise<Response>` at
`learners/[id]/progress/route.ts` and `learners/[id]/recommendations/route.ts`.
They use existing data/error envelopes, strict queries and no-store responses.
The internal identity read does not add an unspecified public endpoint.

`src/components/ta/learner-list.tsx` exports `LearnerList` with props
`{ search: string; readPage(search: string): Promise<LearnerPageResult>;
navigate(href: string): void }`.

`src/components/ta/learner-detail.tsx` exports `LearnerDetail` with props
`{ learnerId: string; readLearner(id): Promise<LearnerResult>;
readProgress(id): Promise<ProgressResult>;
readRecommendations(id): Promise<RecommendationResult>;
summarySlot?: ReactNode }`, using the results above. The identity is authorized
before starting section reads. The summary slot sits inside a separately labelled
Performance summary region. Component read callbacks carry no privileged clients.

## Database interfaces defined by tests

`public.profiles.created_at timestamptz` is required for the shared directory
createdAt-descending/ID-ascending ordering without reading Auth records. Fixture
setup works against the existing schema; the pagination test explicitly asserts
this new column before setting deterministic equal timestamps. Provision it on
profile creation and preserve it thereafter. Do not include it in identity DTOs.

Two new privileged, read-only database surfaces are defined:

```sql
public.list_ta_learners(
  p_limit integer default 20,
  p_before timestamptz default null,
  p_after_id uuid default null
) returns jsonb
public.read_ta_learner(p_learner_id uuid) returns jsonb
```

Both are SECURITY DEFINER with empty search_path, stored-role TA check, and
authenticated-only EXECUTE (PUBLIC, anon and service_role denied). A direct wrong
role call returns `{ status: "forbidden" }`; invalid list bounds reject or return
`{ status: "invalid" }`. List success has `status: "ok"` and `items` containing only
learner `{id,displayName}` rows, at most limit+1 for the server's cursor handling.
The function may additionally return a private next-anchor timestamp/ID outside
identity rows for opaque cursor generation. Identity success is exactly
`{status:"ok",learner:{id,displayName}}`; an absent ID returns
`{status:"not_found"}` and an existing nonlearner ID returns
`{status:"forbidden"}`. This narrow function is necessary because ordinary TA RLS
cannot distinguish a hidden Author profile from an absent record. No Auth joins
or account fields. Every relevant role calls both directly in `database.test.ts`; SQL privilege checks
also verify the PUBLIC default is revoked. Existing table RLS still applies to
all ordinary evidence reads. No new view, policy widening, writable RPC or admin
client use is authorized by these tests. If implementation adds another database
surface must have matching grant/role tests before G2 is considered stable.

## Checks and failing-first evidence

Run with Node 24 on PATH and Bun; never load environment files for unit checks:

```sh
bun --no-env-file run test tests/unit/ta/progress
bun --no-env-file run lint -- tests/unit/ta/progress tests/integration/ta/progress tests/e2e/ta/progress
bun --no-env-file run typecheck
```

The unit run fails four suites at import collection, solely for the absent
`@/server/ta/progress`, `@/lib/ta/progress`,
`@/components/ta/learner-list` and `@/components/ta/learner-detail` interfaces.
No test assertions execute yet. Typecheck reports only TS2307 diagnostics for
these and the three absent canonical handlers. This is expected missing-interface
evidence permitted by sdd-test, not passing behavior evidence. Scoped lint passes.

Database-backed tests and Playwright browser execution are unrun by this
specialist, per T-32. Local Docker/CLI/stack are unavailable. The orchestrator owns the local Supabase failing-first checks and subsequent
implementation checks, with fake LLM only, plus the Cache Components
production-build browser checks; those executions are currently unavailable.  No live LLM, hosted database,
application implementation, handoff edits, commits or dependency changes here.
