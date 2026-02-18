# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Sisyphus Is

**Sisyphus** (npm package: `sisyphi`, commands: `sisyphus` / `sisyphusd`) is a tmux-integrated orchestration daemon for Claude Code multi-agent workflows.

A background daemon manages sessions where an **orchestrator** Claude instance breaks tasks into subtasks, spawns **agent** Claude instances in tmux panes, and coordinates their lifecycle through cycles. Agents work in parallel, submit reports, and the orchestrator respawns each cycle with fresh context to review progress and plan next steps.

**Key insight**: The orchestrator is stateless — it's killed after yielding and respawned fresh each cycle with the full session state. This means it never runs out of context, no matter how many cycles a session takes.

## Build & Dev Commands

```bash
npm run build          # Build with tsup → dist/
npm run dev            # Build in watch mode (rebuilds on file change)
npm run dev:daemon     # Watch + auto-restart daemon on each rebuild
npm test               # Node native test runner (src/__tests__/*.test.ts)

# Run a single test file
node --import tsx --test src/__tests__/state.test.ts
```

Binaries:
- **CLI**: `dist/cli.js` — entry point for `sisyphus` command
- **Daemon**: `dist/daemon.js` — entry point for `sisyphusd` command
- Both get shebang (#!) via tsup banner config

**Critical for daemon development**: The daemon runs the built `dist/daemon.js` in-process, so code changes aren't picked up until restart. Use `npm run dev:daemon` during development to handle this automatically via nodemon. For CLI changes only, `npm run dev` is sufficient.

## Architecture

**Three layers** communicating over a Unix socket (`~/.sisyphus/daemon.sock`) with JSON line-delimited protocol:

```
CLI (src/cli/)  ←→  Daemon (src/daemon/)  ←→  Shared (src/shared/)
```

### CLI Layer (`src/cli/`)
- **Commander.js** program with commands in `commands/`
- `client.ts` handles socket communication (10s timeout, waits for daemon response)
- Each command maps to a protocol request type
- Entry point: `dist/cli.js` (gets shebang, becomes `sisyphus` command)

### Daemon Layer (`src/daemon/`)
- **`server.ts`** — Listens on Unix socket, routes requests
- **`session-manager.ts`** — Manages active sessions (creation, state tracking, lifecycle)
- **`orchestrator.ts`** — Spawns and manages the orchestrator tmux pane
- **`agent.ts`** — Spawns individual agent panes
- **`pane-monitor.ts`** — Polls panes for completion (checks if process is alive)
- **`state.ts`** — Atomic state mutations via temp file + rename (prevents corruption)
- **`tmux.ts`** — Wrapper around tmux commands (new-window, send-keys, split-window, etc.)
- Entry point: `dist/daemon.js` (becomes `sisyphusd` command, runs as background service)

### Shared Layer (`src/shared/`)
- **Types** — Protocol message definitions (`Request`, `Response`) and domain types (`Session`, `Agent`, `OrchestratorCycle`)
- **Path helpers** — Resolves session directories (project-relative: `.sisyphus/sessions/{sessionId}/`)
- **Config resolution** — Layered: defaults → global (`~/.sisyphus/config.json`) → project (`.sisyphus/config.json`)

Each layer has its own `CLAUDE.md` with deeper context on conventions and constraints.

## Session Lifecycle

1. `sisyphus start "task"` → daemon creates session, spawns orchestrator Claude in tmux pane
2. Orchestrator updates plan.md, spawns agents (`sisyphus spawn`), then yields (`sisyphus yield`)
3. Daemon kills orchestrator pane, monitors agent panes via polling
4. Agents work in parallel, each calls `sisyphus submit --report "..."` when done
5. When all agents finish, daemon respawns orchestrator with updated state (next cycle)
6. Orchestrator reviews reports, spawns more agents or calls `sisyphus complete`

Orchestrator and agents receive `SISYPHUS_SESSION_ID` and `SISYPHUS_AGENT_ID` environment variables.

## How Prompts Are Delivered

Prompts are written to the `prompts/` subdirectory within the session directory to avoid shell quoting/newline issues with tmux send-keys:

- **Orchestrator**: `prompts/orchestrator-system-{N}.md` — contains the orchestrator template. `prompts/orchestrator-user-{N}.md` — contains the `<state>` block with concise session state + contextual instruction. Passed via `--append-system-prompt "$(cat 'file')"` with the user prompt file.
- **Agents**: `prompts/{agentId}-system.md` — rendered from `templates/agent-suffix.md` with `{{SESSION_ID}}` and `{{INSTRUCTION}}` placeholders. Passed via `--append-system-prompt "$(cat 'file')"` with the instruction as the user prompt.

The `<state>` block is a human-readable summary (not raw JSON) with agent reports (truncated to 120 chars), cycle history, and plan.md/logs.md references.

## Templates

- `templates/orchestrator.md` — Orchestrator system prompt (role, strategy, CLI reference, workflow)
- `templates/agent-suffix.md` — Agent system prompt suffix with `{{SESSION_ID}}` and `{{INSTRUCTION}}` placeholders
- `.sisyphus/orchestrator.md` (project) — Optional override for orchestrator prompt

## Claude Code Plugin: Crouton Kit

The companion [crouton-kit](https://github.com/CaptainCrouton89/crouton-kit) plugin adds 11 specialized agent types and orchestration workflows:

```bash
claude plugins install CaptainCrouton89/crouton-kit sisyphus
```

**Available agent types**:
- `sisyphus:debug` — Debug-focused investigation agent
- `sisyphus:implement` — Implementation-focused agent
- `sisyphus:plan` — Planning & design agent
- Others for reviews, refactors, tests, docs, etc.

Use with `sisyphus spawn --agent-type sisyphus:debug "investigate login failure"`. Without the plugin, you can still spawn generic Claude instances with `sisyphus spawn --name "agent-name" --instruction "..."`.

**Note**: The plugin provides specialized system prompts tailored to each agent role, improving task completion quality for common workflows.

## Key Conventions

### Naming & IDs
- **Sessions**: UUIDs (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- **Agents**: `agent-001`, `agent-002`, etc. (zero-padded)

### Colors
- **Orchestrator**: Always yellow
- **Agents**: Rotate through `[blue, green, magenta, cyan, red, white]`

### State & Persistence
- **Project-local** (relative to cwd where `sisyphus start` was run):
  - `.sisyphus/sessions/{sessionId}/state.json` — atomically written JSON
  - `.sisyphus/sessions/{sessionId}/plan.md`, `logs.md`
  - `.sisyphus/sessions/{sessionId}/prompts/` — orchestrator + agent prompt files
  - `.sisyphus/sessions/{sessionId}/reports/`, `context/`
  - `.sisyphus/config.json` — project config override
- **Global** (`~/.sisyphus/`):
  - `daemon.sock` — Unix socket
  - `daemon.pid` — PID lock file
  - `daemon.log` — daemon logs
  - `config.json` — global config

### Tmux Layout
- All panes use `split-window -h` (columns, not rows)
- Window layout set to `even-horizontal` for balanced widths

### Configuration
- **Global**: `~/.sisyphus/config.json`
- **Project**: `.sisyphus/config.json` (overrides global)
- **Options**: `model` (Claude model), `orchestratorPrompt` (file path), `pollIntervalMs` (daemon poll interval)

### Daemon Startup
- Intended to run via launchd on macOS (`launchd/com.sisyphus.daemon.plist`)
- Runs as a background process, listens on Unix socket indefinitely

### TypeScript & Build
- **Mode**: Strict, ESM (`"type": "module"`)
- **Target**: Node.js 22
- **Builder**: tsup (bundles + adds shebang)

## Common Patterns

### Adding a New Command
1. Create `src/cli/commands/{command}.ts` exporting an action function
2. Register in `src/cli/index.ts` with `.command()` and `.action()`
3. Define protocol request/response types in `src/shared/protocol.ts`
4. Handle in daemon's `server.ts` → delegate to appropriate manager
5. Rebuild and test: `npm run build && npm test`

### Modifying State
- Always go through `state.ts` — never write state files directly
- State mutations are atomic (temp file + rename)
- Prevents corruption if daemon crashes mid-write

### Testing Locally
```bash
npm run dev:daemon        # Terminal 1: daemon in watch mode
tmux new-session          # Terminal 2: start a tmux session
sisyphus start "test"     # Inside tmux: spawn orchestrator
sisyphus status           # Check status
```

The orchestrator will spawn in a yellow pane. Agents appear in other colors as the orchestrator spawns them. Watch the daemon logs in Terminal 1 for debugging:

```bash
tail -f ~/.sisyphus/daemon.log
```
