#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export SISYPHUS_AGENT_ID='agent-005' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort high --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-005-plugin" --agent 'sisyphus:research-lead' --session-id "4658e387-ef84-487b-a625-9183cc03840a" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:generate-authoring-skills research-tools-research-lead c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-005-system.md')" 'Research the topic: **Tool Design for LLM Agents — Descriptions, Parameters, Schemas, and Composition**

This research will be used to write an authoring skill (instructional reference material for prompt engineers designing tool interfaces). Focus on practical, evidence-backed knowledge.

## What to research

1. **How models select tools**: what signals drive tool selection — description quality, parameter names, schema structure. Any papers or benchmarks on tool selection accuracy.
2. **Description writing**: best practices for tool descriptions that models parse correctly. Front-loading, disambiguation, negative examples.
3. **Parameter design**: naming conventions, enum vs free-text, required vs optional, nested objects. What schema patterns models handle well.
4. **Error message design**: how error messages affect model recovery. Structured errors vs string errors. Self-correction patterns.
5. **Tool granularity**: focused vs composite tools, the "action parameter" anti-pattern, when to merge vs split.
6. **MCP (Model Context Protocol)**: Anthropic'\''s protocol for tool serving. Design patterns, adoption, practical considerations.
7. **Tool composition**: pagination, prerequisite chains, output-as-input patterns. How to design tools that work well together.
8. **Benchmarks**: ToolBench, API-Bank, Gorilla — what do they tell us about tool design?

## Sources to find
- Papers: ToolBench, Gorilla, API-Bank, tool-use benchmarks
- Anthropic MCP documentation and blog posts
- OpenAI function calling documentation and cookbook
- Practitioner blog posts on tool design
- Twitter/X threads from people building agent tool systems
- Reddit/HN discussions on function calling gotchas

## Output
Save to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-tool-design.md

Structure: Key Findings → Tool Selection Mechanics (with citations) → Description Best Practices → Parameter Design → Error Handling → Granularity Guidelines → MCP Patterns → Benchmarks → Notable Sources (with URLs)'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %241