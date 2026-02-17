# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run build          # Build with tsup → dist/
npm run dev            # Build in watch mode (CLI only)
npm run dev:daemon     # Watch + auto-restart daemon on each rebuild
npm test               # Node native test runner (src/__tests__/*.test.ts)
```

The CLI binary is at `dist/cli.js`, the daemon at `dist/daemon.js`. Both get a shebang via tsup banner config.

**The daemon must be restarted after rebuilding** — it runs the built `dist/daemon.js` in-process, so code changes aren't picked up until restart. Use `npm run dev:daemon` during development to handle this automatically.

## What Sisyphus Is

A tmux-integrated orchestration daemon for Claude Code multi-agent workflows. A background daemon manages sessions where an **orchestrator** Claude instance breaks tasks into subtasks, spawns **agent** Claude instances in tmux panes, and coordinates their lifecycle through cycles.

## Architecture

**Three layers** communicating over a Unix socket (`~/.sisyphus/daemon.sock`) with JSON line-delimited protocol:

```
CLI (src/cli/)  ←→  Daemon (src/daemon/)  ←→  Shared (src/shared/)
```

- **CLI** — Commander.js program. `client.ts` handles socket communication (10s timeout). Each command in `commands/` maps to a protocol request type.
- **Daemon** — `server.ts` routes socket requests to `session-manager.ts`, which delegates to `orchestrator.ts`, `agent.ts`, `pane-monitor.ts`. State mutations go through `state.ts` (atomic writes via temp file + rename).
- **Shared** — Types, protocol message definitions, path helpers, layered config (defaults → global → project).

## Session Lifecycle

1. `sisyphus start "task"` → daemon creates session, spawns orchestrator Claude in tmux pane
2. Orchestrator adds tasks (`sisyphus tasks add`), spawns agents (`sisyphus spawn`), then yields (`sisyphus yield`)
3. Daemon kills orchestrator pane, monitors agent panes via polling
4. Agents work in parallel, each calls `sisyphus submit --report "..."` when done
5. When all agents finish, daemon respawns orchestrator with updated state (next cycle)
6. Orchestrator reviews reports, spawns more agents or calls `sisyphus complete`

Orchestrator and agents receive `SISYPHUS_SESSION_ID` and `SISYPHUS_AGENT_ID` environment variables.

## How Prompts Are Delivered

Prompts are written to files in the session directory to avoid shell quoting/newline issues with tmux send-keys:

- **Orchestrator**: `orchestrator-prompt-{N}.md` — contains the orchestrator template + a `<state>` block with concise session state (tasks, agents, cycle history). Passed via `--append-system-prompt "$(cat 'file')"` with a short user prompt.
- **Agents**: `{agentId}-system.md` — rendered from `templates/agent-suffix.md` with `{{SESSION_ID}}` and `{{INSTRUCTION}}` placeholders. Passed via `--append-system-prompt "$(cat 'file')"` with the instruction as the user prompt.

The `<state>` block is a human-readable summary (not raw JSON) with tasks, agent reports (truncated to 120 chars), and cycle history.

## Templates

- `templates/orchestrator.md` — Orchestrator system prompt (role, strategy, CLI reference, workflow)
- `templates/agent-suffix.md` — Agent system prompt suffix with `{{SESSION_ID}}` and `{{INSTRUCTION}}` placeholders
- `.sisyphus/orchestrator.md` (project) — Optional override for orchestrator prompt

## Key Conventions

- **IDs**: Sessions are UUIDs, agents are `agent-NNN` (zero-padded), tasks are `t1`, `t2`, etc.
- **Colors**: Orchestrator is always yellow. Agents rotate through `[blue, green, magenta, cyan, red, white]`
- **State files**: `.sisyphus/sessions/{sessionId}/state.json` — atomically written JSON
- **Pane layout**: All panes use `split-window -h` (columns) with `even-horizontal` layout
- **Config**: `~/.sisyphus/config.json` (global) and `.sisyphus/config.json` (project) with options: `model`, `orchestratorPrompt`, `pollIntervalMs`
- **Daemon**: Intended to run via launchd (`launchd/com.sisyphus.daemon.plist`), logs to `~/.sisyphus/daemon.log`
- **TypeScript**: Strict mode, ESM (`"type": "module"`), Node 22 target
