#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='5aaf6d62-f9f2-4f47-a61b-e3d735835309' && export SISYPHUS_AGENT_ID='agent-013' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/prompts/agent-013-plugin" --agent 'sisyphus:operator' --session-id "858b3721-8720-4fe6-8c78-4776638abd35" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:companion validate-tui-operator c9' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/prompts/agent-013-system.md')" 'Validate the sisyphus TUI companion integration. Steps:

1. Open the sisyphus TUI by switching to the '\''sisyphus'\'' tmux session (it should already be running).
2. Take a screenshot of the TUI to verify the companion is pinned to the bottom of the tree panel (left side). You should see a face like (>.<) and a boulder character.
3. Press space (leader key), then c to open the companion overlay. Take a screenshot to verify it shows: face, level/title, mood, XP, stats (STR/END/WIS/LCK/PAT), and achievements section.
4. Press esc to close the overlay.
5. Report what you see with evidence (screenshots, accessibility tree dumps).

The TUI runs in the tmux session named '\''sisyphus'\''. Switch to it via: tmux switch-client -t sisyphus

Key info:
- Leader key is space (press space, then a letter)
- The companion overlay is opened with leader+c (space, then c)
- The companion should show at the bottom of the left tree panel
- Expected face for '\''grinding'\'' mood: (>.<)'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2417