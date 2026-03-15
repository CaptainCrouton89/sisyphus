# src/shared/

Protocol contract, types, and utilities shared by CLI and Daemon layers.

## Files

- **protocol.ts** — `Request` and `Response` union types; all CLI↔Daemon operations
- **types.ts** — Core domain types (`Session`, `Agent`, `OrchestratorCycle`, `MessageSource`)
- **paths.ts** — Path helpers for global (`~/.sisyphus/`), project (`.sisyphus/`), and session directories; includes worktree paths
- **config.ts** — Layered config resolution with effort levels and worktree controls

## Critical Constraints

- **Protocol is the contract** — Changes to `Request` or `Response` invalidate active sessions; coordinate with CLI and Daemon
- **Types must serialize cleanly** — No circular refs, class methods, or non-JSON properties
- **No local dependencies** — Never import from `src/cli/` or `src/daemon/`
- **Effort levels only** — Must be exactly `'low'`, `'medium'`, `'high'`, or `'max'` (case-sensitive)
- **paths.ts exports functions only** — No constants; all paths computed to stay portable across cwd changes
