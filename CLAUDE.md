# CLAUDE.md

Sisyphus (`sisyphi` package, `sisyphus`/`sisyphusd` commands): tmux-integrated daemon that orchestrates Claude Code multi-agent workflows. Orchestrator is **stateless** — killed after yield, respawned fresh each cycle. Agents work in parallel panes; daemon polls for completion.

## Build & Dev

```bash
npm run build              # tsup → dist/ (also copies templates/ → dist/templates/)
npm run dev                # build in watch mode
npm run dev:daemon         # watch + auto-restart daemon on rebuild
npm test                   # node native test runner
node --import tsx --test src/__tests__/state.test.ts  # single test file
```

- **Daemon runs `dist/daemon.js`** — code changes are invisible until rebuild + restart
- `sisyphusd restart` is sufficient (launchd keeps it alive); never stop+start separately
- `prepublishOnly` runs build + test — fix both before publishing

## Architecture

Unix socket (`~/.sisyphus/daemon.sock`, JSON line-delimited). Four layers — each has its own `CLAUDE.md`, read before touching that layer:

- **CLI** (`src/cli/`): Commander.js commands → socket requests
- **Daemon** (`src/daemon/`): session lifecycle, tmux pane spawning, state, Haiku calls
- **TUI** (`src/tui/`): raw ANSI frame-buffer rendering (no React/Ink), embedded neovim
- **Shared** (`src/shared/`): protocol types, path helpers, config resolution

## Native Notification Helper

`native/` — Swift macOS app (`SisyphusNotify`). Built during `postinstall` via `bash native/build-notify.sh`; installs to `~/.sisyphus/SisyphusNotify.app`. Requires `swiftc` — build silently skips if missing.

## Agent Types

**Resolution order (first match wins):** `.claude/agents/{name}.md` → `~/.claude/agents/{name}.md` → bundled `sisyphus:{name}` → installed Claude Code plugins (`~/.claude/plugins/`).

- Provider inferred from model name — no explicit config needed
- `sisyphus spawn --list-types` to discover available types in current project

## Key Conventions

### State
- **Always mutate through `state.ts`** — atomic temp-file + rename, never write state JSON directly
- Session state: `.sisyphus/sessions/{sessionId}/state.json` (project-relative)
- Global daemon files: `~/.sisyphus/{daemon.sock,daemon.pid,daemon.log,config.json}`

### Config (layered, last wins)
Defaults → `~/.sisyphus/config.json` → `.sisyphus/config.json`

`statusBar` deep-merges `colors` and `segments` sub-objects; all other top-level fields shallow-merge.

### IDs
- Sessions: UUIDs; Agents: `agent-001`, `agent-002` (zero-padded)

### Bug Fixes
- Write a test that reproduces the failure first, then fix the code. Keep the test.

### TypeScript
- Strict ESM, Node 22, tsup bundles five entry points (`daemon`, `cli`, `tui`, `review`, `design`)
- **Zod v4** (`^4.3.6`) — breaks v3 patterns: `.nonempty()` → `.min(1)`, `.nativeEnum()` → `.enum()`, error map API changed
- Adding a command: `src/cli/commands/{cmd}.ts` → register in `src/cli/index.ts` → protocol types in `src/shared/protocol.ts` → handle in `src/daemon/server.ts`

## Integration Tests

Docker-based in `test/integration/`. Three tiers: **base** (node-only), **tmux** (node + tmux), **full** (node + tmux + neovim). Run `bash test/integration/run.sh`.

## Debugging

```bash
tail -f ~/.sisyphus/daemon.log   # daemon logs
sisyphus status                   # session + agent state
sisyphus doctor                   # checks tmux, Claude CLI, native notify, launchd
```

- `node-pty` is external to the bundle (native module) — prebuilds need execute permission. `postinstall` fixes this; run `npm rebuild node-pty` if pane spawning fails.
