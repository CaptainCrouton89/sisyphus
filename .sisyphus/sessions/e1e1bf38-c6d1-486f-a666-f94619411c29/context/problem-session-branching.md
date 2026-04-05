# Problem: Session Cloning in Sisyphus

## Problem Statement

During a sisyphus session, the scope often needs to split — a sub-problem is big enough to warrant its own full session, or the user wants to redirect part of the work to a separate orchestration thread. Today, the only option is to start a fresh session from scratch, losing all accumulated context (exploration findings, design decisions, integration maps, strategy).

The user needs to **clone** a running session — duplicate it with a new ID and new goal — so the clone starts with all the accumulated knowledge but diverges to focus on its carved-off responsibility. The original session updates itself to reflect the handoff.

## Key Insight (from user alignment)

This is NOT a parent-child relationship. It's a **clone-and-diverge** operation:
- The clone is a fully independent session — no hierarchy, no completion hooks, no context flowing back
- It's a copy of the session directory with a new ID and new goal
- Both sessions run independently after the clone
- The original session is informed that responsibility was handed off (via hints in the tool output, not automatic injection)

The prior exploration's parent-child model was wrong. The user explicitly rejected:
- Parent-child hierarchy
- Completion notification flowing back to parent
- Context file injection into parent on child completion
- Any ongoing relationship between the sessions

## User Workflows

### Primary: User asks orchestrator to clone
1. User is in session A working on a large feature
2. User messages orchestrator: "clone yourself to handle the auth token refresh work"
3. Orchestrator runs `sisyphus clone "handle auth token refresh"`
4. CLI duplicates session dir, replaces IDs, registers new session, spawns orchestrator
5. CLI prints extensive guidance back to the calling orchestrator about what to update
6. Original orchestrator updates its own goal/roadmap/strategy to remove the handed-off scope
7. Clone session starts, sees accumulated context + new goal, reorients its roadmap/strategy

### Secondary: Orchestrator-initiated
Same mechanism — orchestrator decides a sub-problem is big enough and runs the clone command. Less common because the user usually drives this decision.

## Design Decisions

### Clone, not child
- No `parentSessionId`, no `childSessionIds`, no hierarchy
- No completion hooks or cross-session notification
- Sessions share no state after the clone moment
- The `comeback-kid` achievement remains separate (tied to session resume, not cloning)

### What gets cloned
- **Copy**: `context/` (accumulated knowledge), `strategy.md`, `roadmap.md`, `goal.md`
- **Reset**: `state.json` (new ID, new task, fresh cycles/agents/messages), `prompts/`, `reports/`, `snapshots/`, `logs/`
- Context files need grep-replace of old session ID → new session ID (paths reference session IDs)

### Extensive output as orchestrator guidance
The tool output is the primary mechanism for informing the orchestrator. Following "every output is a prompt" principle:
- Confirm what was cloned and where
- List what files were copied and what IDs were replaced
- Provide explicit next-step instructions for the original session (update goal, roadmap, strategy)
- Emphasize that the clone is independent — don't coordinate with it

### Clone starts in strategy mode
The clone has all the context but a new goal. It needs to reorient: update strategy and roadmap for the new scope. Strategy mode is the right starting point.

## Technical Integration (from explore agent)

The integration points map from the explore agent is partially relevant — the protocol, CLI command, and state changes apply but the parent-child lifecycle hooks do NOT.

Relevant modules:
- `src/shared/protocol.ts` — new `clone` request type
- `src/daemon/state.ts` — `cloneSession()` function (copy dir, replace IDs, create fresh state)
- `src/daemon/session-manager.ts` — `cloneSession()` wrapping state + tmux session creation
- `src/daemon/server.ts` — route `clone` request
- `src/cli/commands/clone.ts` — new CLI command with extensive output
- `src/shared/history-types.ts` — `session-cloned` event type (for history tracking only)

NOT relevant (from original explore):
- No changes to `companion.ts` (no parent-child achievement changes)
- No changes to `orchestrator.ts` (no child report injection)
- No changes to TUI tree view (no hierarchy display)
- No changes to `pane-monitor.ts`
- No changes to `status.ts` or `list.ts` for hierarchy display

## Resolved (by requirements)

All open questions resolved in `requirements-clone.md`:
- Command: `sisyphus clone "goal"`
- No automatic message to source session — guidance in CLI output only
- Clone always starts in strategy mode at cycle N+1
- digest.json resets (not copied)
- History events: `session-cloned` on source, `cloned-from` on clone (audit only)
