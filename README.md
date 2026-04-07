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

Sisyphus runs multiple Claude Code instances in tmux panes and coordinates them. That's it. Every agent is a real `claude` process with full access to your codebase, your CLAUDE.md, your hooks. Sisyphus just handles the "run N of them in parallel and loop until done" part.

If you know the [Ralph Wiggum loop](https://ghuntley.com/ralph/) (`while true; do claude --prompt task.md; done`), this is that idea taken further. Instead of one agent in a loop, an orchestrator decomposes work into parallel agents, each looping independently, with structured state that persists across cycles. The orchestrator itself is in a Ralph loop: plan, spawn agents, get killed, respawn fresh with all the results.

## How it works

Most hard tasks aren't hard because any single piece is difficult. They're hard because there are many pieces and context gets lost between them. You're working a 12-file refactor, you hold it all in your head until you don't, and you make a mistake three files from the end because you forgot a constraint from the beginning.

The fix is structural. An orchestrator Claude instance reads the full task, breaks it into subtasks, and spawns parallel agent instances, each in its own tmux pane with a focused instruction. Agents work simultaneously and submit reports when done. Then the orchestrator respawns to review progress and plan the next round.

The trick: the orchestrator is stateless. After it spawns agents and yields, it gets killed. When all agents finish, the daemon respawns a fresh orchestrator with the complete session state (every agent report, every cycle's history, the running plan). Cycle 1 and cycle 15 get the same quality of reasoning because each one starts with a full context window and a clean slate. The boulder rolls back down; Sisyphus walks back down after it, picks it up, and pushes again. But this time he remembers everything from every previous push.

The daemon handles lifecycle: spawning panes, detecting when agents finish, persisting state to disk, respawning the orchestrator.

## Requirements

- Node.js >= 22
- tmux >= 3.2 (you must be inside a tmux session)
- Claude Code CLI (`claude`) installed and authenticated
- Neovim (optional, enables embedded editor in the dashboard)

## Install

```bash
npm install -g sisyphi
```

Then run setup once:

```bash
sisyphus setup
```

This installs the background daemon (macOS launchd), tmux keybindings (`M-s` to cycle sessions, `M-S` for dashboard), and checks your environment. The daemon auto-updates when new versions are published.

Verify:

```bash
sisyphus doctor
```

## Quick start

```bash
sisyphus start "your task description"    # Start a session
sisyphus dashboard                        # Open the TUI (auto-opens on start)
sisyphus status                           # Check session state from the CLI
```

Sisyphus is a CLI that Claude Code calls for you. Tell Claude to use it and it handles the rest.

In Claude Code, say something like:

> Use sisyphus to migrate our REST API from Express to Hono. The API lives in src/api/ with 14 route files...

Claude calls `sisyphus start` with a detailed task description, and tmux panes start appearing with parallel agents working on your codebase.

### Slash command (recommended)

Create `.claude/commands/sisyphus-begin.md` in your project:

~~~markdown
Run `sisyphus start` with a detailed task description:

```bash
sisyphus start "your task description"
```

Write a thorough task description. Include what needs to be built or fixed, where relevant code lives, what done looks like, constraints, and adjacent concerns (don't break X, keep Y working). More context produces better results. The orchestrator figures out how to break it down.

Example:
```bash
sisyphus start "Rip out our hand-rolled RBAC system and replace it with a proper policy engine. Current implementation is scattered across 20+ middleware files in src/middleware/auth/ that each do their own role checks with hardcoded string comparisons. Replace with a centralized policy engine in src/auth/policies/ using a declarative permission model — define resources, actions, and role mappings in a single config, then write one middleware that evaluates policies. Migrate every route that currently calls requireRole() or checkPermission() to the new system. The admin panel (src/routes/admin/) has the most complex rules including org-scoped permissions and delegated access — those need to work exactly as before. Add integration tests that cover the full matrix: superadmin, org-admin, member, and guest across every protected endpoint. Don't break the public API routes in src/routes/v1/public/. The existing test suite (npm test) must pass when you're done."
```
~~~

Then type `/sisyphus-begin` followed by your task in Claude Code.

Or just add a note to your `CLAUDE.md`:

```markdown
## Sisyphus
For large tasks, use the `sisyphus` CLI to orchestrate parallel agents.
Run `sisyphus start "detailed task description"` inside tmux.
```

### Interactive tutorial

New to tmux or sisyphus? Run the guided walkthrough:

```bash
sisyphus getting-started
```

Covers tmux basics, neovim essentials, sisyphus concepts, and a live demo session.

## Dashboard

Full-screen TUI for watching and controlling sessions.

```bash
sisyphus dashboard    # or press M-S (Alt-Shift-S)
```

Auto-opens when you `sisyphus start`.

Left panel is a session tree (sessions, cycles, agents, reports) with status indicators. Right panel shows detail for whatever's selected: roadmap, agent instructions, report content, live pane output. If neovim is available, files open in an embedded editor. Bottom bar has mode and keybinding hints.

Key bindings:

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

Compose mode opens a temp file in neovim for multi-line input (new sessions, messages, resume instructions). Falls back to tmux popups without neovim.

## Agent types

Agents can be spawned with role templates that set their model, behavior, and capabilities. The orchestrator discovers available types and matches them to subtasks.

### Built-in types

| Type | Description |
|------|-------------|
| `sisyphus:worker` | Generic agent (default) |
| `sisyphus:plan` | Plan lead, breaks work into phases |
| `sisyphus:spec` | Interactive design + requirements spec session |
| `sisyphus:problem` | Problem exploration and assumption challenging |
| `sisyphus:review` | Code review |
| `sisyphus:review-plan` | Plan review with parallel sub-reviewers |
| `sisyphus:debug` | Systematic debugging investigation |
| `sisyphus:explore` | Lightweight code exploration |
| `sisyphus:operator` | QA/testing with browser automation |
| `sisyphus:test-spec` | Test specification writing |

### Custom agent types

Create a markdown file with YAML frontmatter:

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

Resolution order (first match wins):
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

`gpt-` and `codex-` prefixed models automatically route to the OpenAI provider (Codex CLI).

## Tmux integration

### Status bar

The daemon puts a live status indicator in your tmux status bar, scoped to the current working directory:

- Yellow dot: orchestrator processing
- Yellow diamond: agents running
- Green dot: session completed
- Red dot: waiting for input
- Gray: idle / between cycles

Updates every 5 seconds. Focused session is highlighted.

### Keybindings

Installed by `sisyphus setup` into `~/.sisyphus/tmux.conf`:

| Key | Action |
|-----|--------|
| `M-s` | Cycle through sisyphus sessions in current project |
| `M-S` | Jump to dashboard window |
| `prefix-x` | Smart kill: pane or session depending on context |

### Native notifications (macOS)

Sisyphus builds a native notification helper (`SisyphusNotify.app`) during install. Notifications fire on session completion, agent crashes, and other lifecycle events. Clicking one switches your terminal to the relevant session.

Falls back to `terminal-notifier` or `osascript` if the native app isn't available.

## Companion

A persistent character that tracks your work across sessions. Earns XP, levels up (30 levels from *Boulder Intern* to *The Absurd Hero*), unlocks achievements, and shifts mood based on usage patterns (time of day, session length, crash frequency, efficiency).

Shows up as a mood-colored face in the tmux status bar, generates commentary on lifecycle events via Haiku, and has 66 unlockable badges.

```bash
sisyphus companion              # View profile, stats, and achievements
sisyphus companion --badges     # Full achievement gallery
sisyphus companion --name Bub   # Rename your companion
```

`Space` → `c` in the dashboard opens the companion overlay.

## Configuration

Project `.sisyphus/config.json` overrides global `~/.sisyphus/config.json`:

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

Session lifecycle: `start`, `kill`, `resume`, `continue`, `rollback`, `complete`

Agent and orchestrator: `spawn`, `submit`, `report`, `yield`, `message`, `restart-agent`, `update-task`

Monitoring: `status` (`--verbose`), `list` (`--all`), `dashboard`

Setup: `setup`, `init`, `doctor`, `getting-started`, `companion`, `uninstall`

### history

Browse session history and metrics.

```bash
sisyphus history                        # List recent sessions
sisyphus history <session-id>           # Inspect a specific session
sisyphus history --stats                # Aggregate statistics
sisyphus history --events               # Raw event timeline
```

| Option | Description |
|--------|-------------|
| `--cwd <path>` | Filter by project directory |
| `--status <status>` | Filter by status (`completed`, `killed`) |
| `--since <duration>` | Filter by recency (e.g. `7d`, `24h`, `2w`) |
| `--search <query>` | Search task text and messages |
| `--events` | Show raw event timeline |
| `--stats` | Show aggregate statistics |
| `--json` | Output as JSON |
| `-n, --limit <n>` | Max sessions to show (default: 20) |

### clone

Clone a session into a new independent session with a different goal.

```bash
sisyphus clone "new goal"
sisyphus clone "new goal" --strategy    # carry over strategy.md from source
sisyphus clone "new goal" --name my-clone --context "extra context"
```

Useful for branching off a variant approach without starting from scratch.

### present

Render a markdown file via termrender in a tmux split pane — agent-to-user visual feedback.

```bash
sisyphus present report.md
sisyphus present report.md --interactive    # open in nvim, block until closed
sisyphus present report.md --width 120
```

### reconnect

Reconnect the daemon to an orphaned tmux session (e.g. after a daemon restart). Makes no state changes and does not spawn the orchestrator.

```bash
sisyphus reconnect <session-id>
```

### delete

Delete a session and all its data.

```bash
sisyphus delete <session-id>
sisyphus delete <session-id> --cwd /path/to/project
```

### requirements / design (standalone TUI tools)

Interactive terminal tools for reviewing requirements and designs. These are standalone entry points, not daemon-connected.

```bash
sisyphus-review <requirements.json>   # Interactive EARS requirements reviewer
sisyphus-design <design.json>         # Interactive technical design walkthrough
```

These are review TUIs invoked by `sisyphus:spec` (and usable standalone for inspecting any `requirements.json` / `design.json`).

---

`sisyphus --help` or `sisyphus <command> --help` for full usage.

## License

MIT
