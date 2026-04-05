#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export SISYPHUS_AGENT_ID='agent-001' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --model 'sonnet' --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-001-plugin" --session-id "718dc6d2-526c-424a-947f-514d34f2bccd" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:comprehensive-metrics-audit audit-arch-explore c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/prompts/agent-001-system.md')" 'Audit the architecture of sisyphus'\''s metrics/analytics system. Produce a critique document.

## What to investigate

Trace every point where metrics data is emitted, stored, or aggregated. The key files are:
- src/daemon/history.ts — history event emission and session summary writes
- src/shared/history-types.ts — history type definitions
- src/daemon/state.ts — session state mutations (where timing data is persisted)
- src/shared/types.ts — core types (Session, Agent, OrchestratorCycle)
- src/daemon/session-manager.ts — session lifecycle (emits most history events)
- src/daemon/pane-monitor.ts — active time tracking (in-memory timers, mood signals)
- src/daemon/companion.ts — companion stats (strength, endurance, wisdom, patience, baselines)
- src/daemon/agent.ts — agent spawn/completion/kill (emits agent events)
- src/cli/commands/history.ts — history CLI (reads and displays metrics)

## What to look for

1. **Scattered tracking** — metrics emission is spread across 6+ files. Is there a pattern or is it ad-hoc? Are there inconsistencies in what'\''s recorded where?

2. **Duplicated data** — companion.ts tracks sessionsCompleted, totalActiveMs, lifetimeAgentsSpawned. Session summaries track similar data. History events have overlapping info. Where does duplication create inconsistency risk?

3. **Missing abstractions** — Is there a need for a centralized metrics module? Currently emitHistoryEvent() is called inline throughout session-manager.ts and agent.ts. Should there be a higher-level API?

4. **Data model issues** — history-types.ts defines SessionSummary as a denormalized snapshot. Types.ts defines Session with live state. Are these aligned? Are there fields that should exist on one but don'\''t?

5. **Consistency problems** — Are all state transitions covered by history events? Check: does every path that changes agent status emit an event? Does every session lifecycle change get recorded?

6. **Active time accuracy** — pane-monitor.ts has complex timer logic. Are there edge cases where time is lost or double-counted?

7. **wallClockMs handling** — it'\''s computed at handleComplete but not handleKill. Is this intentional? What about paused sessions?

## Output

Save your findings to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/20a8fa3c-8efd-4f8e-808b-b4b918a657b3/context/audit-architecture.md

Structure as:
1. **Architecture Overview** — How metrics flow through the system today
2. **Issues Found** — Each with severity (critical/major/minor), specific file:line references, and description
3. **Observations** — Patterns that work well and should be preserved

Be thorough and specific. Reference actual code, not abstractions.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %310