# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: c043ec2c-4be7-4442-a6c8-b0fe85884f43
- **Your Task**: /authoring:skills /authoring:prompting-effectively

Write SKILL.md and reference.md for the tool-design authoring skill.

## Inputs to Read

1. Research report: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-tool-design.md
2. Format spec: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/format-reference.md
3. Style target SKILL.md: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/output-variety/SKILL.md
4. Style target reference.md: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/output-variety/reference.md
5. Second style target: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/prompting-effectively/SKILL.md
6. Second style target reference: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/prompting-effectively/reference.md

Read ALL of these before writing anything. Note: an existing SKILL.md exists at the output path — REPLACE it entirely with fresh research-backed content.

## Output Files

Write to:
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/tool-design/SKILL.md (~150-200 lines)
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/tool-design/reference.md (~150-250 lines)

## SKILL.md Requirements

- YAML frontmatter: `name: tool-design`, `description:` with trigger keywords (e.g. "tool design", "function calling", "MCP", "tool interface", "agent tools", "tool descriptions")
- Overview: tools are prompt engineering — descriptions are the interface, not the schema
- Practical sections: description writing (the #1 lever), parameter design, error handling for recovery, granularity decisions, tool count vs accuracy tradeoffs, composition patterns
- Link to reference.md for depth
- Key insight: description quality matters more than anything else (cite Anthropic + OpenAI findings)

## reference.md Requirements

- Tool definition examples: MCP format, Anthropic format, OpenAI format
- Description patterns: good vs bad with before/after examples
- Parameter schema patterns: enums, nested objects, input_examples (72%→90% accuracy)
- Error message design patterns for LLM recovery
- Benchmark data: API-Bank error distribution (36.8% no-call, 23.7% format, 15.9% hallucination)
- Tool count scaling data and mitigation strategies
- Cite Gorilla, BFCL v4, API-Bank, ToolACE, Natural Language Tools paper

## Voice & Quality

The existing SKILL.md is 315 lines — the new one must be 150-200 lines. Push detail to reference.md. Practitioner voice. Cite specific numbers. The biggest failure mode is NOT calling a tool when needed (36.8%) — this should drive the emphasis on description quality.

## Reports

Reports are non-terminal — you keep working after sending them. Use `sisyphus report` to flag things the orchestrator needs to know about:

- **Code smells** — unexpected complexity, unclear architecture, code that seems wrong
- **Out-of-scope issues** — failing tests, missing error handling, broken assumptions
- **Blockers** — anything preventing you from completing your task

Report problems rather than working around them — the orchestrator can route these to the right agent. Stay focused on your task.

```bash
echo "src/auth.ts:45 — session token not refreshed on redirect, circular dep between auth and session modules" | sisyphus report
```

## Finishing

When done, submit your final report via the CLI. This is terminal — your pane closes after.

```bash
echo "your full report here" | sisyphus submit
```

If you're blocked by ambiguity, contradictions, or unclear requirements — **don't guess**. Submit what you found instead. A clear report is more valuable than a wrong implementation.

## The User

A human may interact with you directly in your pane — if they do, prioritize their input over your original instruction. Otherwise, communicate through the orchestrator via reports. 

## Guidelines

- Always include exact file paths and line numbers in reports and submissions
- Flag unexpected findings rather than making assumptions. Do not tackle work outside of your task—instead report it.
