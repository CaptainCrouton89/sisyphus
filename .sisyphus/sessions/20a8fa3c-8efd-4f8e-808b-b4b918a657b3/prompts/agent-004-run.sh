#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export SISYPHUS_AGENT_ID='agent-004' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-004-plugin" --session-id "f01742d0-f11d-429f-b919-6e985c8bf0fc" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:comprehensive-metrics-audit t1-types-devcore:programmer c4' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-004-system.md')" '## Goal
Add new type fields and event types for the metrics/analytics improvement. This is pure additive type work — no runtime changes.

## Session Goal
Audit and improve the sisyphus metrics/analytics system — add missing tracking fields, event types, and summary data.

## Task: T1 — Type & Schema Changes

### File 1: `src/shared/types.ts`

**Agent interface (line 88):** Add two optional fields after `killedReason?` (line 104):
```ts
restartCount?: number;
originalSpawnedAt?: string;
```

**Session interface (line 50):** Add four optional fields after `companionCreditedStrength?` (line 78):
```ts
rollbackCount?: number;
resumeCount?: number;
continueCount?: number;
companionCreditedWisdom?: number;
```

**OrchestratorCycle interface (line 109):** Add one optional field after `activeMs` (line 113):
```ts
interCycleGapMs?: number;
```

### File 2: `src/shared/history-types.ts`

**HistoryEventType (line 3):** Append 5 members to the string union before the semicolon:
```
'\''agent-killed'\'' | '\''agent-restarted'\'' | '\''rollback'\'' | '\''session-resumed'\'' | '\''session-continued'\''
```

**SessionSummary (line 60):** Add these required fields after `achievements` (line 79):
```ts
crashCount: number;
lostCount: number;
killedAgentCount: number;
rollbackCount: number;
efficiency: number | null;
```

**SessionSummaryAgent (line 31):** Add one optional field after `completedAt` (line 39):
```ts
restartCount?: number;
```

### Verification
Run `npm run build` — it must pass cleanly. Type errors in downstream consumers are expected and fine — they'\''ll be fixed in Phase 2. The build should still pass because existing code doesn'\''t reference the new fields yet (all additive).

### Important
- All new Session/Agent/OrchestratorCycle fields are OPTIONAL (`?:`) — backward compat with persisted JSON
- SessionSummary new fields are REQUIRED (no `?`) — they'\''re always populated by `writeSessionSummary()`
- SessionSummaryAgent.restartCount is OPTIONAL — old summaries won'\''t have it
- Follow existing code style exactly (spacing, comment patterns)'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %324