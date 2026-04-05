#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export SISYPHUS_AGENT_ID='agent-013' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort high --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-013-plugin" --agent 'sisyphus:review' --session-id "0c6a8021-b268-4ec5-9999-874d3a7cff47" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:generate-authoring-skills review-skills-review c3' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-013-system.md')" 'Review all 12 skill files (6 SKILL.md + 6 reference.md) in /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/ for the following skills:
- multi-agent-orchestration
- system-vs-user-prompt  
- structured-output
- context-management
- tool-design
- eval-and-quality-gates

Compare against the existing style targets:
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/output-variety/SKILL.md (134 lines)
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/output-variety/reference.md (261 lines)
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/prompting-effectively/SKILL.md (289 lines)
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/prompting-effectively/reference.md (447 lines)

Review criteria:
1. **Voice/tone consistency**: Do all 12 files match the practitioner voice in output-variety and prompting-effectively? Direct, opinionated, evidence-backed. No hedging or filler.
2. **Format consistency**: SKILL.md files have YAML frontmatter with `name` and `description`. reference.md files do NOT have frontmatter (check this). Links between SKILL.md ↔ reference.md work.
3. **Citation quality**: Do major claims have inline citations? Are citations formatted as "[Author (Year) — Title](URL)" or similar? Spot-check 3-5 URLs across different skills to see if they point to real resources.
4. **Code example quality**: Are code examples in reference.md realistic (not toy)? Do TypeScript examples use modern patterns? Do Python examples look correct?
5. **Content density**: Is there filler or padding? Are sections earning their space?
6. **Cross-skill coherence**: When skills reference each other (e.g. system-vs-user-prompt → prompting-effectively), are the references valid? Are there obvious missing cross-references that should exist?
7. **Factual spot-check**: Pick 3-4 specific quantitative claims across different skills and verify they match the cited source. E.g., "85% agreement" from Zheng et al., the "20x compression" from LLMLingua, the "+81% improvement" from Google Research.

Report format: One section per review criterion. For each, state verdict (PASS/MINOR/MAJOR) and list specific findings with file paths. If a finding is MAJOR, explain exactly what'\''s wrong and why it matters. If MINOR, note it but don'\''t inflate severity.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %256