#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-019' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-019-plugin" --agent 'sisyphus:explore' --session-id "30ab2c44-50a2-4db3-a837-ac872d290d1d" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing adversarial-tui-explore c11' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-019-system.md')" 'You'\''re brainstorming adversarial but REALISTIC integration test scenarios for sisyphus — a tmux-based multi-agent orchestrator.

YOUR ANGLE: TUI, NvimBridge, and terminal rendering.

The TUI uses:
- Raw ANSI cursor rendering with frame-buffer diffing (no React/Ink)
- node-pty + @xterm/headless for NvimBridge — embeds a live neovim instance
- Terminal size detection and resize handling

Real users have:
- LazyVim/AstroNvim/NvChad/kickstart.nvim as their neovim config — these download plugins on first launch
- Neovim configs that produce output on startup (plugin update notifications, deprecation warnings)
- VERY old neovim versions (0.7, 0.8) or bleeding edge nightly
- No neovim installed at all — TUI should degrade gracefully
- Tiny terminal sizes (80x24 or smaller)
- Very large terminals (200+ columns)
- Terminal emulators that don'\''t support 256 colors or truecolor
- TERM env var set to dumb, xterm, xterm-256color, screen, etc.
- Users who resize their terminal while the TUI is running
- Locale/encoding issues (LANG=C vs UTF-8)
- node-pty prebuilds not having execute permission
- Users launching TUI from a non-interactive shell

Think about NvimBridge specifically — what happens when:
- Neovim crashes during the embedded session
- Neovim takes 30+ seconds to start (plugin downloads)
- User'\''s init.lua has syntax errors
- XDG_CONFIG_HOME is set to a nonstandard location

Save your findings to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/brainstorm-tui-adversarial.md

Format: List each scenario with:
- **Scenario name**
- **What the user does**
- **What breaks**
- **How to test it** (concrete steps in Docker)
- **Tier**: which Docker tier can test this'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2454