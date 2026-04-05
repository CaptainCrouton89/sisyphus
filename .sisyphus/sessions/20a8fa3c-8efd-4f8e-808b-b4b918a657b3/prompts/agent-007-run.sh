#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export SISYPHUS_AGENT_ID='agent-007' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-007-plugin" --session-id "8d9c1e18-82f2-44f8-a24e-297980a7c0ba" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:comprehensive-metrics-audit t4-signals-scope-devcore:programmer c5' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-007-system.md')" '## Goal
Sisyphus metrics/analytics improvements — you are implementing T4: Signals-Snapshot Scope Fix.

## Task
Modify `src/daemon/pane-monitor.ts` to fix cross-session bleed in signals-snapshot events.

### What to do
Fix lines 287-289. Currently emits `signals-snapshot` for ALL tracked sessions on mood change. Replace the `for (const [sessionId] of trackedSessions)` loop: emit to only the first tracked session (`trackedSessions.keys().next().value`), guarded by null check.

Mood is a global companion signal — emitting to all sessions causes cross-session bleed in per-session history. The fix limits emission to a single session.

### Context
- Read `context/plan-implementation.md` for full spec (T4 section)
- Read `context/audit-architecture.md` for architectural context on this issue

### Done condition
- `npm run build` passes
- Report: what changed, file list, any issues'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %329