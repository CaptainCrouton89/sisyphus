#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='5aaf6d62-f9f2-4f47-a61b-e3d735835309' && export SISYPHUS_AGENT_ID='agent-001' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/prompts/agent-001-plugin" --agent 'sisyphus:explore' --session-id "b8dd1c59-c82d-46c4-984b-bcd40eca25dd" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:companion explore-integration-explore c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/prompts/agent-001-system.md')" 'Explore all integration surfaces for the Companion system. Save findings to context/explore-companion-integration.md.

The Companion is a persistent ASCII character that will be integrated into sisyphus. I need you to explore and document the EXACT integration points — function signatures, call sites, data available at each hook — for these areas:

1. **session-manager.ts hooks**: Find the exact locations in startSession(), handleComplete(), handleSpawn(), handlePaneExited() where companion hooks should be inserted. Document what data is available at each point (session object, agent info, etc.).

2. **pane-monitor.ts poll cycle**: Find where mood recompute and flash expiry would fit in the poll loop. Document the poll interval, what data is available, how writeStatusBar() is called.

3. **status-bar.ts**: Find exactly where companion rendering would be appended to the status bar output. Document the rendering pipeline and how to add a companion section.

4. **TUI tree panel** (src/tui/panels/tree.ts): Find where the companion would be pinned to the bottom of the tree. Document the rendering pattern, available width, how content is positioned.

5. **TUI overlays** (src/tui/panels/overlays.ts): Find how the help overlay works so we can add a companion overlay triggered by leader key '\''c'\''. Document the overlay pattern.

6. **TUI input** (src/tui/input.ts): Find where leader key options are registered so we can add '\''c'\'' for companion.

7. **Agent type** (shared/types.ts): Confirm there'\''s no nickname field on Agent yet — we need to add one.

8. **Existing companion infra**: Document what companion-context.ts and openCompanionPane() already do.

For each integration point, provide:
- File path and line numbers
- Function signature
- What data is available
- Where exactly the new code should be inserted
- Any constraints or patterns to follow'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2372