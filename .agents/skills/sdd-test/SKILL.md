---
name: sdd-test
description: Write and demonstrate failing acceptance tests at the Tests stage before the human test commit. Does not implement behaviour or review code.
---

# Write tests

Read task Reads, the stories' Acceptance criteria, INTEGRATION-SPEC sections
6 (Shared deterministic seed fixtures) and 7 (Integration verification), and
SYS-19 (Test strategy). For AI tasks read cited SEC requirements and their
tests. Inspect existing code only for interfaces; do not design tests around
an imagined implementation.

Map every criterion to a test. Each test title starts with its criterion ID;
use parameterized cases where useful. Exercise observable success, denied
access, validation and failure outcomes called for by the criteria. Keep
fixtures deterministic and load supabase-local only if local database setup
is needed. Add devDependencies only when necessary and explain why; keep the
lockfile synchronized without changing runtime dependencies.

Define and exercise every planned privileged database surface (each function,
view, RPC, grant, policy and use of the admin client). Assert each grant's
role and privileges. Exercise allowed and denied direct calls or access as
the relevant roles.

Put tests under `tests/{unit,integration,e2e}/<area>/`; browser tests belong
only under `tests/e2e/`. Vitest defaults to jsdom here, so database and route
test files start with `// @vitest-environment node`.

Run targeted tests and report the exact failures. A missing module or export
introduced by this task is expected failing-first evidence. In the summary,
list new interfaces and privileged surfaces as "interfaces defined by tests",
with paths and any required exports and signatures. Syntax errors, wrong paths
to existing modules, and setup or infrastructure failures still fail the
gate. If behaviour already passes, report it; do not manufacture a failure.
Return the criterion/test map for the human at G2; do not begin implementation.
