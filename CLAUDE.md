# CLAUDE.md

Orchestrator is **stateless** — killed after yield, respawned fresh each cycle; never persist in-memory state across yields.

## Build & Dev

- **Daemon runs `dist/daemon.js`** — code changes are invisible until rebuild + `sisyphusd restart`

## Agent Types

**Resolution order (first match wins):** `.claude/agents/{name}.md` → `~/.claude/agents/{name}.md` → bundled `sisyphus:{name}` → installed Claude Code plugins (`~/.claude/plugins/`).

- **Provider inferred from model name prefix** — `gpt-` and `codex-` route to OpenAI/Codex CLI; all others use Claude. No explicit provider config.

## Key Conventions

### State
- **Always mutate through `state.ts`** — atomic temp-file + rename, never write state JSON directly

### Config (layered, last wins)
Defaults → `~/.sisyphus/config.json` → `.sisyphus/config.json`

`statusBar` deep-merges `colors` and `segments` sub-objects; all other top-level fields shallow-merge.

### TypeScript
- **Zod v4** (`^4.3.6`) — breaks v3 patterns: `.nonempty()` → `.min(1)`, `.nativeEnum()` → `.enum()`, error map API changed

## Debugging

- `node-pty` is external to the bundle (native module) — prebuilds need execute permission. `postinstall` fixes this; run `npm rebuild node-pty` if pane spawning fails.
- `native/build-notify.sh` compiles `SisyphusNotify.app` (macOS click-to-switch notifications) via `swiftc`. Errors now surface during `npm install` but are non-fatal (`|| true`). If missing: `xcode-select --install`.
