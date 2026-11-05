# LGTM AI security specification

This specification owns AI controls, SoC LLM usage limits and security acceptance
tests. [Integration contracts](INTEGRATION-SPEC.md#4-server-only-llm-contracts)
own operation schemas. [SYS-10](TECHNICAL-SPEC.md#sys-10--database-enforcement-and-privileged-access)
and [SYS-12](TECHNICAL-SPEC.md#sys-12--record-access-and-audit) govern privileged
access and data ownership. [SYS-13](TECHNICAL-SPEC.md#sys-13--environment-isolation)
and [SYS-18](TECHNICAL-SPEC.md#sys-18--resource-use) govern provider enablement.

## Attack surfaces

| Surface | Abuse case | Required controls |
| --- | --- | --- |
| Author code and generated proposals | Comments or string literals instruct the model to expose data, make network calls or change the publication. | SEC-01, SEC-02 |
| Publication hints | Injected instructions or plausible paraphrases reveal exact flaw locations, snippets or fixes. | SEC-02, SEC-03 |
| Learner comments and grading | A review asks the model to award full credit, assess another comment or reproduce the private key. | SEC-01–SEC-03 |
| TA summaries | Stored comments or feedback act as second-order instructions. Forged evidence IDs cross the summary's learner boundary. | SEC-01, SEC-02 |
| Provider transport, errors and output | Redirects, extra fields, markup, fabricated identifiers or verbose errors expose secrets or trigger side effects. | SEC-01, SEC-02, SEC-06 |
| AI mutations, retries and accounting | Parallel requests, duplicate keys, large inputs or interrupted calls bypass quotas or duplicate results. | SEC-04–SEC-06 |

## SEC requirements

### SEC-01 — Authorize and minimize model access

The server verifies the session, stored role, resource access and operation
state before building a model request. Use only the operation's allowlisted
fields from the authorized snapshot. Treat pasted code, comments, prior model
output and stored text as untrusted data. Keep them in a structured payload
separate from server-owned instructions. No request grants the model tools,
browsing, code execution, callbacks or application credentials. The server
selects the approved SoC HTTPS destination and model. Caller or model content
cannot change either, and redirects are rejected.

- **SEC-01.1:** With two users per relevant role and an anonymous caller, exercise
  wrong-role, cross-owner, forged-ID and ineligible-state requests. Assert zero
  provider attempts and zero usage reservations. Exercise the matching direct
  user-scoped database paths to verify private data and server-generated writes
  remain protected.
- **SEC-01.2:** Capture fake requests for all four operations. Verify exact input
  projections, including exclusion of learner email and unrelated evidence. Use
  code, comments and stored feedback containing role markers, delimiter escapes,
  secret requests and attacker URLs. Assert the strings stay in data fields and
  the destination, instructions and capabilities stay server-controlled. Simulate
  a redirect and assert no follow-up request.

### SEC-02 — Validate model output before use

Parse a bounded response with the operation's strict schema and semantic checks
against the captured snapshot before storing or returning any result. The
server owns matching, score calculation, authorization and state transitions.
An Author must approve proposals through the publication workflow. AI-generated
strings and code render as inert text, including in TA views. They cannot initiate
navigation, fetch resources or execute code.

- **SEC-02.1:** Inject wrong operation/version, unknown fields, overlapping
  proposals, substituted or duplicate assessment IDs, and foreign summary
  evidence. Each invalid result is rejected as a whole. A schema-valid credit
  still feeds only the deterministic grading rules for its matched comment.
- **SEC-02.2:** Render stored code and model text containing script tags, event
  handlers, Markdown links and remote images. Assert literal display and no
  script execution, navigation or external request. On a stale publication or
  proposal snapshot, assert the new result cannot replace current state.

### SEC-03 — Protect learner-facing hints and feedback

Accept learner-facing model text only when it exactly matches a server-approved
plain-text phrase for its allowed selector. Hint phrases are generic review
prompts selected by flaw category. Feedback phrases describe the assessment of
the existing comment using its explanation and fix credits. The phrase sets
contain no locations, code snippets, concrete fixes or private rationale and
accept no interpolation from model or private data. The model selects phrasing
through the existing text fields. The server rejects an unapproved selection
before persistence. Access to cached hints remains scoped to the eligible
submission, pinned revision and missed flaw under the integration contract.

- **SEC-03.1:** Return schema-valid text that quotes, paraphrases or encodes a
  planted answer, names a line, supplies a fix or uses a phrase for the wrong
  category or credits. After permitted retries, assert `INVALID_AI_OUTPUT` and
  no new publication or original grade. Verify approved phrases succeed.
- **SEC-03.2:** Attempt early, cross-submission and cross-revision hint reads.
  Verify only eligible cached hints are returned, with the learner DTO
  projection, and neither successful nor rejected reads call the provider.

### SEC-04 — Bound SoC requests and usage

These are LGTM ceilings shared by fake and live enforcement. A deployment uses
the lower of these ceilings and the confirmed SoC model, context and allocation
limits. Before enabling live use, verify the selected endpoint and model support
input measurement, output limits and the effective time budget. Confirm the
allocation covers the configured environment budget, including other consumers
of the allocation. If these limits cannot be established or enforced, live
requests fail closed before dispatch. Keep the provider key under SYS-15.

| Scope | Ceiling |
| --- | --- |
| Input per attempt | 32,768 tokens, including instructions, envelope and provider framing |
| Output per attempt | 8,192 generated tokens and 128 KiB of response body |
| Per attempt / per operation | 15 seconds per attempt and 35 seconds total from reservation to operation expiry |
| Provider attempts per operation | 2, including the first attempt |
| Per verified account, across AI operations | 1 active operation, 4 attempts per UTC minute, 20 attempts and 300,000 combined input/output tokens per UTC day |
| Per environment, across accounts and operations | 4 active operations, 20 attempts per UTC minute, 100 attempts and 1,500,000 combined input/output tokens per UTC day |

Count input with a verified model tokenizer or a conservative upper bound for
the full request. Bound generation at the provider and stop reading at the
response byte or time limit. An input that exceeds the effective context or
input cap returns `413 PAYLOAD_TOO_LARGE` before dispatch. Do not silently
truncate snapshots. Exhausted attempt, token or concurrency capacity returns
`429 RATE_LIMITED`. Use the integration contract's provider error categories
for transport failure and timeout. An oversized, truncated or invalid model
result cannot be accepted.

- **SEC-04.1:** At and one unit beyond each payload limit, including multibyte
  input, verify preflight rejection or bounded response consumption. With a
  fake clock and provider, verify deadlines, configured lower ceilings, and
  rejection when live limit enforcement cannot be established. Assert local
  and CI configurations cannot dispatch to SoC.
- **SEC-04.2:** With a fake clock, exhaust each account and environment budget
  independently, including with mixed operation kinds and multiple accounts.
  Verify the next attempt is denied without dispatch and UTC window rollover
  does not reset a still-active concurrency slot.

### SEC-05 — Reserve and settle usage atomically

The server derives account, operation and attempt identities. Keep durable
reservations and usage events under SYS-10/SYS-12. Acquire the operation slot
and reserve one attempt and the maximum input/output charge for that attempt
against both scopes atomically before dispatch. Attribute usage to the UTC
windows of reservation, including when settlement crosses a window boundary.
Each retry reserves its own attempt and tokens. Count dispatched attempts even
on failure. Settle a reservation once using verified provider usage within the
reservation. If usage or dispatch is uncertain, charge the full reservation.
Release an entire reservation only when there is durable evidence dispatch did
not occur.
Expiry clears abandoned slots and settles uncertain attempts at their reserved
charge. Reject late results from expired operations.

Only invalid model output permits one automatic retry, within the same
snapshot, deadline and budgets. Transport errors and timeouts end the operation.
Explicit retries follow the integration idempotency contract. A replay of an
existing result, a cached hint read or grading with no matches consumes no
provider quota. Accounting unavailability fails closed.

- **SEC-05.1:** Race different keys at the last slot or budget unit and replay
  identical keys concurrently. Assert only admitted attempts dispatch, duplicate
  mutations do not execute twice and original grades remain unique.
- **SEC-05.2:** Inject failures before dispatch, after dispatch and during
  settlement. Verify known unused reservations are released, uncertain usage
  is fully charged, expiry frees slots, duplicate settlement never refunds
  twice and late results cannot persist. Verify clients cannot spoof or reset
  accounting through a direct database request.
- **SEC-05.3:** Exercise invalid output followed by success, repeated invalid
  output, denied retry reservation, timeout and transport failure. Verify the
  attempt count and result for each case, including the integration grading
  flag only when grading succeeds after an invalid-output retry.

### SEC-06 — Contain failures and keep diagnostics safe

A failed AI operation exposes only the integration error contract and leaves no
successful AI result or partial publication. Operational diagnostics may
include server-issued correlation IDs, operation kind, latency, token totals
and outcome category. Exclude credentials, prompts, raw request/response
bodies, source, review text, private answers and personal data from application
logs, traces and errors. Apply the same rules to provider exceptions.

- **SEC-06.1:** Inject sentinel secrets, code and answer text into payloads and
  provider errors. Inspect responses, logs and traces for absence of those
  values. Verify the failure preserves previously committed publication,
  grading and summary data.

Run security acceptance tests with the fake provider, local Supabase for
database authorization and accounting races, and browser checks for rendering.
Use synthetic payloads and a controlled clock. Verify hosted settings by
configuration review under SYS-13 and SYS-15.
