```
╔═══════════════════════════════════════════════════════╗
║ @@@@@@@@@@@@@@@@@@@@@@@@@@@%%%#*++**#%%@@@@@@@@@@@@@@ ║
║ @@@@@@@@@@@@@@@@@@@@@@@@%*====-----::::-:=%@@@@@@@@@@ ║
║ @@@@@@@@@@@@@@@@@@@@@%#=:.:-=------:...    -%@@@@@@@@ ║
║ @@@@@@@@@@@@@@@@@@%%#= .....:-:..........    *%@@@@@@ ║
║ @@@@@@@@@@@@@@%+==-+%*:  .:---::::....:....   #@@@@@@ ║
║ @@@@@@@@@@@@%#:. ..:.    ..:-...:.....    .  :%@@@@@@ ║
║ @@@@@@@@@@@@#:.:..  :*= ............       . :%@@@@@@ ║
║ @@@@@@@@@@@@#--:..   -%+............... ..   *%#=-:.: ║
║ @@@@@@@@@@%#----.:#%+.::::...       .....    .... .:# ║
║ @@@@@@@@%+-:::.. :%@@@@@@@@%*=:                 ..*%@ ║
║ @@@@@@%*-=:..::.:-..+@@@@@@%%#=:.   ..   . ...   *@@@ ║
║ @@@@#==::%@@@@@@%=:::=%*-:.     ....  .   ...  :%@@@@ ║
║ @@#::=#@@@@%#-.:-...    .::...               :#%@@@@@ ║
║ %=:%%%#####+:.:     .    .....    .  .      *%@@@@@@@ ║
║ :::.:.:::..::.        .                 ..  :#@@@@@@@ ║
║ %#*++===--============++===-::::::::---=====#%@@@@@@@ ║
║    _____ _____ _______   _______ _   _ _   _ _____    ║
║   /  ___|_   _/  ___\ \ / / ___ \ | | | | | /  ___|   ║
║   \ `--.  | | \ `--. \ V /| |_/ / |_| | | | \ `--.    ║
║    `--. \ | |  `--. \ \ / |  __/|  _  | | | |`--. \   ║
║   /\__/ /_| |_/\__/ / | | | |   | | | | |_| /\__/ /   ║
║   \____/ \___/\____/  \_/ \_|   \_| |_/\___/\____/    ║
╚═══════════════════════════════════════════════════════╝
```

# sisyphus

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
2. **Orchestrator** decomposes it, spawns agents, yields
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

### Claude Code Plugin (optional)

The companion plugin on the [crouton-kit](https://github.com/CaptainCrouton89/crouton-kit) marketplace adds specialized agent types and an orchestration skill with task breakdown patterns for common workflows (bug fixes, feature builds, refactors, reviews, etc.).

```bash
claude plugins install CaptainCrouton89/crouton-kit sisyphus
```

This makes `sisyphus:debug`, `sisyphus:implement`, `sisyphus:plan`, and other agent types available for `sisyphus spawn --agent-type`.

## Quick Start

### 1. Start the daemon

```bash
sisyphusd
```

The daemon also supports `sisyphusd stop` and `sisyphusd restart` subcommands.

To run it persistently on macOS, use launchd — create `~/Library/LaunchAgents/com.sisyphus.daemon.plist`:

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

To unload and clean up:

```bash
sisyphus uninstall          # Unload from launchd
sisyphus uninstall --purge  # Also remove ~/.sisyphus data
```

### 2. Start a session (inside tmux)

```bash
sisyphus start "Refactor the authentication module to use JWT tokens"
```

The orchestrator spawns in a yellow tmux pane and begins planning.

### 3. Watch it work

```bash
sisyphus status              # Check session state and agents
sisyphus list                # List sessions in current project
sisyphus list --all          # List sessions across all projects
```

Agent panes appear as the orchestrator spawns them, color-coded by role. Agent types from the crouton-kit plugin define their own colors via frontmatter; otherwise agents rotate through blue, green, magenta, cyan, red, and white.

### 4. Resume or complete

```bash
sisyphus resume <session-id>                    # Resume a paused session
sisyphus resume <session-id> "focus on tests"   # Resume with new instructions
sisyphus kill <session-id>                      # Kill a session and all agents
```

## CLI Reference

```bash
# Session lifecycle
sisyphus start "task description"           # Create session, launch orchestrator
sisyphus status [session-id]                # Session state (defaults to active session)
sisyphus list [-a, --all]                   # List sessions (--all for cross-project)
sisyphus resume <id> [message]              # Resume paused session
sisyphus kill <id>                          # Kill session and all agents
sisyphus uninstall [--purge] [-y]           # Unload daemon from launchd

# Daemon management
sisyphusd                                   # Start the daemon
sisyphusd stop                              # Stop the daemon
sisyphusd restart                           # Restart the daemon

# Used by the orchestrator/agents (not typically run manually):
sisyphus spawn --agent-type <t> --name <n> --instruction "..."
sisyphus spawn --agent-type <t> --name <n> --instruction "..." --worktree
sisyphus yield [--prompt "next cycle context"]
sisyphus complete --report "summary"        # Mark session done
sisyphus submit --report "findings"         # Agent submits final report
sisyphus report --message "progress"        # Agent sends progress update
```

Both `yield`, `submit`, and `report` support stdin piping for long content:

```bash
echo "detailed report" | sisyphus submit
echo "progress update" | sisyphus report
```

## Git Worktree Isolation

Agents can work in isolated git worktrees to avoid conflicts when multiple agents edit files in parallel:

```bash
sisyphus spawn --agent-type sisyphus:implement --name "auth" \
  --instruction "implement auth module" --worktree
```

With `--worktree`, the daemon:
1. Creates a new branch (`sisyphus/{session}/{agent-id}`) and worktree
2. Symlinks `.sisyphus` and `.claude` directories into the worktree
3. Runs bootstrap commands from `.sisyphus/worktree.json` (copy files, install deps, etc.)
4. Automatically merges the agent's branch back when the agent submits

Configure worktree bootstrap in `.sisyphus/worktree.json`:

```json
{
  "symlink": [".env", "node_modules"],
  "copy": ["package.json"],
  "init": "npm install"
}
```

## Architecture

Three layers communicating over a Unix socket (`~/.sisyphus/daemon.sock`):

- **CLI** (`sisyphus`) — Commander.js program that sends JSON requests to the daemon
- **Daemon** (`sisyphusd`) — Manages sessions, spawns/monitors tmux panes, tracks state
- **Shared** — Types, protocol definitions, config resolution

### State & Persistence

State is persisted as JSON at `.sisyphus/sessions/{id}/state.json` (project-relative), written atomically via temp file + rename.

Each session directory contains:
```
.sisyphus/sessions/{id}/
├── state.json        # Session state (atomic writes)
├── plan.md           # Orchestrator memory — outstanding work
├── logs.md           # Orchestrator memory — session log
├── prompts/          # Rendered system + user prompt files
├── reports/          # Agent report files
└── context/          # Persistent artifacts (specs, plans, explorations)
```

The orchestrator maintains `plan.md` and `logs.md` across cycles as persistent memory — these survive orchestrator respawns and give each new cycle continuity with previous work.

## Configuration

Config is layered: project (`.sisyphus/config.json`) overrides global (`~/.sisyphus/config.json`).

```json
{
  "model": "sonnet",
  "pollIntervalMs": 1000,
  "tmuxSession": "my-session"
}
```

You can also override the orchestrator prompt per-project by placing a file at `.sisyphus/orchestrator.md`.

## License

MIT
