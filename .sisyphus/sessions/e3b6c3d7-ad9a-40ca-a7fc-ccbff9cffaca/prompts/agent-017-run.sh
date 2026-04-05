#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-017' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-017-plugin" --agent 'sisyphus:explore' --session-id "a65ddd1a-2eab-48fb-9386-6046fd9d2056" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing adversarial-tmux-explore c11' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-017-system.md')" 'You'\''re brainstorming adversarial but REALISTIC integration test scenarios for sisyphus — a tmux-based multi-agent orchestrator.

YOUR ANGLE: tmux configuration conflicts and preexisting sessions.

Real users have:
- Preexisting tmux sessions with custom names that might collide with ssyph_ prefix
- Custom tmux.conf with aggressive settings (mouse mode, custom key bindings, changed prefix key, status bar plugins like powerline/tmux-resurrect)
- tmux running inside tmux (nested sessions)
- tmux versions that differ (old distro packages vs homebrew latest)
- TPM (tmux plugin manager) installed with plugins that hook into session creation
- Custom TMUX_TMPDIR or socket paths
- tmux sessions with spaces or special characters in names
- Screen (not tmux) users who have both installed
- Users who kill tmux server while sisyphus sessions are running
- Users who manually rename/kill ssyph_ windows/panes

Think about what ACTUALLY breaks. Not theoretical — things a real developer would hit.

Save your findings to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/brainstorm-tmux-adversarial.md

Format: List each scenario with:
- **Scenario name**
- **What the user does** (realistic setup)
- **What breaks** (specific failure mode)
- **How to test it** (concrete test steps in Docker)
- **Tier**: which Docker tier can test this (base/tmux/full)'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2452