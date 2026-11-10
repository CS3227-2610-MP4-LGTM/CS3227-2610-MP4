# T-33 acceptance tests (G2)

These tests define the missing summary caller, persistence and UI interfaces.
They do not authorize implementation before the human test commit.

## Interfaces defined by tests

- `src/app/api/v1/ta/learners/[id]/summary/route.ts`: `GET(request, { params: Promise<{id: string}> })`.
- `src/app/api/v1/ta/learners/[id]/summaries/route.ts`: `POST(request, { params: Promise<{id: string}> })`.
  Requests use an empty strict JSON object and required UUID `Idempotency-Key`.
  Protected responses use the canonical `{data}` / `{error}` envelope and no-store headers.
- `src/server/ta/summaries.ts`: `readLearnerSummary(id: string)` and
  `requestLearnerSummary(id: string, request: Request)`. Direct access failures
  use existing TA `ReadFailure` / workspace-access status values. HTTP success
  shapes are the unchanged INTEGRATION-SPEC SummaryRecord contracts.
- `src/components/ta/summary-panel.tsx`: `SummaryPanel({learnerId, readSummary, generateSummary})`.
  `readSummary(id)` resolves `{status: "ok", summary: SummaryRecord | null, stale: boolean}`
  or an existing read/access failure. `generateSummary(id, idempotencyKey)` resolves
  `{status: "ok", summary: SummaryRecord}`, `{status: "failed", code: string}`
  or an existing access failure. A rejected mutation promise means an uncertain
  outcome, requiring stored-result refresh. The component exposes the summary
  heading for focus and an explicit “Refresh learner performance” read control.
  Compose it into the learner shell with one accessible Performance summary region
  and heading; preserve the existing injectable `summarySlot` contract.
- `public.persist_ta_summary(p_input jsonb)`: new dedicated atomic summary/evidence
  persistence function; SECURITY DEFINER, empty search_path, EXECUTE only for
  service_role, no PUBLIC/anon/authenticated grant and no direct admin table or
  column privileges. The server chooses its JSON input shape. Tests capture a real
  successful call, verify a direct admin replay is harmless and reject forged or
  unaccounted input. This fixes one privileged surface; any additional surfaces
  need their own grant, authorization and direct-call tests before implementation.

No snapshot-building helper, mutation journal schema, extra dependencies or
configuration changes are prescribed. Reuse CategoryProgress and the LLM boundary.

## Criterion map

| Criteria | Evidence |
| --- | --- |
| TA-04.3 | `panel.test.tsx`: null/stored provenance, timezone/time element, labels, empty sections, inert full text and evidence links; integration null reads and persisted DTO; browser entry/reload/supporting round trip. |
| TA-04.4 | Panel current/stale states; integration timestamp-independent freshness, effective override change, immutable retained history and latest-20/all-history progress change; browser refresh after an override. |
| TA-04.5 | Panel duplicate-click pending controls, previous output, success announcement/focus and learner-change cancellation; integration atomic evidence rows, attribution and no grade/progress/moderation changes; real browser generation. |
| TA-04.6 | Panel exact messages/recovery for no completion, oversized evidence, quota, timeout, invalid output, provider and accounting failures; integration preflight/zero-dispatch, invalid foreign/category/empty/unknown output, exhausted account budget, settlement/persistence failures and late result rejection. |
| TA-04.7 | Panel explicit retry/new key and uncertain-result refresh; integration in-flight duplicate, lost-reply replay, recorded failure replay and new-key attempt; browser committed mutation/lost response recovery and access failure. |
| TA-04.8 | Panel initial read failure distinct from null, retained prior output/freshness-unavailable and read-only retry; browser independent summary/progress failures and retained text. |
| SYS-01.1, SYS-02.1–.2, SYS-03.1–.3 | Unit direct service/route validation, inert rendering; integration real fake-provider capture, strict validated persistence; existing server-only and LLM boundary regressions. Call-site and production-bundle verification still requires implementation review/G4. |
| SYS-08.2–.3, SYS-09, SYS-11, SYS-12.1–.2/.5 | Unit direct-call identity/role/outage matrix and validation before privilege; integration two users per role plus anonymous route/direct DB matrix, forbidden/absent resources and exact minimized evidence; browser sign-out, hover/navigation/back/reload/account switching and access failures. Production cache behavior remains a G4 browser check. |
| SYS-10.1–.4 | Integration dedicated function catalog/EXECUTE/default PUBLIC ACL and table/column grant assertions, successful admin replay, unaccounted/forged direct-call rejection, direct generated-write denial and atomic parent/evidence rollback. |
| SYS-13.1/13.3, SYS-16 | Existing local harness rejects non-loopback services; task stubs fake provider and APP_ENV=test. Unit hostile origin/account header rejection; output/diagnostic minimization and inert browser text. Existing environment/hosted-admission regression tests retain hosted configuration coverage. |
| SYS-17–SYS-19 | Panel pending/success/failure announcements and heading focus; browser visible keyboard focus and 320px no page overflow; existing fake usage ceilings and integration/Playwright harness. G4 verify/e2e remain unrun. |
| SEC-01.1–.2 | Route/direct DB authorization matrix with no reservation/dispatch for denied callers; exact captured allowlist and scope; existing boundary tests for instruction/data separation and latest-20 ordering. |
| SEC-02.1–.2 | Integration foreign evidence/category/unknown/empty invalid result rejection with no persistence; full inert UI/browser rendering; existing contracts tests for all cardinality/uniqueness bounds. |
| SEC-04.1–.2 | Caller oversized snapshot and account budget rejection; existing `tests/unit/server/llm/execution.test.ts` and integration accounting tests cover all shared byte/token/time/environment ceilings without duplicating their implementation. |
| SEC-05.1–.3 | Integration concurrent duplicate key, committed-result replay, failed-key/new-key behavior, invalid-output retry, failed accounting, atomic persistence failure and durable expiry; reuse shared accounting last-slot/settlement/refund/concurrency regression tests. |
| SEC-06.1 | Injected provider/settlement/evidence diagnostics excluded from responses/logs; every failure preserves committed summaries and prevents partial evidence rows. |

Shared regressions: `tests/unit/server/llm/`,
`tests/integration/llm/boundary.test.ts` (authorized projection/latest-20 ordering),
and existing accounting integration suites. New browser tests intentionally use
the real fake provider/local Auth for generation; route interception is limited
to deterministic failure and inert-text presentation cases.

## Observed failing-first evidence

- `bun run test tests/unit/ta/summaries`: two suites fail collection for missing
  summary GET route and SummaryPanel. These are interfaces introduced above.
- Scoped ESLint over all three summary directories passes.
- `bunx --no-env-file tsc --noEmit --pretty false`: only six missing-module
  diagnostics for the four test-defined modules (referenced from multiple suites).
- Database and browser behavior were not run by the test-writer; orchestrator
  owns those checks. Missing-interface collection failures do not verify them.
- No production source, schema, dependency, configuration or acceptance criterion
  has been changed.
