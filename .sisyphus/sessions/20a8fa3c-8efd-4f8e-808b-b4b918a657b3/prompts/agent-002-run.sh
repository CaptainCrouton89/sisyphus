#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export SISYPHUS_AGENT_ID='agent-002' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --model 'sonnet' --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-002-plugin" --session-id "fb3a3be4-c345-44ac-ae61-22dc7b1135f8" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:comprehensive-metrics-audit audit-gaps-explore c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-002-system.md')" 'Catalog the coverage gaps in sisyphus'\''s metrics/analytics system. Identify what we SHOULD track but currently don'\''t.

## Current tracking landscape

What IS currently tracked:
- **Session level**: activeMs, wallClockMs (completion only), createdAt, completedAt, status, model, startHour, startDayOfWeek
- **Agent level**: activeMs, spawnedAt, completedAt, status, agentType, reports
- **Cycle level**: activeMs, timestamp, completedAt, mode, agentsSpawned (agent IDs)
- **History events**: session-start, agent-spawned, agent-completed, agent-exited, cycle-boundary, signals-snapshot, session-end, message, session-named, agent-nicknamed
- **Companion stats**: strength, endurance, wisdom, patience, XP, level, baselines (Welford running stats), achievement counters
- **Session summary**: denormalized snapshot at completion — includes agents, cycles, messages, mood signals

## What to investigate

Look at these files to understand what data flows through the system that isn'\''t being captured:

1. **src/daemon/session-manager.ts** — Check handleRollback(), handleContinue(), handleRestartAgent(), handleKillAgent(), resumeSession(). Are these lifecycle events recorded in history? (Many are not.)

2. **src/daemon/pane-monitor.ts** — The timer accumulation logic is rich but the derived metrics are thin. What could we derive?
   - Inter-cycle gap time (time between orchestrator yield and next cycle start)
   - Agent utilization (what fraction of session wall time are agents actually running?)
   - Orchestrator think-time (cycle activeMs when orchestrator is running vs agents)

3. **src/daemon/agent.ts** — Agent restarts aren'\''t tracked. How many times was an agent restarted? What about the restart-agent command?

4. **src/cli/commands/history.ts** — The stats subcommand is basic. What analyses would be valuable?
   - Per-agent-type performance (which types are fastest, most reliable?)
   - Duration distributions (median session time, p90, trends over time)
   - Temporal patterns (sessions per day, busiest hours, day-of-week patterns)
   - Error rates (crash rate per agent type, per project)
   - Efficiency metrics (activeMs/wallClockMs ratio)

5. **src/daemon/companion.ts** — The baselines system (Welford) tracks running stats. Could we expose this richer data to users?

6. **src/shared/types.ts** — What fields are missing from Session, Agent, OrchestratorCycle that would enable better analytics?

## Output

Save your findings to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context/audit-coverage-gaps.md

Structure as:
1. **Missing History Events** — lifecycle transitions that aren'\''t recorded
2. **Missing Metrics** — data points we could derive but don'\''t
3. **Missing Session/Agent Fields** — type-level additions needed
4. **CLI Stats Improvements** — analyses the history command should support
5. **Priority Assessment** — rank each gap as must-have, should-have, or nice-to-have based on how useful the data would be for improving the product

Be exhaustive. Check every handler in session-manager.ts and agent.ts. Look at the actual history event types and compare against all the state transitions that happen.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %311