#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export SISYPHUS_AGENT_ID='agent-010' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-010-plugin" --agent 'devcore:programmer' --session-id "8fd3ece3-6879-432c-93c0-503b68079623" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:generate-authoring-skills write-context-devcore:programmer c2' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-010-system.md')" '/authoring:skills /authoring:prompting-effectively

Write SKILL.md and reference.md for the context-management authoring skill.

## Inputs to Read

1. Research report: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-context-management.md
2. Format spec: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/format-reference.md
3. Style target SKILL.md: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/output-variety/SKILL.md
4. Style target reference.md: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/output-variety/reference.md
5. Second style target: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/prompting-effectively/SKILL.md
6. Second style target reference: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/prompting-effectively/reference.md

Read ALL of these before writing anything.

## Output Files

Write to:
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/context-management/SKILL.md (~150-200 lines)
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/context-management/reference.md (~150-250 lines)

## SKILL.md Requirements

- YAML frontmatter: `name: context-management`, `description:` with trigger keywords (e.g. "context window", "token budget", "RAG", "context management", "long context", "retrieval")
- Overview: the attention economics model — context is a finite budget, placement matters, more isn'\''t always better
- Practical sections: token budgeting splits, placement effects (Lost in the Middle), compression tradeoffs, caching strategies, multi-turn management, when RAG helps vs hurts
- Link to reference.md for depth
- Key surprises: observation masking > LLM summarization (JetBrains), 2x compressed can beat uncompressed (CompLLM), HyDE hurts factoid queries

## reference.md Requirements

- Token budget allocation patterns with concrete percentages
- RAG implementation patterns: chunking strategies (cite NVIDIA benchmark), hybrid search, re-ranking
- Compression techniques: LLMLingua (20x with 1.5% loss), extractive vs abstractive
- Caching patterns: Anthropic vs OpenAI with code examples showing cache-friendly design
- Multi-turn management: observation masking, summarization, compaction strategies
- Cite Liu et al. (2023), ARAGOG, RULER benchmark, JetBrains study, Factory.ai patterns

## Voice & Quality

Practitioner voice. Surprising findings matter more than obvious advice. Cite specific numbers. Code examples should show real patterns (cache partitioning, token counting, retrieval pipelines).'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %248