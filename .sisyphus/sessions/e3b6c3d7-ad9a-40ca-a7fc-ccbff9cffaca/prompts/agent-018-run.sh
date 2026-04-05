#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-018' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-018-plugin" --agent 'sisyphus:explore' --session-id "acb05c72-ee73-47ae-afdb-6c0e546c3359" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing adversarial-plugins-explore c11' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-018-system.md')" 'You'\''re brainstorming adversarial but REALISTIC integration test scenarios for sisyphus — a tmux-based multi-agent orchestrator.

YOUR ANGLE: Plugin resolution, agent types, and command setup.

Sisyphus resolves agent types from multiple locations:
- .claude/agents/{name}.md (project-local)
- ~/.claude/agents/{name}.md (user-global)  
- Bundled sisyphus:{name} types
- Claude Code plugins (~/.claude/plugins/)

Real users have:
- Custom agent type files that shadow bundled ones (intentionally or accidentally)
- Agent type files with malformed YAML frontmatter
- Agent type files that reference nonexistent models or skills
- Missing .claude/ directory entirely
- Stale agent type files from old versions with incompatible frontmatter fields
- `sisyphus setup` run multiple times (idempotent? overwrites custom changes?)
- `sisyphus spawn --list-types` when plugins dir has broken symlinks
- Agent types with special characters in names
- Permissions issues on .claude/agents/ or ~/.claude/agents/

Also think about `sisyphus setup` — it creates slash command files under ~/.claude/commands/sisyphus/. What if:
- The user already has custom commands there
- The directory is a symlink
- Permissions are wrong

Save your findings to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/brainstorm-plugins-adversarial.md

Format: List each scenario with:
- **Scenario name**
- **What the user does**
- **What breaks**
- **How to test it** (concrete steps in Docker)
- **Tier**: which Docker tier can test this'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2453