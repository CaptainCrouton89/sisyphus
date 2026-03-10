# src/shared/

Protocol contract, types, and utilities shared by CLI and Daemon layers.

## Key Responsibilities

- **protocol.ts** — `ProtocolRequest` and `ProtocolResponse` type definitions; defines CLI↔Daemon JSON message schema
- **types.ts** — Core domain types (`Session`, `Agent`, `OrchestratorCycle`, etc.)
- **paths.ts** — Session directory resolution (always relative to project root where `sisyphus start` was run)
- **config.ts** — Layered config resolution with defaults, effort levels, and worktree controls

## Config Options

- `model` — Claude model (e.g., `claude-3-5-sonnet-20241022`)
- `tmuxSession` — Named tmux session (defaults to auto-generated)
- `orchestratorPrompt` — File path override for orchestrator system prompt
- `pollIntervalMs` — Daemon poll interval (default: 5000)
- `autoUpdate` — Auto-update option
- `orchestratorEffort` — Effort level for orchestrator: `'low' | 'medium' | 'high'` (default: `'high'`)
- `agentEffort` — Effort level for agents: `'low' | 'medium' | 'high'` (default: `'medium'`)
- **WorktreeConfig** — `copy`, `clone`, `symlink`, `init` for worktree setup

## Critical Constraints

- **Protocol is the contract** — Changes to `ProtocolRequest` or `ProtocolResponse` types require coordinating both CLI and Daemon; breaking changes break existing sessions
- **Types must be serializable** — All types in `types.ts` must JSON-serialize cleanly (no circular refs, class methods, etc.)
- **Paths are relative to project root** — `paths.ts` resolves session dirs relative to `process.cwd()` at CLI invocation time; Daemon uses same logic via socket requests
- **Config precedence is strict** — Project config (`.sisyphus/config.json`) overrides global (`~/.sisyphus/config.json`), which overrides defaults; no environment variable fallbacks
- **Effort levels are enums** — Only valid values are `'low'`, `'medium'`, `'high'` (case-sensitive strings)

## No Local Dependencies

Files here must not import from `src/cli/` or `src/daemon/` — they are pure shared contracts only.
