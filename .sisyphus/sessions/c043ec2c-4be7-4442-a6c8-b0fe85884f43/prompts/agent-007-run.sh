#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export SISYPHUS_AGENT_ID='agent-007' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-007-plugin" --agent 'devcore:programmer' --session-id "20a032a6-69bb-43f9-8dc2-7dfb9780cd8d" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:generate-authoring-skills write-orchestration-devcore:programmer c2' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-007-system.md')" '/authoring:skills /authoring:prompting-effectively

Write SKILL.md and reference.md for the multi-agent-orchestration authoring skill.

## Inputs to Read

1. Research report: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-multi-agent-orchestration.md
2. Format spec: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/format-reference.md
3. Style target SKILL.md: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/output-variety/SKILL.md
4. Style target reference.md: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/output-variety/reference.md
5. Second style target: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/prompting-effectively/SKILL.md
6. Second style target reference: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/prompting-effectively/reference.md

Read ALL of these before writing anything.

## Output Files

Write to:
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/multi-agent-orchestration/SKILL.md (~150-200 lines)
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/multi-agent-orchestration/reference.md (~150-250 lines)

## SKILL.md Requirements

- YAML frontmatter: `name: multi-agent-orchestration`, `description:` with trigger keywords for discovery (e.g. "multi-agent", "orchestration", "parallel agents", "agent coordination")
- Overview explaining the core concept: when multi-agent helps vs hurts, the coordination cost tradeoff
- Practical sections: architecture patterns (fan-out, pipeline, hierarchical), when to split vs keep single-agent, common failure modes, scaling heuristics
- Link to reference.md for depth
- Match the tone exactly: practitioner voice, direct, opinionated, no fluff. State what works and what doesn'\''t.

## reference.md Requirements

- Implementation patterns with code examples (TypeScript preferred, Python acceptable)
- Research citations inline using format: "[Author (Year) — Title](URL)" or "Author'\''s Blog: [Title](URL)"
- Cover: orchestrator patterns, agent communication, failure handling, token budgeting, concrete examples of good vs bad decomposition
- Every major claim needs a source from the research report
- Code examples should be realistic, not toy

## Voice & Quality

- Write like a senior engineer sharing hard-won knowledge with peers
- No hedging ("it might be useful to consider...") — state what works
- No marketing speak or hype about AI agents
- Cite specific numbers from research (e.g. "+81% on parallelizable tasks, -70% on sequential", "41-86.7% failure rates in production")
- The research report has extensive citations — USE THEM. Every section should have at least one inline citation.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %245