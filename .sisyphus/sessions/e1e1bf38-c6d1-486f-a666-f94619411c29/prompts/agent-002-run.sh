#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e1e1bf38-c6d1-486f-a666-f94619411c29' && export SISYPHUS_AGENT_ID='agent-002' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --model 'sonnet' --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/prompts/agent-002-plugin" --session-id "94523483-89fc-480b-b5c2-98ec322c5670" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:session-fork-management explore-integration-explore c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/prompts/agent-002-system.md')" 'Map all technical integration points in the sisyphus codebase that session branching/forking would need to touch.

## Goal
Produce a comprehensive map of every module, function, and data structure that would need modification to support session branching — where one session can spawn child sessions (forks) with a parent-child relationship.

## Key Areas to Investigate

### 1. State Model (src/shared/types.ts, src/daemon/state.ts)
- `Session.parentSessionId` — already exists but unused. What other fields are needed?
- How does `state.createSession()` work? What would change for a forked session?
- Snapshot system — does forking interact with rollback/snapshots?

### 2. Session Lifecycle (src/daemon/session-manager.ts)
- `startSession()` — how would `forkSession()` differ?
- `handleComplete()` — what happens when a fork completes? Parent notification?
- `handleKill()` — killing a parent with active forks?
- `resumeSession()` — resuming a parent after fork completion?
- `pruneOldSessions()` — should forks be pruned differently?

### 3. Protocol (src/shared/protocol.ts)
- What new request types are needed? (`fork`, `list-forks`, `fork-status`)
- How does `status` response change to show fork relationships?

### 4. CLI (src/cli/commands/)
- Which existing commands need fork-awareness? (status, list, kill)
- What new commands are needed?

### 5. Pane Monitor (src/daemon/pane-monitor.ts)
- How does tracking change when parent/fork sessions exist?
- Does fork completion trigger anything in the parent?

### 6. Orchestrator (src/daemon/orchestrator.ts)
- Should the orchestrator know about forks? Can it initiate them?
- How is fork state shown in the orchestrator prompt?

### 7. TUI (src/tui/)
- Session list — how to display parent/fork hierarchy?
- Dashboard dots — fork indicators?

### 8. Companion (src/daemon/companion.ts)
- `comeback-kid` achievement already checks `parentSessionId`
- Should forks contribute to companion stats independently?

### 9. History (src/daemon/history.ts)
- Fork events in the event log
- Session summary for forked sessions

Save your findings to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context/explore-integration-points.md'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %349