#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-003' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-003-plugin" --agent 'sisyphus:explore' --session-id "d44d5f0a-1bd3-4c7d-9e90-e794afe85565" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing explore-doctor-explore c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-003-system.md')" 'Map all sisyphus doctor checks to expected outcomes per Docker environment tier.

## Context
We'\''re building a Docker-based integration test matrix with these environment tiers:
1. **base** — Node 22 only (no tmux, no claude, no nvim, no git maybe)
2. **+tmux** — Node 22 + tmux + git
3. **+nvim** — Node 22 + tmux + git + neovim
4. **+claude-mock** — Node 22 + tmux + git + neovim + a fake "claude" binary on PATH
5. **+full** — Everything above combined

We need to know exactly what `sisyphus doctor` will report in each tier.

## What to Do
1. Read src/cli/commands/doctor.ts thoroughly — map every check function
2. For each check, determine: what external command/file/path it probes, what makes it ok/warn/fail
3. Build a matrix: check × environment tier → expected status (ok/warn/fail)
4. Identify which checks are macOS-only (skip on Linux Docker)
5. Identify what a "Claude CLI mock" needs to be — is `which claude` enough or does it need to respond to commands?
6. Note: the daemon won'\''t be running when doctor first runs — understand what doctor reports about daemon state

Also check: Does doctor have an exit code that reflects pass/fail? (for CI assertions)

## Files to Read
- src/cli/commands/doctor.ts (primary — all check functions)
- src/cli/onboard.ts (detectTerminal, checkItermOptionKey, isNvimAvailable, isBeginCommandInstalled)
- src/cli/tmux-setup.ts (cycleScriptPath, getExistingBinding, isSisyphusBinding, sisyphusTmuxConfPath)
- src/cli/install.ts (isInstalled)

## Output
Save findings to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/explore-doctor-matrix.md

Format the matrix as a markdown table for easy consumption in the design phase.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2390