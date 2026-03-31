# src/shared/

Protocol contract, types, and utilities shared by CLI and Daemon layers.

## Files

- **protocol.ts** — `Request` and `Response` union types; all CLI↔Daemon operations
- **types.ts** — Core domain types (`Session`, `Agent`, `OrchestratorCycle`, `MessageSource`)
- **paths.ts** — Path helpers for global (`~/.sisyphus/`), project (`.sisyphus/`), and session directories
- **config.ts** — Layered config resolution (defaults → global → project); `EffortLevel` type; `Config` interface with effort, notifications, plugins

## Config & Effort Levels

- **EffortLevel** type: `'low' | 'medium' | 'high' | 'max'` — case-sensitive, must be exact match
- Config fields include `orchestratorEffort`, `agentEffort`, `notifications`, `requiredPlugins`, `model`, `editor`, `repos`, etc.
- **Immutable at runtime** — Load once via `loadConfig(cwd)`, don't re-read files

## Critical Constraints

- **Protocol is the contract** — Changes to `Request` or `Response` invalidate active sessions; coordinate with CLI and Daemon
- **Types must serialize cleanly** — No circular refs, class methods, or non-JSON properties
- **No local dependencies** — Never import from `src/cli/` or `src/daemon/`
- **paths.ts exports functions only** — No constants; all paths computed to stay portable across cwd changes
