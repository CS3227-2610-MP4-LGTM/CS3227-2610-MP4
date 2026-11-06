---
name: sdd-plan
description: Derive PLAN tasks and proposed routes for an approved feature issue when its task is missing. Does not coordinate execution or write specs.
---

# Plan

Read PRODUCT-SPEC section 3 (Story index) and relevant section 4 (Product
decisions); story files named by the issue; TECHNICAL-SPEC SYS headings and
AI-SECURITY-SPEC SEC headings, then only the sections cited by the issue;
INTEGRATION-SPEC section 1 (Scope and contract conventions) and needed
subsections; current PLAN, package.json and the src/ tree.

Check issue citations against approved base-branch IDs. Use the task format
and capacity rules in [PLAN](../../../workflow/PLAN.md); preserve existing
tasks. Assign unused T-nn IDs and exact Reads headings/story paths. Propose a
route using [orchestration](../sdd-orchestrate/SKILL.md#routes), test layers
and dependencies. Name config paths if implementation needs them. Never
invent requirements or create issues; list missing issues for the human.

If scope cannot fit the budget or one implementer run, stop with a blocked
summary and a suggested rescope instead of adding tasks. Check the final diff
contains only the permitted file and all fields are filled.
