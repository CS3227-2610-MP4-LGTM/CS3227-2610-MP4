---
name: sdd-review
description: Independently review correctness, regressions and criterion coverage at Review using a fresh context. Does not implement fixes or perform the specialist security checklist.
---

# Review

Read only task Reads, the diff against the recorded base and the tests,
besides repository instructions and this role's configuration. Do not read
handoffs or an implementer's narrative. Trace each criterion through the
changed implementation and assertions; inspect adjacent code only to resolve
interfaces used by the diff.

Check observable behaviour, regressions, failure paths and whether tests
would catch a broken implementation. Run relevant targeted tests if useful
without altering files. A setup failure is unverified evidence, not a pass.

Assign stable `REV-nn` finding IDs, P0–P3 priority and exact path:line evidence;
cite the affected criterion and a concrete fix direction. Preserve IDs across
rereviews and verify resolutions. Explain any lower-priority blocking finding.
Return no findings explicitly when none are supported; report unverified
criteria separately. Use the AGENTS.md summary.
