#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-006' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-006-plugin" --agent 'devcore:programmer' --session-id "36340ce2-5e94-483b-9021-4703ee0b31e9" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing impl-dockerfile-devcore:programmer c3' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-006-system.md')" 'Create the integration test Dockerfile at test/integration/Dockerfile.

Read context/plan-implementation.md §3.1 for the complete specification.

Key requirements:
- Three stages: base, tmux, full — each FROM the previous
- Base: FROM node:22 (NOT slim, NOT alpine — node-pty needs glibc + build tools)
- Pre-seed config: mkdir -p /root/.sisyphus && echo '\''{"autoUpdate":false}'\'' > /root/.sisyphus/config.json (BEFORE npm install)
- Copy tarball: COPY sisyphi-*.tgz /tmp/ then npm install -g /tmp/sisyphi-*.tgz
- Copy test files: COPY lib/ /tests/lib/ and COPY suites/ /tests/suites/ then chmod +x
- Tmux: apt-get update && apt-get install -y --no-install-recommends tmux && rm -rf /var/lib/apt/lists/*
- Full: apt-get install neovim + create claude mock (printf '\''#!/bin/sh\ntrue\n'\'' > /usr/local/bin/claude && chmod +x)

The Dockerfile will be used with a staged build context (harness copies tarball + test files into a temp dir). So paths are relative to that staging dir — no test/integration/ prefix in COPY commands.

Create the directory structure as needed.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2400