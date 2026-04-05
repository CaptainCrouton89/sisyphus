#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export SISYPHUS_AGENT_ID='agent-003' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort max --model 'opus' --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-003-plugin" --session-id "24c06d28-b98d-4d86-8dc2-119636032947" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:comprehensive-metrics-audit plan-metrics-plan c2' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-003-system.md')" 'Create a phased implementation plan for the sisyphus metrics/analytics improvements.

## Inputs

Read these files for full context:
- `.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context/audit-architecture.md` — Architecture audit with 15 issues (3 critical, 6 major, 6 minor), specific file:line references
- `.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context/audit-coverage-gaps.md` — Coverage gap analysis with missing events, fields, and CLI stats
- `.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context/initial-context.md` — File inventory

## Approved Scope

Everything below is user-approved. The plan must cover ALL of it.

### Must-fix bugs (data loss/corruption)
1. `handleKillAgent()` — emit history event + call flushTimers() before marking killed (session-manager.ts:803-822)
2. `handleRollback()` — emit rollback event + agent-exited for each killed agent (session-manager.ts:843-852)
3. Lost agents on resume — emit agent-exited events when marking agents `lost` (session-manager.ts:329-341)
4. `wallClockMs` computation on kill path — handleKill() must compute it like handleComplete() does (session-manager.ts:785)
5. Wisdom double-credit — add `companionCreditedWisdom` sentinel field to Session, use delta pattern like other stats (companion.ts:660+)
6. Signals-snapshot cross-session bleed — scope emit to only the session whose mood changed, not all tracked sessions (pane-monitor.ts:287-288)

### Must-have new tracking
- `agent-restarted` history event type + `Agent.restartCount` field (agent.ts restartAgent, shared/types.ts)
- `agent-killed` distinct history event type (distinguish user-kill from crash)
- `rollback` history event type
- `SessionSummary.crashCount` field (already computed in generateSentiment but not stored)

### Should-have
- `session-resumed` history event (resumeSession path)
- `session-continued` history event (handleContinue path)
- `OrchestratorCycle.interCycleGapMs` field — computed as delta between previous cycle completedAt and current cycle timestamp
- Per-agent-type performance table in `history --stats` (count, avg activeMs, crash rate per agent type)
- Efficiency ratio in `history --stats` (`activeMs/wallClockMs`)
- `Session.rollbackCount` / `resumeCount` / `continueCount` fields
- `SessionSummary.lostCount` / `killedAgentCount` / `efficiency` fields

### Nice-to-have (cherry-picked, DO include)
- Duration distributions (p50/p90) in `history --stats`
- Temporal pattern analysis in `history --stats` (startHour/startDayOfWeek already stored)
- Pruning fix — sessions without session.json fall back to dir mtime which resets on event appends, preventing pruning (history.ts:156-162)
- `Agent.originalSpawnedAt` field preserved across restarts

### Out of scope (do NOT plan for)
- planningMs/waitingMs on OrchestratorCycle
- pendingDayCount flush fix in companion

## Planning Requirements

1. **Investigate the actual code** before planning. Read the files referenced in the audits. Understand the exact code paths, types, and dependencies.

2. **Phase the work by dependency order.** Natural layers:
   - Type changes (new fields, new event types) must come first — everything downstream depends on them
   - Event emission fixes (the bug fixes and new events) depend on types
   - Data quality fixes (wallClockMs, wisdom, signals, pruning) can parallel event fixes if they don'\''t touch the same files
   - CLI stats improvements depend on the new summary fields being populated
   - writeSessionSummary changes to populate new fields depend on the new events existing

3. **Analyze file conflicts.** For each phase, list exactly which files are modified. Within a phase, tasks that touch the same files MUST be serialized. Tasks touching different files CAN be parallelized. This is critical for multi-agent execution.

4. **Each task must be agent-executable.** A single agent should be able to complete each task in one cycle. If a task is too large, break it down. Include enough context that an implementation agent can work without re-reading the audits.

5. **Include verification notes per phase.** How do we know each phase worked? What can be checked after implementation (build passes, specific behavior changes, etc.)?

## Output

Save the implementation plan to:
`.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context/plan-implementation.md`

Structure: phases with tasks, file lists, dependency notes, parallelism analysis, and verification criteria.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %317