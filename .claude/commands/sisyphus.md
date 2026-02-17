---
description: Quick reference for using sisyphus multi-agent orchestration
---

# Sisyphus Quick Reference

Sisyphus is a tmux-based daemon that orchestrates multi-agent Claude Code workflows. A background daemon manages sessions where an orchestrator breaks work into subtasks, spawns agents in tmux panes, and coordinates their lifecycle through cycles.

## Start the daemon

```bash
sisyphus start "your task description"
```

This creates a session, spawns an orchestrator Claude in a tmux pane. The orchestrator plans work, spawns agents, then yields. Agents work in parallel and submit reports. The orchestrator respawns each cycle to review progress.

## Key commands

| Command | Purpose |
|---------|---------|
| `sisyphus start "task"` | Create a session and launch the orchestrator |
| `sisyphus status` | Check current session state |
| `sisyphus list` | List all sessions |
| `sisyphus resume <id>` | Resume a paused session |
| `sisyphus tasks list` | View tracked tasks |
| `sisyphus spawn --instruction "..."` | Spawn an agent (orchestrator only) |
| `sisyphus yield` | Hand control back to daemon (orchestrator only) |
| `sisyphus submit --report "..."` | Report results (agent only) |
| `sisyphus complete --report "..."` | Mark session done (orchestrator only) |

## How it works

1. **You** run `sisyphus start` with a high-level task
2. **Orchestrator** decomposes it, adds tasks, spawns agents, yields
3. **Agents** work in parallel tmux panes, submit reports when done
4. **Daemon** detects completion, respawns orchestrator with updated state
5. **Orchestrator** reviews reports, spawns more agents or completes

Orchestrator pane is yellow. Agent panes cycle through blue, green, magenta, cyan, red, white.
