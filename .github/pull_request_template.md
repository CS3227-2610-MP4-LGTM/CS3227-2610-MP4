## What and why
<!-- Explain the change and why it is needed in 2–3 sentences. -->
<summary>

Closes #<issue>.

<!-- List SYS-nn, ACC-nn, LRN-nn, AUT-nn, TA-nn or SEC-nn IDs this PR adds or implements; spec PRs allocate new IDs. Use n/a if none. -->
- **Requirement IDs:** <requirement-ids>
<!-- Choose spec | feature | fix | workflow | minor change. -->
- **Kind:** <kind>

### Decisions made
<!-- Record decisions teammates should see. Delete this section if there are none. -->
<decisions>

## Evidence
<!-- Link the merged spec PR, write "this PR", or use n/a. -->
- **Spec approval:** <spec-approval>
<!-- Use logs/<github-username>/NNN-<slug>.md; n/a if no agent was used. -->
- **Session log:** <session-log>
<!-- Use T-nn from workflow/PLAN.md, or n/a. -->
- **PLAN task:** <plan-task>
<!-- Choose low | standard | high. -->
- **Route:** <route>
<!-- Use workflow/handoffs/<issue>-<slug>.md, or n/a for low. -->
- **Handoff:** <handoff>
<!-- Use reviewer pass|fail; security pass|fail|n/a; open P0/P1: n. -->
- **Reviews:** <reviews>

## Checklist
- [ ] `bun run verify` passes locally.
- [ ] Tests were committed before implementation (standard and high routes; n/a for low).
<!-- Replace with what this PR does not change, e.g. "Spec-only change: no code, config, migration or PLAN changes." -->
- [ ] <scope-exclusions>
- [ ] No secrets, `.env*` files or live LLM calls; secrets are referenced by name only.
- [ ] Commits containing agent work end with an `Agent: <name>` trailer.
