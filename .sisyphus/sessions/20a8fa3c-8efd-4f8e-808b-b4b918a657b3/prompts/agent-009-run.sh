#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export SISYPHUS_AGENT_ID='agent-009' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-009-plugin" --session-id "8b7f886a-5024-4443-a9d1-d7d9f9d56aba" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:comprehensive-metrics-audit t6-session-mgr-devcore:programmer c6' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-009-system.md')" 'Session goal: Improve sisyphus metrics/analytics — implement lifecycle tracking fixes in session-manager.ts.

YOUR TASK: Implement T6 from the implementation plan at context/plan-implementation.md (Phase 3, "Session Manager Lifecycle Fixes"). This is a LARGE task with 6 handler modifications in src/daemon/session-manager.ts.

READ THESE FILES FIRST:
- .sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context/plan-implementation.md (T6 section, lines 83-111)
- .sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context/audit-architecture.md (for rationale)
- src/daemon/session-manager.ts (the file you'\''ll modify)
- src/shared/types.ts (to see the new fields added in T1)
- src/shared/history-types.ts (to see new event types added in T1)

KEY DEPENDENCIES:
- `computeWisdomGain` is NOW exported from src/daemon/companion.ts (T3 completed)
- `flushAgentTimer` is available from src/daemon/pane-monitor.ts
- `emitHistoryEvent` from src/daemon/history.ts
- All new types/fields from T1 are in place

The 6 modifications (in priority order):
1. handleKillAgent() — flush timer, emit agent-killed event
2. handleRollback() — flush timers, track rollbackCount, emit rollback event (read count BEFORE restore, write AFTER)
3. resumeSession() — emit agent-exited for lost agents, emit session-resumed, track resumeCount
4. handleKill() — compute wallClockMs, persist it, include in session-end event
5. handleContinue() — track continueCount, emit session-continued
6. handleComplete() — add companionCreditedWisdom sentinel

CRITICAL PATTERNS TO FOLLOW:
- Mutate state THEN emit event (see handleAgentSubmit in agent.ts:436-442 for the pattern)
- All new Session fields are optional (rollbackCount?, resumeCount?, continueCount?, companionCreditedWisdom?)
- Use `(field ?? 0) + 1` for counter increments
- flushAgentTimer/flushTimers need to be called BEFORE reading agent activeMs values

VERIFY: npm run build must pass clean. Report all files changed and any issues.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %332