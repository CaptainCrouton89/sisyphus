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
- **tmux** (you must be inside a tmux session)
- **Claude Code** CLI (`claude`) installed and authenticated

## Install

```bash
npm install -g sisyphi
```

The daemon starts automatically on first use via launchd. It auto-updates when new versions are published.

## Usage

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

### Monitoring and stopping

```bash
sisyphus status              # Check session state
sisyphus kill <session-id>   # Stop everything
```

## Configuration

Project (`.sisyphus/config.json`) overrides global (`~/.sisyphus/config.json`):

```json
{
  "model": "sonnet",
  "autoUpdate": true
}
```

## License

MIT
