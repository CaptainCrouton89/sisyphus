# src/shared/

Protocol contract, types, and utilities shared by CLI and Daemon layers.

## Key Responsibilities

- **protocol.ts** — `ProtocolRequest` and `ProtocolResponse` type definitions; defines CLI↔Daemon JSON message schema
- **types.ts** — Core domain types (`Session`, `Agent`, `OrchestratorCycle`, etc.)
- **paths.ts** — Session directory resolution (always relative to project root where `sisyphus start` was run)
- **config.ts** — Layered config resolution (defaults → global `~/.sisyphus/config.json` → project `.sisyphus/config.json`)

## Critical Constraints

- **Protocol is the contract** — Changes to `ProtocolRequest` or `ProtocolResponse` types require coordinating both CLI and Daemon; breaking changes break existing sessions
- **Types must be serializable** — All types in `types.ts` must JSON-serialize cleanly (no circular refs, class methods, etc.)
- **Paths are relative to project root** — `paths.ts` resolves session dirs relative to `process.cwd()` at CLI invocation time; Daemon uses same logic via socket requests
- **Config precedence is strict** — Project config overrides global; both override defaults; no environment variable fallbacks

## No Local Dependencies

Files here must not import from `src/cli/` or `src/daemon/` — they are pure shared contracts only.
