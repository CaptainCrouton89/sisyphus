Explored all 5 src/ subdirectories. Saved detailed findings to context/explore-src-layers.md covering:
- src/cli/ (25 files): Commander.js CLI with 25 commands, entry point → dist/cli.js → `sisyphus`
- src/daemon/ (14 files): Unix socket server managing sessions/tmux/orchestrator/agents, entry point → dist/daemon.js → `sisyphusd`
- src/tui/ (16 files): Raw ANSI terminal UI with frame-buffer diffing, entry point → dist/tui.js
- src/shared/ (8 files): Types, protocol contract, paths, config — imported by all layers, imports from none
- src/__tests__/ (3 files): state, session-logic, frontmatter tests using Node native runner

All layers communicate over ~/.sisyphus/daemon.sock with JSON line-delimited protocol defined in shared/protocol.ts (22 request types).