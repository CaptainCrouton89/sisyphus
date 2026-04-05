#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export SISYPHUS_AGENT_ID='agent-009' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-009-plugin" --agent 'devcore:programmer' --session-id "4da009c6-584b-450b-9bfe-72c57e58d30c" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:generate-authoring-skills write-structured-devcore:programmer c2' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-009-system.md')" '/authoring:skills /authoring:prompting-effectively

Write SKILL.md and reference.md for the structured-output authoring skill.

## Inputs to Read

1. Research report: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-structured-output.md
2. Format spec: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/format-reference.md
3. Style target SKILL.md: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/output-variety/SKILL.md
4. Style target reference.md: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/output-variety/reference.md
5. Second style target: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/prompting-effectively/SKILL.md
6. Second style target reference: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/prompting-effectively/reference.md

Read ALL of these before writing anything.

## Output Files

Write to:
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/structured-output/SKILL.md (~150-200 lines)
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/structured-output/reference.md (~150-250 lines)

## SKILL.md Requirements

- YAML frontmatter: `name: structured-output`, `description:` with trigger keywords (e.g. "structured output", "JSON schema", "Zod", "Pydantic", "constrained decoding", "typed responses")
- Overview: what constrained decoding is and why it matters — the model isn'\''t post-processing, it'\''s grammar-guided token masking
- Practical sections: schema design principles (the #1 lever), the reasoning field trick, provider patterns, type-system → schema → validate → retry loop, common failure modes
- Link to reference.md for depth
- Key insight: structured output can degrade reasoning quality (cite Tam et al. 2024), but schema design mitigates it

## reference.md Requirements

- Code examples: Zod + Anthropic SDK, Zod + OpenAI SDK, Pydantic + Instructor, Vercel AI SDK patterns
- Schema design patterns: good vs bad field names, flattening, reasoning-first ordering
- Provider comparison: Anthropic vs OpenAI vs open-source constraints and limits
- Streaming structured output: partial-json parsers, O(n²) reparse trap
- Failure mode catalog with mitigations
- Cite PARSE paper (2025), Let Me Speak Freely (Tam 2024), Outlines (Willard & Louf 2023), XGrammar

## Voice & Quality

Practitioner voice. No fluff. Cite specific numbers (e.g. "26-32 point accuracy drops", "95%→4.5% from ambiguous field names", "33%→92% with reasoning field"). Code examples must be production-realistic, not toy snippets.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %247