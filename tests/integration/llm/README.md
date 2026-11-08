# T-04 acceptance contract for G2

These tests define **new interfaces**, not existing implementation details. No LLM
implementation existed when they were written. Only test files and the integration
include list change. No dependencies were added. All functions under
`src/server/llm/` are server-only. Paths/exports below are implementer contracts.
Input/output envelope payloads have the exact Integration §4 shapes. Helpers throw
an error with a safe `code`; orchestration returns `{error:{code,...}}` or
`{data: validatedOutputEnvelope, meta:{attempts,outputRetried}}`. Other harmless
metadata can be added. No tests execute pasted code or make real provider requests.

## Interfaces defined by tests

| Module under `src/server/llm/` | Exports / signatures |
| --- | --- |
| `contracts.ts` | `validateInput(value: unknown): InputEnvelope`; `validateOutput(snapshot: InputEnvelope, value: unknown, options?: {retainedFlaws: RetainedFlaw[]}): OutputEnvelope`; `assembleCandidate(code: string, proposals: Proposal[]): {code: string, flaws: {key,startLine,endLine,...}[]}`; `parseBoundedJson(raw: string): unknown` (UTF-8 128KiB cap before parsing). |
| `safety.ts` | `validateLearnerText(value: string, options: {maxCodePoints:number,retainedFlaws:RetainedFlaw[]}): string` returns trimmed validated text or throws. Retained flaws include all four protected values, not merely the model input projection. |
| `config.ts` | `getLlmConfig(env: Record<string,string\|undefined>): {provider,limits,...}` validates on use. Uses only existing named settings; no invented live endpoint/model environment settings. Local/test/CI require explicit fake. Hosted development defaults fake; live fails closed until approved enforcement/allocation evidence exists. |
| `provider.ts` | `buildRequest(snapshot): {instructions:string,data:InputEnvelope,destination,model,capabilities:{tools:false,browsing:false,codeExecution:false,callbacks:false}}`; `measureRequest(request):number` uses a conservative **one-token-per-UTF-8-byte full serialized request** upper bound in these tests (a verified tokenizer can replace this contract by a deliberate test revision); `readBoundedResponse(response:Response,{maxBytes,signal}):Promise<string>`; `createFakeProvider({scenario:'success'\|'malformed'\|'failure'})`; `createSocProvider({destination,model,apiKey,fetch,limits,verifiedLimits})` for injected transport tests only, never live configuration enablement. Both expose `execute(request,{maxOutputTokens,signal}):Promise<{output:unknown,usage?:{inputTokens,outputTokens,verified:boolean}}>`; fake success matches the deterministic fixtures. |
| `execution.ts` | `createOperationRunner({provider,accounting,clock:()=>number,limits,measureInput?:(request)=>number,diagnostics?:{log,trace}}).run({accountId,resourceId,idempotencyKey,snapshot,retainedFlaws,fingerprint})`. This is an **internal trusted** runner after authorization; it never serves as a role endpoint. It reserves before dispatch and calls durable store transitions below. |
| `accounting.ts` | `createAccountingStore({db: SqlExecutor,clock:()=>number,limits,environmentId:string})` where `SqlExecutor` structurally supports the existing pg `query` method. Implementations must invoke dedicated admin-only SQL functions, not admin table reads/writes. `environmentId` is a trusted deployment namespace; tests use `t04-llm-acceptance`, shared across all accounts/boundary instances. It is never accepted from role input. |
| `boundary.ts` | `createLlmBoundary({client: userScopedSupabaseClient,accounting,provider,clock,limits}).execute(request,selection?)` and `.readUsage()`. Request is strict `{operation,resourceId:UUID,idempotencyKey:UUID,expectedVersion?:number}`. Resource is a challenge for injection/hints, persisted submission for assessment, learner ID for summary. Expected version is captured draftVersion. `selection?:{matches:{key:flawId,commentId}[]}` is internal server-owned deterministic selection, not model matching or an HTTP body; the boundary rechecks all identities against the owned pinned submission. Boundary verifies session/stored role/access/state before capture/reservation, loads allowlisted input from persisted records, and revalidates captured version/fingerprint before returning. It does not persist generated role results. Own `.readUsage()` returns `{data:{accountId,...permittedBudgetFields}}`. |

Durable store methods:

```ts
reserve({accountId,operation,resourceId,idempotencyKey,fingerprint,
         inputTokens,outputTokens,operationId?})
  // Promise<{status:'reserved',operationId,reservationId,expiresAt:string}>
  // or {status:'in_progress'|'replay',operationId}; throws on denial.
  // operationId is supplied only by the trusted runner for automatic retry.
markDispatched({reservationId}): Promise<void>
settle({reservationId,outcome:'verified'|'uncertain'|'not_dispatched',
        usage?:{inputTokens,outputTokens}}): Promise<void>
close({operationId,outcome:'completed'|'failed'}): Promise<void>
expire(): Promise<void>
read({accountId,at?:number}): Promise<{
  account:{active,minuteAttempts,dayAttempts,dayTokens},
  environment:{active,minuteAttempts,dayAttempts,dayTokens}
}>
```

The store is an admin-only internal accounting port whose authorization precondition
is fulfilled by the boundary. Synthetic direct-store race requests deliberately
omit role/domain behavior. Reservation IDs and operation IDs are server-issued;
callers cannot provide accounting ownership, instructions or counters. `read` is
privileged diagnostics for assertions, distinct from the own-only user projection.
Settlement is idempotent for identical data; contradictory release after a charge
fails. Verified usage may not exceed either reserved input/output component.
Expiry treats unresolved dispatched work as uncertain and rejects late settlement.
Completed replay need not persist generated role content in accounting; tests
require no extra dispatch/reservation/charge. Role-result replay persistence stays
with later role tasks.

## Criterion map

All test titles begin with their criterion ID. Parameterized cases cover the
listed boundaries without weakening the shared account/environment ceilings.

| Criteria | Evidence |
| --- | --- |
| SYS-01.1 | `unit/server/llm/isolation.test.ts`: marker on every public LLM entry plus actual default/browser poison-package rejection; a full Next client graph build remains G4/review evidence. |
| SYS-02.1, SYS-03.3, SEC-02.1 | `contracts.test.ts`: strict four-operation input/output envelopes, nested/extra fields, language/count/category limits, code Unicode/UTF-8/normalization, candidate assembly/shift/overlap/range/cardinality/identity/evidence/credit bounds; raw JSON 128KiB equality/one beyond. |
| SYS-02.2, SEC-01.2 | `provider.test.ts`: malicious text stays structured data; immutable server instructions/destination/model and no capabilities; all four exact persisted projections in `boundary.test.ts`; no pasted-code execution. Rendering belongs to role tasks. |
| SYS-03.1 | `isolation.test.ts`: application credential/SoC references stay inside the boundary; source scan is review support, not a complete transport call-graph proof. |
| SYS-03.2 | `provider.test.ts`: deterministic success for all four fixtures, malformed/failure scenarios, fetch forbidden. |
| SYS-10.1–10.4, SYS-12.1, SYS-12.5 (usage) | `accounting.test.ts`: new accounting table catalog RLS/grants, no anonymous/service direct table access, admin-only accounting functions, direct user write/reset denial and own-only reads; `boundary.test.ts` all six users and anonymous own projection. |
| SYS-13.1/13.3, SYS-15.1, SYS-18.1 | `config.test.ts`: explicit fake in local/test/CI, invalid/missing config with named errors/no values, hosted fake default, unenforceable live fails closed. `isolation.test.ts` CI fake/local settings. No live URL/model is enabled by tests. |
| SYS-16.1, SEC-06.1 | `execution.test.ts`: injected provider exceptions omit credentials/private sentinel text from errors/logs/traces; boundary stale draft test preserves existing active generation. Role-result history persistence belongs to later tasks. |
| SYS-18.2, SEC-05.3 | `execution.test.ts`: one invalid-output retry, repeated invalid output, denied retry, no transport/timeout retry, no-match zero quota, lower attempt ceiling; durable retry accounting in `accounting.test.ts`. Grading flag persistence belongs to grading. |
| SYS-19.1/19.3/19.4 | Real local Auth plus committed DB connections in integration; CI config assertion; serial integration suite include preserves auth/domain. This document records unreached/unrun evidence. G4 verify/e2e remains human-owned. |
| SEC-01.1 | `boundary.test.ts`: anonymous/wrong stored role/cross-owner/forged resource or selection/ineligible archived state/stale version denied with zero reservations and attempts across operation types. |
| SEC-01.2 | `boundary.test.ts`: hint candidate, pinned selected assessment, summary private-data exclusion, completed evidence only and latest20 ordering/ties. Provider redirect is rejected with one fetch. |
| SEC-02.2 (shared snapshot) | `boundary.test.ts`: draft changes during dispatch reject result and leave generation pointer intact. Publication/summary fingerprint revalidation and browser inert rendering additionally need later role/review evidence. |
| SEC-03.1 | `safety.test.ts`: every retained flaw/protected field against hints and matched feedback, full Unicode folding/NFKC, punctuation, eight-token and whole4–7 boundaries, under4 acceptance, harmless emphasis, markup/link/line forms, Unicode codepoint lengths. |
| SEC-04.1 | `execution.test.ts` input/output token equality/one beyond, lower limits, 15s and35s deadlines; `provider.test.ts` multibyte bounded reader equality/one beyond and cancellation; code/body bounds in contracts. |
| SEC-04.2 | `accounting.test.ts`: all six account/environment attempt/token budgets at ceiling and next unit, mixed operations/accounts, persisted reconstruction, UTC rollover retaining active slots and reservation windows. |
| SEC-05.1 | `accounting.test.ts`: independent physical committed connections race last account/environment slot, attempt or token unit and duplicate keys; `boundary.test.ts` only admitted attempts dispatch. |
| SEC-05.2 | `accounting.test.ts`: verified/uncertain/known-unused once-only cross-connection settlement, overclaim denial, expiry34999/35000/35001 and late rejection, failed settlement transport charges full after reconstruction; execution pre/post dispatch failure and accounting outage fail closed. |

## Execution and review limits

Specialist runs only unit tests, lint and TypeScript checks. New implementation
modules do not exist yet, so their suite imports fail before executable assertions
are collected. This establishes expected missing-interface red evidence, **not**
passing behavior coverage. Integration tests must be run by the orchestrator:

```sh
bun run test:integration tests/integration/llm
bun run test:integration tests/integration/auth tests/integration/domain
bun run test tests/unit/server/llm
```

The harness checks loopback URLs before local requests, uses real Auth provisioning,
and commits fixtures and reservations before racing separate physical connections.
Cleanup follows primary-ID descendant closure for server-generated children and
removes the dedicated environment namespace; only local test-owned rows are deleted.
No database setup/reset is performed by the specialist. Existing environment files
are never read. No live requests, runtime dependency changes or implementation edits.

Remaining review/settings evidence: approved hosted endpoint/model/allocation and
transport format; full Next client graph import build; all call sites of privileged
accounting; later role-result persistence/grade uniqueness/flags/rendering/cached
hint reads. Current foundation tests do not claim those role criteria are complete.
