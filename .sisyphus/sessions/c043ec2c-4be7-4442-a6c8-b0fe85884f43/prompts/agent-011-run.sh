#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export SISYPHUS_AGENT_ID='agent-011' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-011-plugin" --agent 'devcore:programmer' --session-id "474e1da6-6b09-47d5-8856-413113d6cc10" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:generate-authoring-skills write-tools-devcore:programmer c2' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-011-system.md')" '/authoring:skills /authoring:prompting-effectively

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

The existing SKILL.md is 315 lines — the new one must be 150-200 lines. Push detail to reference.md. Practitioner voice. Cite specific numbers. The biggest failure mode is NOT calling a tool when needed (36.8%) — this should drive the emphasis on description quality.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %250