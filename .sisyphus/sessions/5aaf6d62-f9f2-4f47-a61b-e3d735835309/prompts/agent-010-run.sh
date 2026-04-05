#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='5aaf6d62-f9f2-4f47-a61b-e3d735835309' && export SISYPHUS_AGENT_ID='agent-010' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort high --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/prompts/agent-010-plugin" --agent 'sisyphus:review' --session-id "8366cfe0-63af-4200-8bba-97f398ca42dd" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:companion review-integration-review c5' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/prompts/agent-010-system.md')" 'Review the companion system integration changes across 16 modified files.

**Session goal**: Implement a persistent ASCII companion character for sisyphus with XP, leveling, mood, achievements, rendering, and commentary.

**What to review**: The Phase 2 integration changes — wiring the companion modules (already built and tested) into daemon hooks, CLI command, TUI panels, and status bar.

**Changed files (integration layer)**:
- src/daemon/session-manager.ts — companion hooks at start/complete/spawn/crash
- src/daemon/pane-monitor.ts — mood recomputation on poll cycle
- src/daemon/status-bar.ts — companion face+boulder in tmux status, flash state
- src/daemon/server.ts — companion protocol handler
- src/cli/commands/companion.ts — `sisyphus companion` profile command (NEW)
- src/cli/index.ts — companion command registration
- src/shared/protocol.ts — companion request type
- src/shared/types.ts — minor change
- src/shared/paths.ts — companionPath() (already existed)
- src/tui/app.ts — companion overlay rendering
- src/tui/input.ts — leader+c keybinding, companion-overlay mode handling
- src/tui/panels/overlays.ts — companion overlay renderer (NEW addition)
- src/tui/panels/tree.ts — companion pinned to tree panel bottom
- src/tui/state.ts — companion-overlay InputMode

**Core modules (already built, for reference)**:
- src/daemon/companion.ts — state management, XP/leveling, mood, achievements
- src/shared/companion-render.ts — pure rendering
- src/daemon/companion-commentary.ts — Haiku commentary generation
- src/shared/companion-types.ts — type definitions

**Known issues to validate** (confirm or dismiss):
1. Cross-layer imports: TUI and CLI import `loadCompanion()` and `ACHIEVEMENTS` from `src/daemon/companion.ts`. This violates the architecture where TUI/CLI should not import daemon modules. Assess whether these symbols should move to shared/.
2. Duplicated fire-and-forget commentary pattern in session-manager.ts — the same load→mutate→save→flash pattern is repeated 4-5 times.
3. `loadCompanion()` in tree.ts reads from disk on every render frame — no caching.
4. `recentRestarts` in pane-monitor mood signals is always 0 (initialized but never populated).

**Review dimensions**:
- Code reuse: existing patterns duplicated or missed
- Code quality: fire-and-forget safety, error handling, pattern compliance
- Correctness: race conditions in async commentary callbacks, mood signal accuracy
- Efficiency: unnecessary I/O, missed caching opportunities

Reference context/plan-companion.md for the intended architecture and module boundaries.
Reference context/explore-companion-integration.md for the integration surface.
Reference the layer-specific CLAUDE.md files (src/daemon/CLAUDE.md, src/tui/CLAUDE.md, src/cli/CLAUDE.md) for conventions.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2394