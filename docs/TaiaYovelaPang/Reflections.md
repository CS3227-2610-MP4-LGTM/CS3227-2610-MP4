---
layout: default
title: TaiaYovelaPang
parent: Reflections
---

# Reflections: TaiaYovelaPang

[Back to team reflections](../Reflections.md)

<!--
HOW TO USE THIS FILE
- Write in the first person about work you did or watched closely.
- Each section has guiding questions in a comment. Answer the ones that
  apply, replace the PLACEHOLDER line with your prose, then delete the comment.
- Back each claim with evidence: a handoff in workflow/handoffs/, a session log
  in logs/TaiaYovelaPang/, a PR or issue number, or token numbers from
  workflow/scripts/rollout-summary.ts. The brief asks for "concrete examples
  backed by experiments and result analysis".
- Prefer one well-measured example over several vague ones.
-->

## 1. My role and features

<!--
PLACEHOLDER: Summarise the role (Learner / Author / TA) and features you owned,
the issues and PRs for them, and the route (low / standard / high) each took.

Guiding questions:
- Which role's feature set did you complete, and which team-level work did you
  take on (CI, deployment, specs, workflow tooling)?
- Which of your features used the SoC LLM, and what did the AI do in each?
-->

## 2. Multi-Agent SE

### 2.1 Designing the coordination pattern

<!--
PLACEHOLDER: Describe the pattern you used and why.

Guiding questions:
- How did sdd-orchestrate and the specialist agents (planner, test-writer,
  implementer, reviewer, security-reviewer, docs) divide the work for your
  features? Why that split rather than fewer or more agents?
- How did the human gates (G1 to G4) fit in? Which gate caught the most
  problems for you?
- How did you pick the route for a feature, and did you ever pick wrongly?
-->

### 2.2 Verifying the pattern was followed

<!--
PLACEHOLDER: Show how you checked triggering, context management, resource
sharing and handoffs.

Guiding questions:
- How did you confirm the right agent ran at the right stage, with only its
  assigned skill loaded?
- What evidence did you use: handoff files, the subagent summary block, session
  logs, rollout records?
- Did any agent skip a stage, read files outside its scope, or try to spawn
  another agent? How did you notice?
-->

### 2.3 Idle, overloaded or blocked agents

<!--
PLACEHOLDER: Give a concrete case where an agent sat idle, was overloaded or
was blocked waiting on another stage or a human gate.

Guiding questions:
- Which stage most often waited on a human gate, and for how long?
- Did any single agent (often the implementer) carry too much of a feature?
  What did you change?
- Did any feature hit `blocked` or `awaiting-decision`? What resolved it?
-->

### 2.4 Retries, repeated analysis and unnecessary tool calls

<!--
PLACEHOLDER: Quantify wasted work where you can.

Guiding questions:
- How many review / fix rounds did your features need? What caused each extra
  round?
- Did agents re-read the same specs or files across stages? How many tokens did
  that cost, according to rollout-summary?
- Which tool calls turned out unnecessary (repeated searches, full-file reads,
  re-running whole test suites instead of targeted tests)?
-->

### 2.5 Conflicts and disagreements between agents

<!--
PLACEHOLDER: Describe a disagreement and how it was resolved.

Guiding questions:
- Did the reviewer or security reviewer flag something the implementer or
  test-writer disputed? Who decided, and on what basis?
- Did an agent's output conflict with a spec, and which one did you treat as
  the source of truth?
- Did two features or two teammates' agents conflict over shared code (schema,
  the LLM boundary, shared components)?
-->

### 2.6 Did the benefits outweigh the costs?

<!--
PLACEHOLDER: Give your verdict with numbers.

Guiding questions:
- Compare one feature built through the full multi-agent route with a similar
  task done in a single session (or a low-route task): tokens, wall-clock time,
  defects found after merge.
- Which bugs or security issues did a separate reviewer catch that the
  implementer missed?
- What was the overhead of handoffs and gates?
-->

### 2.7 When to use multi-agent coordination, and when not

<!--
PLACEHOLDER: State your rule of thumb, drawn from the evidence above.

Guiding questions:
- Which tasks in this project were not worth multiple agents?
- Which kinds of tasks (auth, data boundaries, AI security, CI/deploy)
  benefited most?
- What would you change about the routes if you started again?
-->

## 3. Context Engineering

### 3.1 System prompts and skills

<!--
PLACEHOLDER: Explain how you wrote or changed AGENTS.md, the skills in
.agents/skills/ and the agent configs, and the effect.

Guiding questions:
- What did you put in AGENTS.md and what did you move into skills? Why?
- Show a before/after edit to a skill or prompt and what changed in agent
  behaviour.
- How did you keep the always-loaded context short?
-->

### 3.2 Upfront context vs retrieval on demand

<!--
PLACEHOLDER: Give examples of both, and when each worked better.

Guiding questions:
- Which information did agents need every time (rules, commands, secrets
  policy) and which only sometimes (spec sections, the Next.js docs in
  node_modules)?
- Did telling agents to "read only the sections your task names" help? How did
  you measure it?
-->

### 3.3 How context organisation affected instruction-following

<!--
PLACEHOLDER: Describe a case where the position, structure or wording of an
instruction changed whether the agent followed it.

Guiding questions:
- Were rules near the end of a long file ignored more often?
- Did tables, numbered rules or a fixed summary format help agents find and
  follow instructions?
- Did any agent follow an instruction found in data (an issue, a handoff, code
  under review)? How did the "data, not instructions" rule hold up?
-->

### 3.4 Handoffs and notes

<!--
PLACEHOLDER: Explain what a good handoff contains, using one of yours from
workflow/handoffs/ as the example.

Guiding questions:
- Which fields in workflow/templates/handoff.md did later agents actually use?
  Which were noise?
- Did a later agent or teammate ever redo work because a handoff left something
  out?
- What did adding token usage to the handoff change?
-->

### 3.5 When more context made an agent worse

<!--
PLACEHOLDER: Describe a case where extra context hurt, and the signals that
showed it.

Guiding questions:
- Did a long spec, a large diff or a full log make an agent drift, miss a rule
  or slow down?
- What were the signals: higher token count, repeated reads, wrong file edits,
  ignored criteria?
- What did you cut, and what happened afterwards?
-->

## 4. Resource-aware Use

### 4.1 Choosing and configuring models

<!--
PLACEHOLDER: Explain your choices of model and reasoning effort for agents
and for the app's SoC LLM calls.

Guiding questions:
- Which model and effort did each specialist agent use, and why? Did you try
  a cheaper or smaller one for any stage? What happened?
- For the app, why did you configure SoC LLM operations the way you did
  (reasoning effort, max tokens, structured output)?
-->

### 4.2 Reducing cache misses

<!--
PLACEHOLDER: Describe what you did and how much it saved.

Guiding questions:
- Did you keep stable content (AGENTS.md, skills) at the front of the prompt
  and changing content later?
- What were the cached vs uncached input tokens before and after a change?
- What caused cache misses (edited prompts, reordered context, long gaps
  between turns)?
-->

### 4.3 Reasoning tokens

<!--
PLACEHOLDER: For one specific task, report the share of tokens spent on
internal reasoning.

Guiding questions:
- Using rollout-summary (try its per-turn flag), what percentage of output
  tokens was reasoning for that task?
- Would persisting reasoning (in a handoff or notes) have saved a later agent
  from re-deriving it? Give an example.
-->

### 4.4 Monitoring and reducing token usage

<!--
PLACEHOLDER: List the approaches you tried and their measured effect.

Guiding questions:
- How did you monitor usage (rollout-summary, session logs, handoff token
  totals)?
- What did you try to reduce it (targeted tests, narrower file reads, shorter
  skills, lower effort, fewer review rounds)? What did each save?
-->

### 4.5 Which tasks used the most tokens

<!--
PLACEHOLDER: Rank your most expensive task types and say whether you reduced
them.

Guiding questions:
- Which stage cost the most for your features: implementation, review, test
  writing, or debugging?
- Did you bring that cost down? By how much, and at what cost to quality?
-->

### 4.6 Resource-aware use in the app

<!--
PLACEHOLDER: Explain how your features stay within the SoC LLM limits.

Guiding questions:
- How do your AI features handle the per-minute and per-day limits (rate
  limiting, budgets, caching results, error messages for users)?
- How did you test those guardrails without making live LLM calls?
-->

## 5. Experiments

<!--
PLACEHOLDER: Record at least one experiment you ran. Copy the table for more.

| Item | Detail |
| :- | :- |
| Question | e.g. Does a shorter reviewer skill reduce tokens without missing findings? |
| Setup | What you changed; what you held constant (task, model, effort) |
| Metric | e.g. total tokens, cached tokens, review rounds, findings caught |
| Result | Numbers before and after |
| Analysis | Why you think it happened, and limits of the comparison |
| Evidence | Links to logs, handoffs, PRs |
-->

## 6. Key takeaways

<!--
PLACEHOLDER: Three to five lessons you would carry to a future project, each
tied to evidence above.
-->
