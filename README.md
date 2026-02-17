# sisyphi

A tmux-integrated orchestration daemon for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) multi-agent workflows.

A background daemon manages sessions where an **orchestrator** Claude instance breaks tasks into subtasks, spawns **agent** Claude instances in tmux panes, and coordinates their lifecycle through cycles. Agents work in parallel, submit reports, and the orchestrator respawns each cycle with fresh context to review progress and plan next steps.

## How It Works

```
You ──► sisyphus start "build auth system"
              │
              ▼
        ┌─────────────┐
        │ Orchestrator │  ◄── Reads state, plans work, spawns agents
        └──────┬──────┘
               │ sisyphus spawn (×N)
               ▼
     ┌─────┐ ┌─────┐ ┌─────┐
     │ A-1 │ │ A-2 │ │ A-3 │  ◄── Parallel Claude agents in tmux panes
     └──┬──┘ └──┬──┘ └──┬──┘
        │       │       │
        ▼       ▼       ▼
   sisyphus submit (each agent reports back)
              │
              ▼
        ┌─────────────┐
        │ Orchestrator │  ◄── Respawned with updated state (next cycle)
        └─────────────┘
```

1. **You** run `sisyphus start` with a high-level task
2. **Orchestrator** decomposes it, adds tasks, spawns agents, yields
3. **Agents** work in parallel tmux panes, send progress reports, submit when done
4. **Daemon** detects completion, respawns orchestrator with updated state
5. **Orchestrator** reviews reports, spawns more agents or completes the session

The orchestrator is stateless — it's killed after yielding and respawned fresh each cycle with the full session state. This means it never runs out of context, no matter how many cycles a session takes.

## Requirements

- **Node.js** >= 22
- **tmux** (you must be inside a tmux session)
- **Claude Code** CLI (`claude`) installed and authenticated

## Install

```bash
npm install -g sisyphi
```

This gives you two commands:
- `sisyphus` — the CLI for interacting with sessions
- `sisyphusd` — the background daemon

## Quick Start

### 1. Start the daemon

```bash
sisyphusd
```

Or run it in the background. On macOS you can use launchd — create `~/Library/LaunchAgents/com.sisyphus.daemon.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.sisyphus.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>sisyphusd</string>
  </array>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>~/.sisyphus/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>~/.sisyphus/daemon.log</string>
</dict>
</plist>
```

Then load it:

```bash
launchctl load ~/Library/LaunchAgents/com.sisyphus.daemon.plist
```

### 2. Start a session (inside tmux)

```bash
sisyphus start "Refactor the authentication module to use JWT tokens"
```

The orchestrator spawns in a yellow tmux pane and begins planning.

### 3. Watch it work

```bash
sisyphus status     # Check session state, tasks, agents
sisyphus tasks list # View task breakdown
```

Agent panes appear as the orchestrator spawns them, color-coded by agent:

| Role | Color |
|------|-------|
| Orchestrator | Yellow |
| Agents | Blue, Green, Magenta, Cyan, Red, White (rotating) |

### 4. Resume or complete

```bash
sisyphus resume <session-id>                    # Resume a paused session
sisyphus resume <session-id> "focus on tests"   # Resume with new instructions
sisyphus list                                   # List all sessions
```

## CLI Reference

```bash
# Session lifecycle
sisyphus start "task description"           # Create session, launch orchestrator
sisyphus status                             # Current session state
sisyphus list                               # List all sessions
sisyphus resume <id> [message]              # Resume paused session
sisyphus kill <id>                          # Kill a session

# These are used by the orchestrator/agents (not typically run manually):
sisyphus spawn --agent-type <t> --name <n> --instruction "..."
sisyphus yield                              # Orchestrator yields control
sisyphus complete --report "summary"        # Mark session done
sisyphus submit --report "findings"         # Agent submits final report
sisyphus report --message "progress"        # Agent sends progress update

# Task management
sisyphus tasks list
sisyphus tasks add "description"
sisyphus tasks add "idea" --status draft
echo "long description" | sisyphus tasks add    # stdin piping
sisyphus tasks update <taskId> --status done
sisyphus tasks update <taskId> --description "refined"
```

## Architecture

Three layers communicating over a Unix socket (`~/.sisyphus/daemon.sock`):

- **CLI** (`sisyphus`) — Commander.js program that sends JSON requests to the daemon
- **Daemon** (`sisyphusd`) — Manages sessions, spawns/monitors tmux panes, tracks state
- **Shared** — Types, protocol definitions, config resolution

State is persisted as JSON at `.sisyphus/sessions/{id}/state.json` (relative to your project directory), written atomically via temp file + rename.

## Configuration

Config is layered: project (`.sisyphus/config.json`) overrides global (`~/.sisyphus/config.json`).

```json
{
  "model": "sonnet",
  "pollIntervalMs": 3000
}
```

You can also override the orchestrator prompt per-project by placing a file at `.sisyphus/orchestrator.md`.

## License

MIT
