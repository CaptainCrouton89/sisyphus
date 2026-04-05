#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-020' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-020-plugin" --agent 'sisyphus:explore' --session-id "4b99b2be-85f8-4118-b69a-bccf4e9ea228" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing adversarial-state-explore c11' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-020-system.md')" 'You'\''re brainstorming adversarial but REALISTIC integration test scenarios for sisyphus — a tmux-based multi-agent orchestrator.

YOUR ANGLE: State corruption, filesystem edge cases, and recovery.

Sisyphus stores state in:
- .sisyphus/sessions/{sessionId}/state.json (per-session, project-relative)
- ~/.sisyphus/{daemon.sock, daemon.pid, daemon.log, config.json} (global)
- Session dirs also contain: roadmap.md, strategy.md, goal.md, context/, reports/, prompts/, logs/

Real users encounter:
- Disk full during state.json write (atomic write via temp+rename, but temp file creation can fail too)
- state.json manually edited and now contains invalid JSON
- state.json with valid JSON but wrong schema (missing required fields, wrong types)
- Session directory partially deleted (some files missing, dir structure intact)
- Session directory on a network filesystem (NFS, SSHFS) with latency
- .sisyphus/ directory is a symlink to another location
- Multiple daemon instances somehow running (race on PID lock)
- Daemon killed with SIGKILL (no cleanup) then restarted
- Power failure mid-session — orphaned tmux panes, stale state
- User running sisyphus from different working directories pointing to same project
- Config file (config.json) with unknown keys from a newer version
- Config file with wrong types for known keys (string where number expected)
- Sessions created with an older version of sisyphus (schema migration)
- Rollback to a cycle that doesn'\''t exist
- Concurrent sisyphus CLI calls modifying same session (message + kill race)

Save your findings to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/brainstorm-state-adversarial.md

Format: List each scenario with:
- **Scenario name**
- **What the user does**
- **What breaks**
- **How to test it** (concrete steps in Docker)
- **Tier**: which Docker tier can test this'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2455