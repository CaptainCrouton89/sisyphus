# Cycle 1

**Status:** completed  |  **Duration:** 2m 20s
**Started:** Apr 4, 20:37:21
**Completed:** Apr 4, 20:39:44
**Mode:** planning
**Claude Session:** 48a799df-e37d-430d-8df6-f66a872eba66


---


## Agents

### agent-001 — problem-branching
- **Status:** completed  |  **Duration:** 7m 55s
- **Type:** sisyphus:problem

**Instruction:**

Explore the problem space for session branching/forking in sisyphus.

## Context
Sisyphus is a tmux-integrated daemon that orchestrates Claude Code multi-agent workflows. Sessions have a lifecycle: start → orchestrator cycles (spawning agents, yielding, respawning) → complete. During a session, unrelated issues often arise that need attention but shouldn't pollute the current session's context/roadmap. We need a mechanism to "branch" — spin up a focused sub-session for the tangent, then return to the original.

## What Exists
- `Session.parentSessionId` field exists in `src/shared/types.ts` but is never populated
- The `comeback-kid` achievement in `src/daemon/companion.ts` checks `session.parentSessionId != null` but is unearnable
- Sessions are fully isolated: own UUID, session dir, tmux session, state.json, context/, roadmap
- Session lifecycle is managed by `src/daemon/session-manager.ts`

## Questions to Explore

### User Workflow
1. What triggers the need to branch? (Bug found during feature work, urgent fix needed, exploratory tangent)
2. What does "return to parent" mean concretely? (Switch tmux session? Auto-resume parent?)
3. Should the parent session pause while a fork runs, or continue concurrently?
4. Can a fork itself be forked? (Tree of sessions vs flat parent-child)
5. What happens when a fork completes? Does anything flow back to the parent? (Context? Summary?)

### Interaction Model Options
Evaluate these models against the workflows above:
- **Git-like**: fork creates a snapshot, runs independently, parent continues. No merge.
- **Process-like**: fork pauses parent, runs to completion, parent resumes with fork's summary injected as a message.
- **Concurrent**: parent and fork run simultaneously on the same codebase. Fork is just a linked session.
- **Hybrid**: user chooses pause/continue at fork time.

### CLI Surface
- What command creates a fork? (`sisyphus fork "task"`, `sisyphus branch "task"`)
- Can an orchestrator fork programmatically? (During a cycle, spawn a sub-session instead of an agent)
- How does the user navigate between parent and forks? (tmux, sisyphus CLI, TUI)

### Edge Cases
- What if the parent is killed while a fork is running?
- What if a fork runs longer than expected?
- Multiple forks from the same parent — how does the user track them?
- Fork from a paused session — is that meaningful?

Save your thinking document to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context/problem-session-branching.md

**Latest report** (final, Apr 4, 20:47:12):**

Session branching mechanism designed (~30 lines): child outputs flow via context files (not messages) with bidirectional parent-child refs and orchestrator prompt framing.

### agent-002 — explore-integration
- **Status:** completed  |  **Duration:** 2m 40s
- **Type:** sisyphus:explore

**Instruction:**

Map all technical integration points in the sisyphus codebase that session branching/forking would need to touch.

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

Save your findings to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context/explore-integration-points.md

**Latest report** (final, Apr 4, 20:42:12):**

Mapped 9 required modules for session branching: core fork logic, protocol routes, and history events identified.



---


## Next Prompt

Problem and explore agents are running. Review their reports in context/problem-session-branching.md and context/explore-integration-points.md. Synthesize findings, identify the interaction model, and seek user alignment on key decisions before drafting requirements. Key questions: (1) should parent pause or continue during fork? (2) does fork completion inject a summary back? (3) can orchestrators fork programmatically?

