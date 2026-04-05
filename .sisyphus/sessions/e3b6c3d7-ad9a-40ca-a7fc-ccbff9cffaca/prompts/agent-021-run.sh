#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-021' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-021-plugin" --agent 'sisyphus:explore' --session-id "7d4b1b81-ce70-49a7-a304-589c0ef6bf3f" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing adversarial-lifecycle-explore c11' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-021-system.md')" 'You'\''re brainstorming adversarial but REALISTIC integration test scenarios for sisyphus — a tmux-based multi-agent orchestrator.

YOUR ANGLE: Session lifecycle, orchestrator/agent interaction, and protocol edge cases.

The lifecycle flow:
1. `sisyphus start "task"` → daemon creates session, spawns orchestrator in tmux pane
2. Orchestrator updates roadmap.md, spawns agents via `sisyphus spawn`, calls `sisyphus yield`
3. Daemon kills orchestrator pane, polls agent panes for completion
4. Agents call `sisyphus submit --report "..."` when done
5. When all agents finish, daemon respawns orchestrator (next cycle)
6. Orchestrator can call `sisyphus complete` to end session

Real users encounter:
- Orchestrator crashes without yielding (no yield, no complete — just dies)
- Agent submits report after session was already killed
- Agent submits empty report
- Agent pane killed externally (user closes it, tmux kill-pane)
- Multiple agents submit simultaneously
- `sisyphus yield` called twice rapidly
- `sisyphus complete` called while agents are still running
- `sisyphus message` sent to a completed session
- `sisyphus restart-agent` on an agent that'\''s still running
- Session started with empty task string
- Session started with extremely long task string (10KB+)
- `sisyphus spawn` with no task argument
- Orchestrator spawns 50+ agents (resource exhaustion)
- Network partition between CLI and daemon (socket timeout mid-request)
- Daemon restart while sessions are active
- `sisyphus continue` on a session that was never completed
- `sisyphus rollback` to cycle 0

Save your findings to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/brainstorm-lifecycle-adversarial.md

Format: List each scenario with:
- **Scenario name**
- **What the user does**
- **What breaks**
- **How to test it** (concrete steps in Docker)
- **Tier**: which Docker tier can test this'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2456