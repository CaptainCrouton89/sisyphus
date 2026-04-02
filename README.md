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

## What this is

Sisyphus is a thin orchestration layer on top of Claude Code. It doesn't replace Claude Code or wrap it in some abstraction — it just runs multiple Claude Code instances in tmux panes and coordinates them. Every agent is a real `claude` process with full access to your codebase, your tools, your CLAUDE.md, your hooks. You keep all the steerability of Claude Code; sisyphus just handles the "run N of them in parallel and loop until done" part.

If you're familiar with the [Ralph Wiggum loop](https://ghuntley.com/ralph/) — `while true; do claude --prompt task.md; done` — sisyphus is that idea taken further. Instead of one agent in a loop, you get an orchestrator that decomposes work into parallel agents, each looping independently, with structured state that persists across cycles. The orchestrator itself is in a Ralph loop: it plans, spawns agents, gets killed, and respawns fresh with all the results. Same principle, more leverage.

## How it works

Most hard tasks aren't hard because any single piece is difficult — they're hard because there are many pieces and context gets lost between them. A developer working a 12-file refactor holds it all in their head until they don't, then makes a mistake three files from the end because they forgot a constraint from the beginning.

Sisyphus solves this structurally. An **orchestrator** Claude instance reads the full task, breaks it into subtasks, and spawns parallel **agent** Claude instances — each in its own tmux pane with a focused instruction. Agents work simultaneously, submit reports when they're done, and the orchestrator respawns to review progress and plan the next round.

The key mechanism: **the orchestrator is stateless**. After it spawns agents and yields, it gets killed. When all agents finish, the daemon respawns a fresh orchestrator with the complete session state — every agent report, every cycle's history, the running plan. This means the orchestrator never degrades. Cycle 1 and cycle 15 get the same quality of reasoning, because each cycle starts with a full context window and a clean slate. The boulder rolls back down; Sisyphus walks back down after it, picks it up, and pushes again — but this time he remembers everything from every previous push.

The daemon handles the lifecycle: spawning panes, detecting when agents finish, persisting state to disk, respawning the orchestrator. You just describe what you want built and watch it work.

## Requirements

- **Node.js** >= 22
- **tmux** >= 3.2 (you must be inside a tmux session)
- **Claude Code** CLI (`claude`) installed and authenticated
- **Neovim** (optional — enables embedded editor in the dashboard)

## Install

```bash
npm install -g sisyphi
```

Then run one-time setup:

```bash
sisyphus setup
```

This installs the background daemon (macOS launchd), tmux keybindings (`M-s` to cycle sessions, `M-S` for dashboard), and checks your environment. The daemon auto-updates when new versions are published.

Verify everything is working:

```bash
sisyphus doctor
```

## Quick start

```bash
sisyphus start "your task description"    # Start a session
sisyphus dashboard                        # Open the TUI (auto-opens on start)
sisyphus status                           # Check session state from the CLI
```

Sisyphus is a CLI that Claude Code calls for you. You tell Claude to use it, and Claude handles the rest — calling `sisyphus start`, writing the task description, and kicking off the orchestration loop.

In Claude Code, just say something like:

> Use sisyphus to migrate our REST API from Express to Hono. The API lives in src/api/ with 14 route files...

Claude will call `sisyphus start` with a detailed task description, and tmux panes will start appearing with parallel agents working on your codebase.

### Setting up a slash command (recommended)

Create a file at `.claude/commands/sisyphus-begin.md` in your project:

~~~markdown
Run `sisyphus start` with a detailed task description:

```bash
sisyphus start "your task description"
```

**Write a thorough task description.** Include what needs to be built or fixed, where relevant code lives, what done looks like, constraints or preferences, and adjacent concerns (don't break X, keep Y working). More context produces better results — the orchestrator figures out how to break it down.

**Example:**
```bash
sisyphus start "Rip out our hand-rolled RBAC system and replace it with a proper policy engine. Current implementation is scattered across 20+ middleware files in src/middleware/auth/ that each do their own role checks with hardcoded string comparisons. Replace with a centralized policy engine in src/auth/policies/ using a declarative permission model — define resources, actions, and role mappings in a single config, then write one middleware that evaluates policies. Migrate every route that currently calls requireRole() or checkPermission() to the new system. The admin panel (src/routes/admin/) has the most complex rules including org-scoped permissions and delegated access — those need to work exactly as before. Add integration tests that cover the full matrix: superadmin, org-admin, member, and guest across every protected endpoint. Don't break the public API routes in src/routes/v1/public/. The existing test suite (npm test) must pass when you're done."
```
~~~

Then in Claude Code, type `/sisyphus-begin` followed by your task and Claude will use sisyphus to orchestrate it.

Alternatively, add a note to your `CLAUDE.md`:

```markdown
## Sisyphus
For large tasks, use the `sisyphus` CLI to orchestrate parallel agents.
Run `sisyphus start "detailed task description"` inside tmux.
```

### Interactive tutorial

If you're new to tmux or sisyphus, run the guided walkthrough:

```bash
sisyphus getting-started
```

Six steps covering tmux basics, neovim essentials, sisyphus concepts, and a live demo session.

## Dashboard

The dashboard is a full-screen TUI for monitoring and controlling sessions in real time.

```bash
sisyphus dashboard    # or press M-S (Alt-Shift-S)
```

It auto-opens when you `sisyphus start` a session.

**Layout:**

- **Left panel** — Session tree with collapsible hierarchy: sessions → cycles → agents → reports. Status indicators show active/completed/paused state at a glance.
- **Right panel** — Context-sensitive detail view for the selected node: session roadmap, agent instructions, report content, or live pane output. Opens files in an embedded neovim instance when available.
- **Bottom bar** — Current mode, keybinding hints, and transient notifications.

**Key bindings:**

| Key | Action |
|-----|--------|
| `j/k` or `↑/↓` | Navigate tree / scroll detail |
| `h/l` or `←/→` | Collapse/expand nodes |
| `n` | New session (compose mode) |
| `R` | Resume a paused/completed session |
| `w` | Jump to session's tmux window |
| `g` | Edit goal | 
| `p` | Open roadmap |
| `m` | Message orchestrator |
| `r` | Re-run agent |
| `x` | Restart agent |
| `Space` | Leader menu (copy, delete, spawn agent, shell, etc.) |
| `Tab` | Cycle panel focus |
| `/` | Search sessions |
| `?` | Help overlay |

Compose mode opens a temp file in the embedded neovim for multi-line input (new sessions, messages, resume instructions). Falls back to tmux popups if neovim isn't available.

## Agent types

Agents can be spawned with role templates that define their model, behavior, and capabilities. The orchestrator discovers available types automatically and uses them to match the right agent to each subtask.

### Built-in types

Sisyphus ships these agent types:

| Type | Description |
|------|-------------|
| `sisyphus:worker` | Generic agent (default) |
| `sisyphus:plan` | Plan lead — breaks work into phases |
| `sisyphus:design` | Technical design and architecture |
| `sisyphus:requirements` | EARS-based requirements analysis |
| `sisyphus:problem` | Problem exploration and assumption challenging |
| `sisyphus:review` | Code review |
| `sisyphus:review-plan` | Plan review with parallel sub-reviewers |
| `sisyphus:debug` | Systematic debugging investigation |
| `sisyphus:explore` | Lightweight code exploration |
| `sisyphus:operator` | QA/testing with browser automation |
| `sisyphus:test-spec` | Test specification writing |

### Custom agent types

Define your own by creating a markdown file with YAML frontmatter:

```markdown
---
name: security-reviewer
description: Reviews code for security vulnerabilities
model: opus
color: red
effort: high
skills: [capture]
permissionMode: bypassPermissions
interactive: false
---

You are a security-focused code reviewer. Analyze the code for OWASP top 10
vulnerabilities, injection risks, auth bypasses, and data exposure...
```

**Resolution order** (first match wins):
1. `.claude/agents/{name}.md` (project-local)
2. `~/.claude/agents/{name}.md` (user-global)
3. Bundled `sisyphus:{name}`
4. Installed Claude Code plugins

### Frontmatter options

| Field | Description |
|-------|-------------|
| `model` | LLM model (`opus`, `sonnet`, `gpt-4`, `codex-mini`, etc.) |
| `color` | Tmux pane border color |
| `effort` | `low` / `medium` / `high` / `max` |
| `interactive` | `true` = agent can pause for user input |
| `skills` | Claude Code skills to enable |
| `permissionMode` | Permission handling mode |

Models prefixed with `gpt-` or `codex-` automatically route to the OpenAI provider (Codex CLI).

## Tmux integration

### Status bar

The daemon renders a live status indicator into your tmux status bar showing all sessions scoped to the current working directory:

- **Yellow dot** — orchestrator processing
- **Yellow diamond** — agents running
- **Green dot** — session completed
- **Red dot** — waiting for input
- **Gray** — idle / between cycles

Session phases update every 5 seconds. The currently focused session is highlighted.

### Keybindings

Installed by `sisyphus setup` into `~/.sisyphus/tmux.conf`:

| Key | Action |
|-----|--------|
| `M-s` | Cycle through sisyphus sessions in current project |
| `M-S` | Jump to dashboard window |
| `prefix-x` | Smart kill — kills pane or session depending on context |

### Native notifications (macOS)

On macOS, sisyphus builds a native notification helper (`SisyphusNotify.app`) during install. Notifications fire on session completion, agent crashes, and other lifecycle events. Clicking a notification switches your terminal to the relevant session.

Falls back to `terminal-notifier` or `osascript` if the native app isn't available.

## Companion

The companion is a persistent character that tracks your work across sessions. It earns XP, levels up (30 levels from *Boulder Intern* to *The Absurd Hero*), unlocks achievements, and shifts mood based on your usage patterns — time of day, session length, crash frequency, efficiency.

It manifests as:
- A mood-colored face in the tmux status bar (updates in real time)
- Commentary on lifecycle events (session start, level-up, late-night coding) generated by Haiku
- An achievement gallery with 66 unlockable badges across milestone, session, time, and behavioral categories

```bash
sisyphus companion              # View profile, stats, and achievements
sisyphus companion --badges     # Full achievement gallery
sisyphus companion --name Bub   # Rename your companion
```

In the dashboard, press `Space` → `c` to open the companion overlay.

## Configuration

Project (`.sisyphus/config.json`) overrides global (`~/.sisyphus/config.json`):

```json
{
  "model": "sonnet",
  "orchestratorEffort": "high",
  "agentEffort": "medium",
  "pollIntervalMs": 5000,
  "autoUpdate": true,
  "notifications": {
    "enabled": true,
    "sound": "/System/Library/Sounds/Hero.aiff"
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `model` | *(Claude Code default)* | LLM model for orchestrator and agents |
| `orchestratorEffort` | `high` | Effort level for orchestrator (`low`/`medium`/`high`/`max`) |
| `agentEffort` | `medium` | Effort level for agents |
| `orchestratorPrompt` | *(built-in)* | Path to custom orchestrator system prompt |
| `pollIntervalMs` | `5000` | Daemon poll interval in milliseconds |
| `autoUpdate` | — | Auto-update via npm on new releases |
| `notifications.enabled` | `true` | Desktop notifications on lifecycle events |
| `notifications.sound` | macOS Hero | Notification sound file path |
| `requiredPlugins` | `[devcore]` | Claude Code plugins to auto-install for agents |

## CLI reference

**Session lifecycle:**
`start`, `kill`, `resume`, `continue`, `rollback`, `complete`

**Agent & orchestrator interaction:**
`spawn`, `submit`, `report`, `yield`, `message`, `restart-agent`, `update-task`

**Monitoring:**
`status` (`--verbose`), `list` (`--all`), `dashboard`

**Setup & utilities:**
`setup`, `init`, `doctor`, `getting-started`, `companion`, `uninstall`

Run `sisyphus --help` or `sisyphus <command> --help` for full usage.

## License

MIT
