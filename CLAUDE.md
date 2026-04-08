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

Sub-`CLAUDE.md` files exist at `src/cli/`, `src/cli/commands/`, `src/daemon/`, `src/daemon/segments/`, `src/tui/`, `src/tui/lib/`, `src/tui/panels/`, `src/shared/`.

## Native Notification Helper

`native/` — Swift macOS app (`SisyphusNotify`). Built during `postinstall` via `bash native/build-notify.sh`; installs to `~/.sisyphus/SisyphusNotify.app`. Requires `swiftc` — build silently skips if missing.

## Agent Types

**Resolution order (first match wins):** `.claude/agents/{name}.md` → `~/.claude/agents/{name}.md` → bundled `sisyphus:{name}` → installed Claude Code plugins (`~/.claude/plugins/`).

- **Provider inferred from model name prefix** — `gpt-` and `codex-` route to OpenAI/Codex CLI; all others use Claude. No explicit provider config.
- `sisyphus spawn --list-types` to discover available types in current project
- `spawn` requires `--name`; instruction can come from positional arg, `--instruction`, or stdin

### Orchestrator-only commands
`sisyphus clone` and `sisyphus yield` check `SISYPHUS_AGENT_ID === 'orchestrator'` and `SISYPHUS_SESSION_ID` — they error immediately if called outside an orchestrator pane.

## Key Conventions

### State
- **Always mutate through `state.ts`** — atomic temp-file + rename, never write state JSON directly
- Session state: `.sisyphus/sessions/{sessionId}/state.json` (project-relative)
- Global daemon files: `~/.sisyphus/{daemon.sock,daemon.pid,daemon.log,config.json}`

### Config (layered, last wins)
Defaults → `~/.sisyphus/config.json` → `.sisyphus/config.json`

`statusBar` deep-merges `colors` and `segments` sub-objects; all other top-level fields shallow-merge.

Notable options: `orchestratorPrompt` (path to custom system prompt), `requiredPlugins` (Claude Code plugins auto-installed for every agent).

### IDs
- Sessions: UUIDs; Agents: `agent-001`, `agent-002` (zero-padded)

### Bug Fixes
- Write a test that reproduces the failure first, then fix the code. Keep the test.

### TypeScript
- Strict ESM, Node 22, tsup bundles five entry points (`daemon`, `cli`, `tui`, `review`, `design`)
  - `review` → `sisyphus-review` binary (EARS requirements reviewer TUI)
  - `design` → `sisyphus-design` binary (technical design walkthrough TUI)
- **Zod v4** (`^4.3.6`) — breaks v3 patterns: `.nonempty()` → `.min(1)`, `.nativeEnum()` → `.enum()`, error map API changed
- Adding a command: `src/cli/commands/{cmd}.ts` → register in `src/cli/index.ts` → protocol types in `src/shared/protocol.ts` → handle in `src/daemon/server.ts`

## `present` Command

Renders markdown via `termrender` into a tmux split pane (agent-to-user visual feedback).

- **Requires `termrender`** (`pip install termrender`) — exits with clear error if missing, not a silent fail
- Non-interactive: delegates to `termrender --tmux` (termrender owns the pane)
- `--interactive`: renders to temp ANSI file, opens in nvim with `baleia` for ANSI color decode, blocks until pane closed
- Falls back to stdout if not inside tmux

## Integration Tests

Docker-based in `test/integration/`. Three tiers: **base** (node-only), **tmux** (node + tmux), **full** (node + tmux + neovim). Run `bash test/integration/run.sh`.

## Debugging

```bash
tail -f ~/.sisyphus/daemon.log   # daemon logs
sisyphus status                   # session + agent state
sisyphus doctor                   # checks tmux, Claude CLI, native notify, launchd
```

- `node-pty` is external to the bundle (native module) — prebuilds need execute permission. `postinstall` fixes this; run `npm rebuild node-pty` if pane spawning fails.

See `.claude/skills/sisyphus/SKILL.md` for runtime mental model, agent boundaries, and workflow patterns.
