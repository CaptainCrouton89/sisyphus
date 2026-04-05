#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export SISYPHUS_AGENT_ID='agent-002' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort high --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-002-plugin" --agent 'sisyphus:research-lead' --session-id "52ab82ac-0299-42b9-bd9d-e6487663df8b" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:generate-authoring-skills research-system-user-research-lead c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-002-system.md')" 'Research the topic: **System Prompt vs User Prompt — Placement, Mechanics, and Best Practices**

This research will be used to write an authoring skill (instructional reference material for prompt engineers). Focus on evidence-backed knowledge about where instructions belong and why.

## What to research

1. **Mechanical differences**: how models treat system vs user content differently (attention patterns, positional encoding, instruction priority). Any papers or benchmarks measuring this.
2. **Prompt caching implications**: Anthropic'\''s prompt caching, OpenAI'\''s cached prompts — how placement affects cost and latency.
3. **Security/jailbreak angle**: system prompt as defense layer, user prompt injection attacks, how placement affects robustness.
4. **Multi-turn degradation**: "Lost in the Middle" (Liu et al. 2023) and related work on how instructions degrade over conversation length.
5. **Provider-specific behaviors**: differences between Anthropic, OpenAI, Google in how they handle system prompts.
6. **Practical guidelines**: what practitioners actually do — blog posts, threads about system prompt design.
7. **The "developer message" evolution**: OpenAI'\''s shift from system→developer messages, what it means.

## Sources to find
- Academic papers: "Lost in the Middle", attention pattern studies, prompt injection research
- Anthropic docs on system prompts, prompt caching
- OpenAI docs on system/developer messages
- Practitioner blogs and Twitter/X threads
- Reddit/HN discussions on prompt placement strategies

## Output
Save to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-system-vs-user-prompt.md

Structure: Key Findings → Mechanics & Evidence (with citations) → Practical Guidelines → Provider Differences → Common Mistakes → Notable Sources (with URLs)'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %238