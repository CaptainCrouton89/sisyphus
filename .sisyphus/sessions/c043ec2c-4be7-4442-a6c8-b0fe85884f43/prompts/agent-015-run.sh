#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export SISYPHUS_AGENT_ID='agent-015' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-015-plugin" --agent 'sisyphus:explore' --session-id "a1bfb459-7b08-450c-adf9-25659495f25a" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:generate-authoring-skills fix-crossrefs-explore c4' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-015-system.md')" 'Add missing cross-references between skill files. This is a MINOR review finding — 4 cross-references would improve navigation between related skills.

## Files Location
All skill files are at `/Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/{skill-name}/`

## Cross-References to Add

1. **context-management ↔ system-vs-user-prompt**: Both discuss caching implications of content placement.
   - In context-management/SKILL.md, in the "Caching" section (~line 82-98), add a brief note: "See also [system-vs-user-prompt](../system-vs-user-prompt/SKILL.md) for how prompt slot placement affects cache hit rates."
   - In system-vs-user-prompt/SKILL.md, wherever it discusses caching, add: "See also [context-management](../context-management/SKILL.md) for comprehensive caching strategies."

2. **structured-output ↔ tool-design**: Both discuss schema design.
   - In tool-design/SKILL.md, where it discusses strict mode schemas (~line 59), add: "See [structured-output](../structured-output/SKILL.md) for schema design principles."
   - In structured-output/SKILL.md, in the schema design section, add: "These patterns apply directly to [tool-design](../tool-design/SKILL.md) — tool schemas are structured output schemas."

3. **multi-agent-orchestration → eval-and-quality-gates**: Multi-agent discusses debate/critic patterns and review.
   - In multi-agent-orchestration/SKILL.md, in the section about debate/critic patterns or review (~line 63-83), add: "For detailed judge methodology, see [eval-and-quality-gates](../eval-and-quality-gates/SKILL.md)."

4. **multi-agent-orchestration → context-management**: Multi-agent discusses token budgets.
   - In multi-agent-orchestration/reference.md, in the token budgets section (~line 196-209), add: "For comprehensive context strategies, see [context-management](../context-management/SKILL.md)."

## Guidelines
- Keep cross-references brief — one sentence each
- Place them naturally within existing sections, not as a separate "See Also" block
- Match the existing voice (direct, no fluff)
- Read the actual sections before adding — find the most natural insertion point'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %261