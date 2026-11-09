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
| Publication hints | Model-written text reveals flaw locations, snippets or private rationale; location-revealing paraphrases remain an accepted residual risk under SEC-03. | SEC-02, SEC-03 |
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

Hints and assessment feedback are model-written plain text in the existing
INTEGRATION-SPEC fields. Prompts instruct the model to avoid revealing
locations, identifying snippets, fixes or private rationale, and to make
feedback specific to the assessed comment and its credits.
Private rationale is never reused as learner feedback, including for the
matched flaw.

Before persistence, the server rejects any hint or feedback that exceeds its
INTEGRATION-SPEC length bound, contains markup or links, refers to a line or
line range, or meets the protected-text overlap rule below. Markup
means HTML/XML tags or comments and backtick code spans or fences; links
include Markdown links, autolinks and bare URLs. Line references include
explicit forms such as `line 12`, `lines 12–14`, `L12` and `L12–L14`.
Accepted text is stored and displayed as inert plain text under SEC-02.

**Protected-text overlap rule:** Normalize each candidate and each protected
value with Unicode NFKC, then full Unicode case folding. Tokenize into maximal
runs of Unicode letters, marks or numbers; punctuation, symbols and whitespace
only separate tokens. Reject an exact contiguous match of eight tokens. For
protected values of four to seven tokens, reject only when the entire sequence
appears. Values under four tokens are not checked. Compare each value
separately: every retained flaw's original snippet, replacement snippet,
private explanation and fix. Each hint and each feedback item is checked
against every retained flaw of the revision,
including the matched flaw for feedback, not only flaws sent to that operation.

Rejected output follows the existing INTEGRATION-SPEC retry and failure
behaviour: after permitted retries, return `INVALID_AI_OUTPUT`, with no new
publication or original grade. Access to cached hints remains scoped to the
eligible submission, pinned revision and missed flaw under the integration
contract.

**Accepted residual risk:** A paraphrase can point at a flaw's location without
quoting protected text or naming a line. Protected values under four tokens
are not checked: they are too short to identify a flaw, and checking them would
reject ordinary prose such as "return a value". Deterministic checks cannot
establish that such text is safe; prompt instructions and the checks above
mitigate these risks but do not eliminate them.

- **SEC-03.1:** Use the fake provider to return schema-valid text with prohibited
  overlap from a planted original or replacement snippet or private explanation
  or fix, or text that names a line or range or contains markup or links. Test
  both hints and feedback, including overlap with another retained flaw and
  with the matched flaw for feedback. Assert rejection before persistence and,
  after permitted retries, `INVALID_AI_OUTPUT` with no new publication or
  original grade. Exercise length bounds, normalization, the eight-token match
  boundary, whole-value matching at four tokens and punctuation not affecting
  a match. Verify acceptance of overlap with protected values under four tokens
  and harmless Markdown emphasis when all other checks pass. Verify a per-flaw
  hint and comment-specific feedback that pass all checks are accepted.
- **SEC-03.2:** Attempt early, cross-submission and cross-revision hint reads.
  Verify only eligible cached hints are returned, with the learner DTO
  projection, and neither successful nor rejected reads call the provider.

### SEC-04 — Bound SoC requests and usage

Send live provider requests only as stateless POSTs to the OpenAI-compatible
SoCLaaS endpoint `https://soclaas-api.comp.nus.edu.sg/v1/chat/completions`, with
Bearer authentication using the key under
[SYS-15](TECHNICAL-SPEC.md#sys-15--configuration-and-hosted-auth). Omit `tools`
and `tool_choice`. Pin a concrete model ID listed by `GET /v1/models` with a context
window of at least 65,536 tokens. Operator aliases such as `default` and `coder`
can be repointed and are prohibited.

For each operation, send its explicit `reasoning_effort`, set `max_tokens` to
its output cap within the ceiling below and request JSON with `response_format`.
Validate the answer against the [LLM contracts](INTEGRATION-SPEC.md#4-server-only-llm-contracts).
Treat empty answers and answers with a length finish reason as invalid output. Discard
`message.reasoning` before persistence, logging, tracing or display. Settle
using verified `prompt_tokens` and `completion_tokens` without a cached-token
adjustment, under [SEC-05](#sec-05--reserve-and-settle-usage-atomically).
Completion tokens include reasoning, so `max_tokens` bounds reasoning and
answer generation together.

Enforce LGTM's ceilings below for fake and live use, with environment budgets
scoped to each environment's key for live use. During configuration review, read
the key's limits from `GET https://soclaas-portal.comp.nus.edu.sg/api-key/budget`
and the pinned model's cost basis from `GET /v1/models`. Whenever the key,
model or ceilings change, verify that the environment's attempts-per-minute
ceiling is at or below the key's requests-per-minute limit and that its daily
token ceiling, priced at the pinned model's output rate, fits within the key's
daily budget. The app never calls the portal API. SoC budgets reset at 00:00 UTC
each day for daily budgets and on the first day of each month for monthly budgets.

Treat an upstream `429` (rate or quota exceeded) or `5xx` as a failed
attempt under the [SEC-05](#sec-05--reserve-and-settle-usage-atomically) transport
failure rule. Fail closed before live dispatch if the deployment requirements
or request limits cannot be enforced.

| Scope | Ceiling |
| --- | --- |
| Input per attempt | 32,768 tokens, including instructions, envelope and provider framing |
| Output per attempt | 8,192 generated tokens and 128 KiB of response body |
| Per attempt / per operation | 15 seconds per attempt and 35 seconds total from reservation to operation expiry |
| Provider attempts per operation | 2, including the first attempt |
| Per verified account, across AI operations | 1 active operation, 4 attempts per UTC minute, 20 attempts and 300,000 combined input/output tokens per UTC day |
| Per environment, across accounts and operations | 4 active operations, 20 attempts per UTC minute, 100 attempts and 1,500,000 combined input/output tokens per UTC day |

Count input with a verified model tokenizer or a conservative upper bound for
the full request. Check that input plus the operation's output cap fits the
model context. Stop reading at the response byte or time limit. Reject input
that exceeds its context or input cap before dispatch without truncating the
snapshot. Deny dispatch when attempt, token or concurrency capacity is
exhausted. Use the [integration error contract](INTEGRATION-SPEC.md#transport-concurrency-and-errors)
for these rejections, transport failures and timeouts. Reject oversized,
truncated or invalid model results.

- **SEC-04.1:** At and one unit beyond each payload limit, including multibyte
  input, verify preflight rejection or bounded response consumption. With a
  fake clock and provider, verify deadlines, configured lower ceilings, and
  rejection when live limit enforcement cannot be established. Verify network
  isolation under [SYS-13.1](TECHNICAL-SPEC.md#sys-13--environment-isolation).
- **SEC-04.2:** With a fake clock, exhaust each account and environment budget
  independently, including with mixed operation kinds and multiple accounts.
  Verify the next attempt is denied without dispatch and UTC window rollover
  does not reset a still-active concurrency slot.
- **SEC-04.3:** Capture requests with a simulated SoC transport. For each
  operation, verify the gateway, method, Bearer authentication, pinned model,
  reasoning effort, output cap, JSON format and absence of tool parameters.
  Verify an alias is rejected before dispatch.
- **SEC-04.4:** Simulate empty content and a length finish reason, including
  with schema-valid content, and verify both follow the invalid-output rule
  in [SEC-05](#sec-05--reserve-and-settle-usage-atomically). On a successful
  response with sentinel reasoning, verify settlement uses prompt tokens and
  all completion tokens, and that reasoning is absent from stored data, logs,
  traces and results.
- **SEC-04.5:** Simulate upstream `429` and `5xx` responses and verify each ends
  the operation as a transport failure without an automatic retry.

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

Run security acceptance tests with the fake provider or simulated SoC
transport, local Supabase for database authorization and accounting races,
and browser checks for rendering.
Use synthetic payloads and a controlled clock. Verify hosted settings by
configuration review under SYS-13 and SYS-15.
