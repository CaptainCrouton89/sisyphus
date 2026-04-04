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

Four layers over a Unix socket (`~/.sisyphus/daemon.sock`, JSON line-delimited):

```
CLI (src/cli/)  ←→  Daemon (src/daemon/)
TUI (src/tui/)  ←→  Shared (src/shared/)
```

- **CLI** (`src/cli/`): Commander.js, `client.ts` handles socket (10s timeout), each command maps to a protocol request
- **Daemon** (`src/daemon/`): `server.ts` routes; `session-manager.ts` lifecycle; `orchestrator.ts`/`agent.ts` spawn tmux panes; `pane-monitor.ts` polls; `state.ts` atomic writes; `summarize.ts` / `companion-commentary.ts` call Haiku via `haiku.ts` (`callHaiku` for text, `callHaikuStructured<T>(prompt, jsonSchema, zodSchema)` for typed JSON via `@r-cli/sdk` `query()`) — fire-and-forget, silently skips on auth failure (5 min cooldown)
- **TUI** (`src/tui/`): raw ANSI cursor rendering with frame-buffer diffing (no React/Ink); embeds a live neovim instance via `node-pty` + `@xterm/headless` (`NvimBridge`) for in-dashboard file editing. `review.ts` is a separate standalone entry (`dist/review.js`) — interactive EARS requirements reviewer invoked as `sisyphus-review <requirements.json>`, not connected to the daemon
- **Shared** (`src/shared/`): protocol types, path helpers, layered config resolution

Each layer has its own `CLAUDE.md` — read before touching that layer.

## Native Notification Helper

`native/` contains a Swift macOS app (`SisyphusNotify`) that fires click-to-switch notifications.

- Built during `postinstall` via `bash native/build-notify.sh`; installs to `~/.sisyphus/SisyphusNotify.app`
- Requires `swiftc` (Xcode Command Line Tools) — build silently skips if missing
- `native/` is included in published package files so postinstall works after `npm install`
- To rebuild manually: `bash native/build-notify.sh`

## Session Lifecycle

1. `sisyphus start "task"` → daemon creates session, spawns orchestrator in tmux pane
2. Orchestrator updates `roadmap.md`, spawns agents, calls `sisyphus yield`
3. Daemon kills orchestrator pane, polls agent panes for completion
4. Agents call `sisyphus submit --report "..."` when done
5. When all agents finish, daemon respawns orchestrator (next cycle)
6. Orchestrator reviews reports, spawns more agents or calls `sisyphus complete`

Orchestrator and agents receive `SISYPHUS_SESSION_ID` / `SISYPHUS_AGENT_ID` env vars.

- `sisyphus message "..."` — queue a message the orchestrator sees on its next cycle (works from agent panes too)
- `sisyphus restart-agent <agentId>` — respawn a failed/killed/lost agent in a new pane without resetting the session
- `sisyphus rollback <sessionId> <cycle>` — rewind state to a prior cycle boundary (use `sisyphus status` to find cycle numbers)

## Prompt Delivery

Prompts are written to `{sessionDir}/prompts/` (avoids shell quoting issues with tmux send-keys):

- **Orchestrator**: `orchestrator-system-{N}.md` (template) + `orchestrator-user-{N}.md` (state summary). Both passed via `--append-system-prompt`.
- **Agents**: `{agentId}-system.md` rendered from `templates/agent-suffix.md` with `{{SESSION_ID}}` / `{{INSTRUCTION}}` placeholders.

Templates: `templates/orchestrator.md`, `templates/agent-suffix.md`. Project override: `.sisyphus/orchestrator.md`.

## Agent Types

Orchestrators can spawn typed agents (`sisyphus spawn --type namespace:name "task"`). Agent type templates are Markdown files with optional YAML frontmatter:

```yaml
---
name: reviewer
model: claude-opus-4-5        # overrides session model; gpt-*/codex-* routes to OpenAI
color: cyan                   # overrides pane color
skills: [skill-a, skill-b]   # Claude Code skills to enable
permissionMode: bypassPermissions
effort: high
interactive: false
---
Agent instruction body here...
```

**Resolution order (first match wins):** `.claude/agents/{name}.md` → `~/.claude/agents/{name}.md` → bundled `sisyphus:{name}` → installed Claude Code plugins (`~/.claude/plugins/`).

- Untyped agents use the default `templates/agent-suffix.md` template
- Provider is inferred from model name — no explicit config needed
- `sisyphus spawn --list-types` to discover available types in current project

## Key Conventions

### State
- **Always mutate through `state.ts`** — atomic temp-file + rename, never write state JSON directly
- Session state: `.sisyphus/sessions/{sessionId}/state.json` (project-relative to cwd of `sisyphus start`)
- Global daemon files: `~/.sisyphus/{daemon.sock,daemon.pid,daemon.log,config.json}`

### Config (layered, last wins)
Defaults → `~/.sisyphus/config.json` → `.sisyphus/config.json`
Options: `model`, `orchestratorPrompt` (file path), `pollIntervalMs`

### IDs & Colors
- Sessions: UUIDs; Agents: `agent-001`, `agent-002` (zero-padded)
- Orchestrator pane: yellow; agents rotate `[blue, green, magenta, cyan, red, white]`

### Bug Fixes
- When fixing a bug, write a test that reproduces the failure first, then fix the code. Keep the test — it's a regression guard.

### TypeScript
- Strict ESM, Node 22, tsup bundles four entry points (`daemon`, `cli`, `tui`, `review`)
- **Zod v4** (`^4.3.6`) — breaks v3 patterns: `.nonempty()` → `.min(1)`, `.nativeEnum()` → `.enum()`, error map API changed
- Adding a command: `src/cli/commands/{cmd}.ts` → register in `src/cli/index.ts` → protocol types in `src/shared/protocol.ts` → handle in `src/daemon/server.ts`

## Integration Tests

Docker-based integration tests in `test/integration/`. Requires Docker running locally.

```bash
bash test/integration/run.sh          # run all tiers, print pass/fail matrix
```

Three tiers (single multi-stage Dockerfile): **base** (node-only), **tmux** (node + tmux), **full** (node + tmux + neovim). Each tier adds tests that require its capabilities. Run a single tier for faster iteration:

```bash
docker build --target tmux -t sisyphus-test:tmux test/integration/
docker run --rm sisyphus-test:tmux bash /tests/suites/test-tmux.sh
```

GHA workflow (`.github/workflows/integration-tests.yml`) covers macOS-specific paths (launchd, Swift notifications).

## Companion

Persistent per-user state tracking mood, achievements, and session history (`~/.sisyphus/companion.json`). Updated automatically at session end.

- `sisyphus companion` — show profile, mood, and stats
- `sisyphus companion --name <name>` — rename companion
- `sisyphus companion --badges` — badge gallery
- `sisyphus companion-context` — inject companion context into current session (for orchestrators)
- Commentary generated via `callHaikuStructured` (Zod schema → typed JSON) — silently skips if Haiku auth fails
- Companion state lives in `src/daemon/companion.ts`; rendering in `src/shared/companion-render.ts` / `companion-badges.ts`

## Debugging

```bash
tail -f ~/.sisyphus/daemon.log   # daemon logs
sisyphus status                   # session + agent state
sisyphus doctor                   # checks tmux, Claude CLI, native notify, launchd
```

- **Auto-update**: daemon checks npm on start and every 6 hours (`updater.ts`); if a newer version is found it runs `npm install -g sisyphi` then `process.exit(0)` — launchd respawns with the new binary. **Skipped automatically for `npm link`ed installs** (symlink detection), so dev setups are safe.
- `node-pty` is external to the bundle (native module, not compiled in) — prebuilds need execute permission. `postinstall` fixes this automatically; run `npm rebuild node-pty` manually if pane spawning fails.
