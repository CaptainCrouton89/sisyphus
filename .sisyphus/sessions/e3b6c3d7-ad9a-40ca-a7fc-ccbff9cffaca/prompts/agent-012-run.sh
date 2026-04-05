#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-012' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-012-plugin" --agent 'devcore:programmer' --session-id "978cacf7-7c7f-44b7-8d18-b25d97c80710" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing impl-gha-workflow-devcore:programmer c6' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-012-system.md')" '## Goal
Create the GitHub Actions workflow for integration tests at `.github/workflows/integration-tests.yml`.

## Session Goal
Build a comprehensive integration test suite for sisyphus that runs in Docker containers (Linux) and natively (macOS), triggered on push/PR.

## Your Task
Create `.github/workflows/integration-tests.yml` with two jobs.

Read the full implementation plan at `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/plan-implementation.md` §3.5 for detailed spec.

### Job 1: `linux-docker`
- Runs on: `ubuntu-latest`
- Steps: checkout → setup-node 22 → npm ci → npm run build → bash test/integration/run.sh
- This job uses Docker (the run.sh harness builds and runs containers)

### Job 2: `macos`
- Runs on: `macos-latest`
- Steps:
  1. actions/checkout@v4
  2. actions/setup-node@v4 (node-version: 22)
  3. npm ci
  4. npm run build
  5. npm pack
  6. Install globally: `npm install -g sisyphi-*.tgz`
  7. Swift notification build: `bash native/build-notify.sh`
  8. Verify .app exists: `test -d ~/.sisyphus/SisyphusNotify.app`
  9. Doctor smoke test: `sisyphus doctor` (exits 0 regardless — some checks may warn)

### Workflow triggers:
```yaml
on:
  push:
    branches: [main]
  pull_request:
```

### Important notes:
- macOS GHA runners have Xcode CLI tools (swiftc available)
- macOS job does NOT use Docker — tests run natively
- `sisyphus doctor` always exits 0, so this step won'\''t fail the job
- The launchd plist test is intentionally omitted (GHA runners have limited launchd)
- Keep workflow file clean and well-commented

### Context files (read if needed):
- `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/plan-implementation.md` §3.5

Report what you built and any design decisions.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2419