#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export SISYPHUS_AGENT_ID='agent-001' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort high --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-001-plugin" --agent 'sisyphus:research-lead' --session-id "ec734e9d-087b-41ff-8a2d-4bd955cfa996" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:generate-authoring-skills research-orchestration-research-lead c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-001-system.md')" 'Research the topic: **Multi-Agent Orchestration for LLMs**

This research will be used to write an authoring skill (instructional reference material for prompt engineers building multi-agent systems). Focus on practical, evidence-backed knowledge.

## What to research

1. **Orchestration patterns**: hub-and-spoke, pipeline, debate/critic, hierarchical delegation. What works in production?
2. **Agent communication**: how agents share context, hand off work, resolve conflicts. Message passing vs shared state.
3. **Failure modes**: cascading errors, context pollution between agents, coordination overhead, agents fighting each other.
4. **Practical frameworks**: LangGraph, CrewAI, AutoGen, Anthropic'\''s multi-agent patterns, OpenAI Swarm. What design decisions did they make and why?
5. **Prompt design for orchestrators vs workers**: how system prompts differ for coordinator agents vs task agents.
6. **Scaling considerations**: when to use multi-agent vs single agent, diminishing returns, cost/latency tradeoffs.

## Sources to find
- Academic papers (arXiv, Semantic Scholar)
- Anthropic'\''s documentation and blog posts on multi-agent patterns
- OpenAI cookbook / blog posts
- Practitioner blog posts (Simon Willison, Swyx, etc.)
- Twitter/X threads from AI engineers
- Reddit r/LocalLLaMA, r/MachineLearning, r/ClaudeAI discussions
- Hacker News discussions

## Output
Save a structured research report to:
/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-multi-agent-orchestration.md

Structure: Key Findings → Patterns & Techniques (with citations) → Common Mistakes → Notable Sources (with URLs) → Code/Config Examples from real systems'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %237