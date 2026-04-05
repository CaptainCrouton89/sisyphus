#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export SISYPHUS_AGENT_ID='agent-014' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-014-plugin" --agent 'sisyphus:explore' --session-id "8ddf881e-80ac-4f8f-9b71-6513b0429970" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:generate-authoring-skills fix-llmlingua-explore c4' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-014-system.md')" 'Fix the LLMLingua citation in context-management skill files. This is a MAJOR review finding — three-way mismatch between claim, paper name, and URL.

## The Problem

Three files have interrelated LLMLingua citation issues:

1. **SKILL.md line 71**: Says "LLMLingua (Microsoft Research, ACL 2024) achieves 20x compression with ~1.5% quality loss on reasoning tasks"
   - Problem: The 20x figure is from original LLMLingua (EMNLP 2023), NOT LLMLingua-2 (ACL 2024). LLMLingua-2 reports 2x-5x compression.

2. **reference.md line 162**: Code comment says `# rate=0.05 # 20x compression: 1.5% accuracy loss on GSM8K/BBH`
   - Problem: The code uses `use_llmlingua2=True` (LLMLingua-2 library), but the 20x claim is from original LLMLingua

3. **reference.md line 250**: Citation table says `LLMLingua-2` with URL `https://aclanthology.org/2024.acl-long.91/`
   - Problem: That URL resolves to LongLLMLingua (a different paper). The correct LLMLingua-2 paper is arxiv 2403.12968

## What To Fix

Files are at `/Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/context-management/`

### SKILL.md line 71
Change to accurately describe LLMLingua-2'\''s capabilities. Something like: "LLMLingua-2 (Microsoft Research, ACL 2024) achieves 2x–5x compression with minimal quality loss. At aggressive settings (rate=0.05), the original LLMLingua (EMNLP 2023) demonstrated up to 20x compression with ~1.5% accuracy loss on reasoning benchmarks."

Keep it concise — this is a SKILL.md overview, not a deep dive.

### reference.md lines 149-165
The code example is fine (uses LLMLingua-2 library). Fix the comment at line 162:
`# rate=0.05 # 20x — original LLMLingua (EMNLP 2023); LLMLingua-2 sweet spot is 2x–5x`

### reference.md line 250 (citation table)
Split into two rows:
- Original LLMLingua (EMNLP 2023): URL https://arxiv.org/abs/2310.05736 — up to 20x compression
- LLMLingua-2 (ACL 2024): URL https://arxiv.org/abs/2403.12968 — 2x-5x compression, 3-6x faster

## Verification
After making edits, use WebSearch or WebFetch to verify:
- https://arxiv.org/abs/2310.05736 is the original LLMLingua paper
- https://arxiv.org/abs/2403.12968 is LLMLingua-2

Keep the same voice/tone as the rest of the file. Don'\''t add unnecessary words.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %260