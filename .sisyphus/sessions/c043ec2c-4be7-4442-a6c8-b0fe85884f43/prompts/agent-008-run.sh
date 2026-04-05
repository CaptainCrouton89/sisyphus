#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export SISYPHUS_AGENT_ID='agent-008' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-008-plugin" --agent 'devcore:programmer' --session-id "dda6e0c5-401a-49cc-8ef1-7f82ac8abbcf" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:generate-authoring-skills write-sysprompt-devcore:programmer c2' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-008-system.md')" '/authoring:skills /authoring:prompting-effectively

Write SKILL.md and reference.md for the system-vs-user-prompt authoring skill.

## Inputs to Read

1. Research report: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-system-vs-user-prompt.md
2. Format spec: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/format-reference.md
3. Style target SKILL.md: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/output-variety/SKILL.md
4. Style target reference.md: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/output-variety/reference.md
5. Second style target: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/prompting-effectively/SKILL.md
6. Second style target reference: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/prompting-effectively/reference.md

Read ALL of these before writing anything. Note: an existing SKILL.md exists at the output path — REPLACE it entirely with fresh research-backed content.

## Output Files

Write to:
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/system-vs-user-prompt/SKILL.md (~150-200 lines)
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/system-vs-user-prompt/reference.md (~150-250 lines)

## SKILL.md Requirements

- YAML frontmatter: `name: system-vs-user-prompt`, `description:` with trigger keywords (e.g. "system prompt", "user prompt", "prompt placement", "API calls", "system message")
- Overview: the cognitive model — system prompt as identity/constraints, user messages as task/context/state
- Practical sections: what belongs where (with concrete examples), why placement matters mechanically (attention, position effects), multi-turn degradation, caching implications
- Link to reference.md for depth
- Cite Liu et al. (2023) Lost in the Middle, OpenAI Instruction Hierarchy (2024), provider caching differences

## reference.md Requirements

- API patterns for Anthropic and OpenAI (code examples showing correct placement)
- Prompt caching patterns: how placement affects cache hits (Anthropic 90% discount, OpenAI 50%)
- Security implications: system prompt as defense layer, injection attack patterns
- Multi-turn degradation data and mitigation strategies
- Good/bad examples showing common mistakes and their fixes
- Every major claim cited from research report

## Voice & Quality

Same as other skills: practitioner voice, direct, opinionated, evidence-grounded. No fluff. Cite specific numbers. The existing SKILL.md at the path is 300+ lines — the new one must be 150-200 lines by pushing detail into reference.md.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %246