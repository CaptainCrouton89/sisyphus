# Session Clone Implementation Plan

**Requirements:** `context/requirements-clone.md` (20 approved EARS requirements)
**Design:** `context/design-clone.md` (approved technical design)

## Overview

Add `sisyphus clone "goal"` — duplicates a running session's accumulated knowledge into a new independent session with a different goal. True fork: no parent-child hierarchy, no cross-session communication. ~275 lines across 8 files, single implementation phase.

## Task Table

| # | Task | Files | Est. Lines | Depends On | Requirements |
|---|------|-------|-----------|------------|--------------|
| T1 | Protocol types | `src/shared/protocol.ts`, `src/shared/history-types.ts` | ~3 | — | REQ-001, REQ-023 |
| T2 | State cloning functions | `src/daemon/state.ts` | ~100 | — | REQ-004–009, REQ-020 |
| T3 | Orchestrator forceMode | `src/daemon/orchestrator.ts` | ~2 | — | REQ-010 |
| T4 | Session manager cloneSession | `src/daemon/session-manager.ts` | ~90 | T2, T3 | REQ-007, REQ-010–012, REQ-017–023 |
| T5 | Server routing | `src/daemon/server.ts` | ~15 | T4 | REQ-022 |
| T6 | CLI command | `src/cli/commands/clone.ts` (new) | ~65 | T1 | REQ-001–003, REQ-013, REQ-015 |
| T7 | CLI registration | `src/cli/index.ts` | ~2 | T6 | REQ-001 |

## Parallel Agent Assignment

Two agents run the full plan in parallel — no file overlap between them.

### Agent A: Protocol + CLI (~70 lines)

Sequential: T1 → T6 → T7

**T1: Protocol types**
- `src/shared/protocol.ts` — Add clone request to the `Request` union (line ~3–27). One new member: `{ type: 'clone'; sessionId: string; goal: string; context?: string; name?: string; strategy?: boolean }`. Response mirrors `start`: `{ ok: true, data: { sessionId, tmuxSessionName } }`.
- `src/shared/history-types.ts` — Add `'session-cloned'` and `'cloned-from'` to the `HistoryEventType` union (line ~3–20). No new interfaces needed — event data goes in the existing `Record<string, unknown>` field.

**T6: CLI command** (`src/cli/commands/clone.ts` — new file, ~65 lines)
- Follow the `continue.ts` command pattern (import Commander, `sendRequest`, `assertTmux`).
- Arguments: `<goal>` positional, `-c, --context <text>`, `--strategy`, `-n, --name <name>`.
- Guards (before sending request):
  1. `SISYPHUS_SESSION_ID` must be set → error + exit 1 (REQ-003)
  2. `SISYPHUS_AGENT_ID` must equal `'orchestrator'` → error: "clone can only be called by the orchestrator. Use sisyphus message to ask the orchestrator to clone." + exit 1
- Send `{ type: 'clone', sessionId, goal, context, name, strategy }` via `sendRequest()`.
- Output on success (REQ-013, REQ-015) — see design §6 for exact text. Key lines: "The cloned session now owns: \"{goal}\"", "This is the other session's responsibility. You do not need to monitor it.", scope update instructions.
- Export `registerClone(program: Command)`.

**T7: CLI registration** (`src/cli/index.ts` — 2 lines)
- Add `import { registerClone } from './commands/clone.js';` in the import block (lines 10–44).
- Add `registerClone(program);` in the registration block (lines 62–95). Place after `registerContinue` for logical grouping (clone is a session lifecycle command).

### Agent B: Daemon layer (~205 lines)

Sequential: T2 + T3 (parallel) → T4 → T5

**T2: State cloning functions** (`src/daemon/state.ts` — ~100 lines)

Three new functions. Follow `createSession()` (line ~41) as the pattern.

1. **`replaceIdInDir(dir, sourceId, cloneId)`** (private) — Recursive walk of a directory. Read each file as Buffer. Skip binary files (contain null bytes in first 8KB). If text contains sourceId, `replaceAll` with cloneId, write back. Design §2 specifies the null-byte heuristic.

2. **`cloneSessionDir(sourceCwd, sourceId, cloneId, goal, context?, strategy?)`** (exported) — Creates clone session directory and populates it:
   - `cpSync` directories: `context/`, `prompts/`, `reports/`, `snapshots/` (recursive). `cpSync` is already imported at line 2.
   - Conditionally copy `strategy.md` if `strategy` flag is true (REQ-009).
   - Call `replaceIdInDir()` on each copied directory to replace source UUID with clone UUID (REQ-005).
   - Write fresh files: `goal.md` (new goal), `initial-prompt.md` (new goal), `roadmap.md` (`ROADMAP_SEED` constant — already exists in state.ts).
   - Create empty `logs/` directory.
   - Write `context/CLAUDE.md` (`CONTEXT_CLAUDE_MD` constant — already exists).
   - If `context` provided, write `context/initial-context.md`.
   - REQ-020: `cpSync` on empty dirs proceeds normally — no special handling needed.

3. **`createCloneState(sourceCwd, sourceId, cloneId, goal, context?)`** (exported) — Reads source state, constructs clone state. See design §3 for field mapping. Key points:
   - New: `id`, `task`, `status: 'active'`, `createdAt`, `activeMs: 0`, `startHour`, `startDayOfWeek`.
   - Preserved (deep copy via `structuredClone`): `agents`, `orchestratorCycles`, `messages`, `model`, `launchConfig`.
   - Omitted/reset: `completedAt`, `completionReport`, `tmuxSession*`, `wallClockMs`, `parentSessionId`, `companionCredited*`, `rollbackCount`, `resumeCount`, `continueCount`.
   - Agent normalization: any agent with `status === 'running'` → set `status: 'killed'`, `completedAt: new Date().toISOString()`, `killedReason: 'inherited from source session'`. All other statuses preserved.
   - Write state via `atomicWrite()` (existing helper, line ~34).
   - Wrap in `withSessionLock(cloneId, ...)` for safety.

**T3: Orchestrator forceMode** (`src/daemon/orchestrator.ts` — 2 lines)
- Add `forceMode?: string` as 5th parameter to `spawnOrchestrator()` (line 309). Current signature: `(sessionId, cwd, windowId, message?)` → `(sessionId, cwd, windowId, message?, forceMode?)`.
- Change line 321 from `const mode = lastCycle?.mode ?? 'strategy';` to `const mode = forceMode ?? (lastCycle?.mode ?? 'strategy');`.
- Zero impact on existing callers (all pass 4 args max).

**T4: Session manager cloneSession** (`src/daemon/session-manager.ts` — ~90 lines)

New exported function `cloneSession()`. Follow `startSession()` (line ~90) as the structural pattern.

```
cloneSession(sourceId, cwd, goal, context?, name?, strategy?) → Promise<Session>
```

Step-by-step (design §4):

1. **Validate source** — `state.getSession(cwd, sourceId)`. Check exists (REQ-022 — error handled in server.ts via tracking map). Check `status !== 'completed'` → throw error "Cannot clone completed session" (REQ-019). Active (REQ-017) and paused (REQ-018) proceed normally.

2. **Generate clone identity** — `randomUUID()` for clone ID. Validate name if provided (alphanumeric/hyphens/underscores — same regex as `startSession`). Check tmux session name collision via `tmux.sessionNameTaken()`.

3. **Filesystem** — Call `state.cloneSessionDir(cwd, sourceId, cloneId, goal, context, strategy)` then `state.createCloneState(cwd, sourceId, cloneId, goal, context)`.

4. **Model config** — Copy source `model` and `launchConfig` via `state.updateSession()`.

5. **Tmux session** — `tmux.createSession(tmuxName)`, `tmux.initSessionMeta(tmuxSessId, cwd, cloneId)`, `state.updateSessionTmux(cwd, cloneId, tmuxName, windowId, tmuxSessId)`.

6. **Track & spawn**:
   - `trackSession(cloneId, cwd, tmuxSessId, tmuxName)`
   - `resetAgentCounterFromState(cloneId, cloneState.agents)` — so new agents start after source's last number
   - Build orientation message (design §5 — "This is a **cloned session**..." text, includes sourceId, sourceGoal, newGoal, context if provided, "source session continues independently" guidance, next steps)
   - `spawnOrchestrator(cloneId, cwd, windowId, orientationMessage, 'strategy')` — uses new `forceMode` param (T3)
   - `updateTrackedWindow(cloneId, windowId)`
   - `tmux.killPane(initialPaneId)` — kill the pane tmux created with new-session

7. **History events** (REQ-023):
   - `emitHistoryEvent(sourceId, 'session-cloned', { cloneSessionId: cloneId, cloneGoal: goal })`
   - `emitHistoryEvent(cloneId, 'cloned-from', { sourceSessionId: sourceId, sourceGoal: sourceSession.task })`

8. **Haiku naming** (fire-and-forget) — Same pattern as `startSession()` lines 132–187. If `!name`, call `generateSessionName(goal).then(...)` with collision retry loop, rename tmux session, update state and tracking. Copy the block or extract a shared helper (not required per design).

9. **Housekeeping** (same as `startSession()` lines 127–199):
   - `pruneOldSessions(cwd)`
   - `pruneHistory()`
   - `try { recomputeDots(); } catch {}`
   - Companion hooks (try/catch, non-fatal):
     - `const companion = loadCompanion()`
     - `onSessionStart(companion, cwd)` — updates repo memory, daily repos, streak, title
     - `saveCompanion(companion)`
     - `fireCommentary('session-start', companion, goal)` — fire-and-forget async commentary

10. **Return** — `{ ...state.getSession(cwd, cloneId), tmuxSessionName: tmuxName }`

**Companion hooks detail:** The design lists "companion hooks" in step 9 without specifying them. Investigation of `startSession()` (lines 191–197) confirms four companion calls fire at session creation. Clone should fire all four identically — clone IS a new session from the companion's perspective. Specifically:
- `onSessionStart(companion, cwd)` — updates `repos[cwd].visits`, `dailyRepos`, `consecutiveDaysActive`, `lastActiveDate`, recomputes XP/level/title
- `saveCompanion(companion)` — persists mutations
- `fireCommentary('session-start', companion, goal)` — generates async Haiku commentary (non-blocking, records to `commentaryHistory` ring buffer)

**T5: Server routing** (`src/daemon/server.ts` — ~15 lines)

Add `case 'clone'` in `handleRequest()` (line ~160–493). Follow the `start` case pattern (lines 170–181):

```
case 'clone': {
  const tracking = sessionTrackingMap.get(req.sessionId);
  if (!tracking) return unknownSessionError(req.sessionId);
  const result = await sessionManager.cloneSession(
    req.sessionId, tracking.cwd, req.goal, req.context, req.name, req.strategy
  );
  sessionTrackingMap.set(result.id, {
    cwd: tracking.cwd,
    tmuxSession: result.tmuxSessionName,
    windowId: result.tmuxWindowId,
    tmuxSessionId: result.tmuxSessionId,
    messageCounter: 0,
  });
  persistSessionRegistry();
  return { ok: true, data: { sessionId: result.id, tmuxSessionName: result.tmuxSessionName } };
}
```

Key: look up source session's `cwd` from `sessionTrackingMap` (not from the request — clone inherits cwd). Register the new clone session in the tracking map. Call `persistSessionRegistry()` to persist cwd mapping to disk.

## Parallelism

```
Time →

Agent A: [T1: protocol+history] → [T6: clone.ts] → [T7: index.ts]
Agent B: [T2: state.ts | T3: orchestrator.ts] → [T4: session-manager.ts] → [T5: server.ts]
```

- **T1, T2, T3** have zero dependencies — all start immediately
- Agent A and Agent B have **zero file overlap** — fully parallel
- Within Agent B, T2 and T3 are independent (can be done in either order), then T4 depends on both, then T5 depends on T4

## Verification

After implementation, verify by building and running:

1. **Build**: `npm run build` — must compile without errors
2. **Unit tests**: `npm test` — existing tests must pass
3. **Manual smoke test**:
   - Start a session: `sisyphus start "test task"`
   - From orchestrator pane: `sisyphus clone "new goal"`
   - Verify clone session exists: `sisyphus list`
   - Verify clone has inherited context: check `.sisyphus/sessions/{cloneId}/context/`
   - Verify source session ID replaced in copied files
   - Verify clone orchestrator spawned in strategy mode

## Test Considerations

New tests should be added to `src/__tests__/state.test.ts` (following existing `node:test` patterns with temp dirs):

1. **`cloneSessionDir()`** — Create a source session with known files in context/, prompts/, reports/, snapshots/. Clone it. Verify:
   - All directories exist in clone
   - Source UUID replaced with clone UUID in text files
   - Binary files (with null bytes) left untouched
   - goal.md contains new goal, not source goal
   - strategy.md copied only when flag is true
   - Empty context/ proceeds without error (REQ-020)

2. **`createCloneState()`** — Create a source session with agents in various statuses. Clone state. Verify:
   - New UUID, new task, status `active`, `activeMs: 0`
   - `orchestratorCycles` and `messages` preserved (deep copy, not reference)
   - Running agents normalized to `killed` with reason
   - Terminal agents (completed, crashed, killed) preserved as-is
   - `companionCredited*` fields absent/reset

3. **`replaceIdInDir()`** — Create temp dir with text files containing a UUID and a binary file. Run replacement. Verify text files updated, binary file unchanged.

4. **CLI guard tests** (optional, in a new `src/__tests__/clone-cli.test.ts` or inline):
   - Missing `SISYPHUS_SESSION_ID` → error
   - Non-orchestrator `SISYPHUS_AGENT_ID` → error

## Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Clone fires `onSessionStart` companion hook | Clone IS a new session from companion perspective — tracks repo visits, streak, XP. Not firing would leave companion state stale. |
| Haiku naming fires for clone (fire-and-forget) | Follows `startSession()` exactly. Clone sessions deserve human-readable names. |
| `forceMode` param on `spawnOrchestrator` instead of modifying state | 2-line change, zero impact on existing callers. Modifying cycle history before spawn would be more invasive. |
| Agent normalization is defensive, not primary logic | Clone is orchestrator-only (runs between cycles), so running agents shouldn't exist. Normalization prevents `allAgentsDone()` from blocking if state is unexpectedly stale. |
| No parent-child fields set | Design is explicit: no hierarchy, no cross-session communication. `parentSessionId` field exists but is for `comeback-kid` achievement only. |
| Null-byte heuristic for binary detection | Simple, no extension allowlist to maintain. Correct for all session dir content (.md, .json). Design §2 specifies this approach. |
