# Session Clone Design

Technical architecture for `sisyphus clone "goal"` — duplicates a running session's accumulated knowledge into a new independent session with a different goal. True fork: no parent-child hierarchy, no cross-session communication. **Orchestrator-only** command.

## Data Flow

```
CLI (clone.ts)
  │ reads SISYPHUS_SESSION_ID + SISYPHUS_AGENT_ID from env
  │ rejects non-orchestrator callers
  │ sends clone request over Unix socket
  ▼
Daemon (server.ts)
  │ resolves partial session ID
  │ looks up cwd from tracking map
  ▼
SessionManager (session-manager.ts)
  │ validates source (exists, not completed)
  │ delegates filesystem work to state.ts
  │ creates tmux session
  │ spawns orchestrator in strategy mode at cycle N+1
  ▼
Orchestrator (orchestrator.ts)
  │ receives clone orientation in user prompt
  ▼
Running clone session
```

---

## 1. Protocol & Routing

### Request Type (`src/shared/protocol.ts`)

Add to `Request` union:
```typescript
| { type: 'clone'; sessionId: string; goal: string; context?: string; name?: string; strategy?: boolean }
```

Response: `{ ok: true, data: { sessionId: string; tmuxSessionName: string } }` — mirrors `start`.

### History Events (`src/shared/history-types.ts`)

Add to `HistoryEventType` union:
```typescript
| 'session-cloned'    // emitted on SOURCE session
| 'cloned-from'       // emitted on CLONE session
```

Event data:
- `session-cloned`: `{ cloneSessionId, cloneGoal }`
- `cloned-from`: `{ sourceSessionId, sourceGoal }`

### Server Routing (`src/daemon/server.ts`)

Add `case 'clone'` in `handleRequest()`:
```typescript
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

---

## 2. Directory Cloning Algorithm

### What Gets Copied (`src/daemon/state.ts`)

```
.sisyphus/sessions/{sourceId}/        .sisyphus/sessions/{cloneId}/
├── state.json          ──────►       ├── state.json (new — see §3)
├── goal.md             ──────►       ├── goal.md (new goal)
├── initial-prompt.md   ──────►       ├── initial-prompt.md (new goal)
├── roadmap.md          ──────►       ├── roadmap.md (seed template)
├── strategy.md         ─ ─ ─►       ├── strategy.md (only with --strategy)
├── context/            ══════►       ├── context/ (deep copy + ID replace)
├── prompts/            ══════►       ├── prompts/ (deep copy + ID replace)
├── reports/            ══════►       ├── reports/ (deep copy + ID replace)
├── snapshots/          ══════►       ├── snapshots/ (deep copy + ID replace)
└── logs/               ──────►       └── logs/ (fresh empty)

══════► = recursive copy with session ID replacement
──────► = created fresh
─ ─ ─► = conditional
```

New exported function `cloneSessionDir()` in `state.ts`:
1. `cpSync` each directory (context, prompts, reports, snapshots)
2. Conditionally copy strategy.md if `--strategy` flag
3. Replace source ID with clone ID in all text files
4. Write fresh goal.md, initial-prompt.md, roadmap.md, logs/
5. Write initial-context.md if `--context` provided

### Session ID Replacement

Private `replaceIdInDir()` function — recursive walk:
- Read file as raw Buffer
- Skip binary files (contain null bytes)
- If text contains source UUID, `replaceAll` with clone UUID
- Write back

Null-byte heuristic for text detection: simple, no extension allowlist to maintain, correct for all session dir content (`.md`, `.json`, etc.).

---

## 3. State Model

### Clone state.json Construction (`src/daemon/state.ts`)

New exported function `createCloneState()`:

| Field | Value | Source |
|-------|-------|--------|
| `id` | new UUID | generated |
| `task` | new goal | positional arg |
| `context` | `--context` text | flag |
| `cwd` | same | source |
| `status` | `'active'` | fresh |
| `createdAt` | now | fresh |
| `activeMs` | `0` | reset |
| `agents` | deep copy | source (with normalization) |
| `orchestratorCycles` | deep copy | source |
| `messages` | deep copy | source |
| `model` | same | source |
| `launchConfig` | same | source |
| `startHour/startDayOfWeek` | now | fresh |

**Not copied** (reset/omitted): `completedAt`, `completionReport`, `tmuxSession*`, `wallClockMs`, `parentSessionId`, `companionCredited*`, `rollbackCount/resumeCount/continueCount`.

### Agent Status Normalization

Clone is **orchestrator-only** — the orchestrator runs after agents complete, so running agents are normally absent. Defensive normalization kept as safety net:

Any agent with `status === 'running'` → `{ status: 'killed', completedAt: now, killedReason: 'inherited from source session' }`.

All other terminal statuses preserved as-is. This prevents `allAgentsDone()` (`agent.ts:492`) from blocking orchestrator respawn.

`resetAgentCounterFromState()` scans inherited agent IDs — new agents start after source's last number.

---

## 4. Session Manager Flow (`src/daemon/session-manager.ts`)

New exported function `cloneSession()`:

```
cloneSession(sourceId, cwd, goal, context?, name?, strategy?)
  │
  ├─ 1. Validate source
  │     ├─ getSession() — exists?
  │     └─ status !== 'completed'?  (REQ-019)
  │
  ├─ 2. Generate clone UUID, validate name, check tmux collision
  │
  ├─ 3. Filesystem: cloneSessionDir() + createCloneState()
  │
  ├─ 4. Model config: updateSession({ model, launchConfig })
  │
  ├─ 5. Tmux: createSession(), initSessionMeta(), updateSessionTmux()
  │
  ├─ 6. Track & spawn
  │     ├─ trackSession() + resetAgentCounterFromState()
  │     ├─ spawnOrchestrator(cloneId, cwd, windowId, orientation, 'strategy')
  │     ├─ updateTrackedWindow() + killPane(initialPaneId)
  │
  ├─ 7. History events
  │     ├─ emitHistoryEvent(sourceId, 'session-cloned', ...)
  │     └─ emitHistoryEvent(cloneId, 'cloned-from', ...)
  │
  ├─ 8. Haiku naming (fire-and-forget, same as startSession)
  │
  └─ 9. pruneOldSessions + pruneHistory + recomputeDots + companion hooks
```

Follows `startSession()` pattern exactly. Haiku naming block is identical — can extract shared helper but not required.

---

## 5. Orchestrator Orientation

### forceMode Parameter (`src/daemon/orchestrator.ts`)

Add optional `forceMode?: string` parameter to `spawnOrchestrator()`:

```typescript
// Line ~321:
const mode = forceMode ?? (lastCycle?.mode ?? 'strategy');
```

2-line change, zero impact on existing callers.

### Orientation Message

Passed as `message` parameter to `spawnOrchestrator()`. Appears in user prompt as `## Continuation Instructions`:

```markdown
This is a **cloned session**, forked from an existing session.

Source session: {sourceId}
Previous goal: {sourceGoal}

You have full access to the previous session's context/, reports/,
and cycle history. Use them as background for your work.

Your new goal is: {newGoal}

### Additional Context
{context text, if --context provided}

**Important**: The source session continues independently.
It is the other session's responsibility. You do not need to monitor it.

### Next Steps
1. Review inherited context/ and reports/
2. Write strategy.md for your approach
3. Update roadmap.md with your work plan
4. Begin delegating work to agents
```

The `formatStateForOrchestrator()` already provides: `## Goal` (new), `## Context` (inherited dir), `### Most Recent Cycle` (agent reports), `## Strategy` (empty unless `--strategy`), `## Roadmap` (seed).

---

## 6. CLI Command (`src/cli/commands/clone.ts`)

### Argument Parsing

```
sisyphus clone <goal> [-c, --context <text>] [--strategy] [-n, --name <name>]
```

### Guards
1. `SISYPHUS_SESSION_ID` must be set (REQ-003)
2. `SISYPHUS_AGENT_ID === 'orchestrator'` — orchestrator-only policy at CLI layer. Non-orchestrator callers get: `"clone can only be called by the orchestrator. Use sisyphus message to ask the orchestrator to clone."`

### Output (REQ-013, REQ-015)

```
Session cloned successfully.
  Clone: {cloneId}
  Tmux:  {tmuxSessionName}

The cloned session now owns: "{goal}"
This is the other session's responsibility. You do not need to monitor it.

Update your scope:
- Remove cloned work from goal.md
- Update roadmap.md to reflect reduced scope
- Update strategy.md if approach changes
```

No monitor commands, no file paths, no `tail -f`. Every line is orchestrator guidance.

### Registration

Add `registerClone` import and call in `src/cli/index.ts`.

---

## 7. Error Handling

| Condition | Where | Message | Exit |
|---|---|---|---|
| `SISYPHUS_SESSION_ID` not set | `clone.ts` | "not set. Run this from an orchestrator or agent pane." | CLI exit 1 |
| `SISYPHUS_AGENT_ID !== 'orchestrator'` | `clone.ts` | "clone can only be called by the orchestrator." | CLI exit 1 |
| Source session completed | `session-manager.ts` | "Cannot clone completed session. Use continue." | Daemon throw |
| Session not found | `server.ts` | "Unknown session: {id}." | `{ok:false}` |
| Invalid `--name` | `session-manager.ts` | "only alphanumeric, hyphens, underscores" | Daemon throw |
| Tmux name collision | `session-manager.ts` | "Tmux session already exists." | Daemon throw |
| Active session (REQ-017) | — | Proceeds normally | — |
| Paused session (REQ-018) | — | Proceeds normally; source stays paused | — |
| Empty context/ (REQ-020) | — | Proceeds normally; cpSync copies empty dir | — |
| Multiple clones (REQ-021) | — | Each gets fresh UUID | — |

---

## 8. File Change Manifest

**New files (1):**
- `src/cli/commands/clone.ts` (~65 lines)

**Modified files (7):**
1. `src/shared/protocol.ts` — Add clone request to union (1 line)
2. `src/shared/history-types.ts` — Add 2 event types (2 lines)
3. `src/daemon/state.ts` — Add `replaceIdInDir()`, `cloneSessionDir()`, `createCloneState()` (~100 lines)
4. `src/daemon/session-manager.ts` — Add `cloneSession()` (~90 lines)
5. `src/daemon/server.ts` — Add `case 'clone'` (~15 lines)
6. `src/daemon/orchestrator.ts` — Add `forceMode` parameter (2 lines)
7. `src/cli/index.ts` — Register clone command (2 lines)

**Total**: ~275 lines across 8 files.

---

## Requirements Coverage

All 20 approved requirements mapped:

| REQ | Coverage |
|-----|----------|
| REQ-001 | CLI reads env, sends request, prints guidance |
| REQ-002 | `--context`, `--strategy`, `--name` flags |
| REQ-003 | Missing session ID → exit 1 |
| REQ-004 | context/ recursive copy in cloneSessionDir() |
| REQ-005 | replaceIdInDir() with null-byte text detection |
| REQ-006 | goal.md written in cloneSessionDir() |
| REQ-007 | createCloneState() preserves history, resets identity |
| REQ-008 | prompts/, reports/, snapshots/ copied; fresh logs/ |
| REQ-009 | --strategy flag → conditional copy |
| REQ-010 | spawnOrchestrator with forceMode='strategy' at cycle N+1 |
| REQ-011 | Orientation message in continuation instructions |
| REQ-012 | --context text appended to orientation |
| REQ-013 | CLI output: "other session's responsibility" |
| REQ-015 | CLI output: scope update instructions |
| REQ-017 | Active sessions clone normally |
| REQ-018 | Paused sessions clone normally |
| REQ-019 | Completed sessions rejected |
| REQ-020 | Empty context/ proceeds normally |
| REQ-021 | Multiple clones → independent UUIDs |
| REQ-022 | Unknown session → error with ID |
| REQ-023 | session-cloned + cloned-from history events |
