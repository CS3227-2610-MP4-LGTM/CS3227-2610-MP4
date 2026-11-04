# Spec conventions

LGTM is spec-anchored: a merged spec PR is approval for the specified behavior.
Code must never move ahead of its spec. Changes follow **spec PR →
`workflow/PLAN.md` → tests → code**. Specs contain requirements and decisions,
with a one-line reason only for a decision that is not obvious. They carry no
owners, statuses or open questions.

## One home per fact

Each fact has one authoritative home. Refer to another spec or section instead
of restating it. This directory initially contains this README and
[TECHNICAL-SPEC.md](TECHNICAL-SPEC.md); the other documents below are named
without links until they exist.

| Document | Owns |
| --- | --- |
| `README.md` | Spec conventions and document boundaries. |
| `PRODUCT-SPEC.md` | Product, roles, product-level UI, and a story index per role plus shared account stories. Each index entry has an ID, one-line story, priority and whether it uses AI. |
| `stories/<ID>-<slug>.md` | Exactly one story: requirement, acceptance criteria, use cases, edge cases and UI notes. |
| [TECHNICAL-SPEC.md](TECHNICAL-SPEC.md) | Architecture, authentication and authorization mechanisms, data ownership, environments and delivery, and non-functional requirements. |
| `INTEGRATION-SPEC.md` | Domain data model, API contracts, LLM input/output schemas and shared seed data. |
| `AI-SECURITY-SPEC.md` | AI attack surfaces, controls, usage limits and security tests. |
| `workflow/PLAN.md` | Implementation tasks derived from approved specs. |

## Identifiers

| Form | Allocation and definition |
| --- | --- |
| `SYS-nn` | Allocated and defined only in `TECHNICAL-SPEC.md`. |
| `ACC-nn`, `LRN-nn`, `AUT-nn`, `TA-nn` | Allocated only in `PRODUCT-SPEC.md`'s shared account or corresponding role story index. Each story file defines exactly its one allocated ID. |
| `SEC-nn` | Allocated and defined only in `AI-SECURITY-SPEC.md`. |
| `<ID>.n` | Acceptance criterion for that requirement or story. |
| `UC-<ID>-n` | Use case for that requirement or story. |
| `ASM-nn` | Assumption, numbered independently within each file. |

IDs become permanent when the spec PR that introduces them merges.
Never reuse or renumber an ID. A removed requirement retains its ID and is
marked **removed**; references must still resolve to that entry.

## Reading and verification

An agent reads only the story file and the spec sections named by its task,
never the whole spec set. Tasks must name the sections they depend on.

Requirements state what must hold and acceptance criteria state how it is
checked. Specify observable behavior and decisions, not implementation steps
or lists of files to write. User journeys and screen behavior belong in stories;
shared mechanisms belong in the technical spec.
