# Daemon Layer Failure Mode Analysis

## Critical Findings (High Impact, Realistic)

### 1. Race condition: session name rename after state read
**File:** `src/daemon/session-manager.ts:100-107`
**What goes wrong:** The fire-and-forget name generation flow does `state.getSession()` on line 105 *outside* the session lock, then uses the result to call `state.updateSessionTmux()`. Between those calls, another operation could mutate the session. The `tmuxWindowId` read from `state.getSession()` could be stale.
**How realistic:** Weekly — happens whenever naming completes during a concurrent state mutation (agent spawn, yield, etc.).
**How to test:** Trigger a session start with a slow Haiku response, simultaneously spawn agents.

### 2. `pane-exited` handler: pane unregistered before state update
**File:** `src/daemon/server.ts:286-294`
**What goes wrong:** `unregisterPane(req.paneId)` is called on line 292 *before* `handlePaneExited()` on line 293. If `handlePaneExited()` throws, the pane is gone from the registry but session state was never updated — the agent stays in `running` status forever. Subsequent `pane-exited` events for the same pane return `{ok:true}` with no effect (line 286: `if (!entry) return { ok: true }`).
**How realistic:** Monthly — any throw in `handlePaneExited` (e.g., state file corrupted, disk full) leaves a zombie agent.
**How to test:** Corrupt a `state.json` mid-session, then kill an agent pane.

### 3. `respawningSessions` guard leak on early return
**File:** `src/daemon/session-manager.ts:331-333`
**What goes wrong:** In `onAllAgentsDone()`, if `session.status !== 'active'` (line 331), the guard is deleted (line 332) and the function returns without respawning. But if the status was changed by a race (e.g., pane monitor paused it during the yield→respawn window), the session is now stuck: it's `paused` with no orchestrator, and the guard that would have protected it is gone. The CLAUDE.md even documents this as "path (2) — the dangerous one."
**How realistic:** Weekly under load — the pane monitor runs every 5s and can race with `setImmediate` callbacks.
**How to test:** Kill the orchestrator pane while agents are finishing.

### 4. Message ID collision after daemon restart
**File:** `src/daemon/server.ts:21,308-309`
**What goes wrong:** `messageCounter` is in-memory, initialized to 0 for all sessions (including resumed ones). After daemon restart, new messages get IDs like `msg-001` that may already exist on disk.
**How realistic:** Daily — daemon restarts happen regularly (updates, `sisyphusd restart`).
**How to test:** Send messages, restart daemon, send more messages, check for duplicates.

### 5. `handleRequest` promise not awaited — error swallowed on connection drop
**File:** `src/daemon/server.ts:377-380`
**What goes wrong:** `handleRequest(req).then(...)` — the promise is fire-and-forget. If the connection is destroyed before the response is written (line 378 checks `conn.destroyed`), the response is silently dropped. More importantly, if `handleRequest` rejects, there's no `.catch()` — this is an **unhandled promise rejection**.
**How realistic:** Common — CLI has a 10s timeout. Long operations (session start with slow Haiku, rollback) can exceed it. Client disconnects, response dropped silently. The missing `.catch()` means unhandled rejections.
**How to test:** Start a session, kill the CLI before the daemon responds.

### 6. Haiku SDK call has no timeout
**File:** `src/daemon/haiku.ts:11-28`
**What goes wrong:** The `query()` call and the `for await` loop have no timeout. If the SDK hangs (network issue, API degradation), the caller hangs forever. Since callers are fire-and-forget, this leaks a promise that never resolves, consuming memory.
**How realistic:** Monthly — API degradation happens. The `for await` loop is particularly vulnerable — a connection that stays open but never sends data will hang indefinitely.
**How to test:** Block outbound HTTPS to Anthropic API, trigger session naming.

### 7. `var initialPaneId` in `resumeSession` — hoisted variable
**File:** `src/daemon/session-manager.ts:226`
**What goes wrong:** `var initialPaneId = created.initialPaneId;` uses `var` (not `let`/`const`) — it's hoisted to function scope. This isn't a bug *today* but is fragile: any refactoring that adds an early return or reorders the else-branch could silently leave `initialPaneId` as `undefined` and skip the cleanup `killPane` on line 268.
**How realistic:** Low (code smell, not a current bug).

---

## Medium Findings (Moderate Impact)

### 8. `atomicWrite` — temp file left behind on crash
**File:** `src/daemon/state.ts:34-39`
**What goes wrong:** If the process crashes after `writeFileSync(tmpPath, ...)` but before `renameSync(tmpPath, filePath)`, the `.state.*.tmp` file is left behind. These accumulate in the session directory. Not a correctness issue (rename is atomic), but disk clutter.
**How realistic:** Rare but permanent — tmp files never cleaned up.
**How to test:** Kill daemon mid-write (SIGKILL during heavy state mutations).

### 9. `writeStatusBar` — non-atomic render, blank on error
**File:** `src/daemon/status-bar.ts:173-252`
**What goes wrong:** If any section throws (e.g., `tmux.listAllPanes()` fails because tmux is temporarily unavailable), the entire function throws and `@sisyphus_status` is never set — status bar goes blank until the next successful poll.
**How realistic:** Occasional — tmux can be temporarily unresponsive during heavy operations.

### 10. `pollSession` — TOCTOU on pane liveness
**File:** `src/daemon/pane-monitor.ts:291,319-346`
**What goes wrong:** `listPanes(windowId)` is called once (line 291), then used to check liveness of multiple agents (lines 319-351). Between the list and the check, a pane can exit. More critically, between detecting a dead pane and calling `handleAgentKilled`, the pane could have already been handled by a concurrent `pane-exited` event from the server, leading to double-processing.
**How realistic:** Weekly — agents finishing simultaneously trigger both the pane-exited hook and the monitor poll.
**How to test:** Kill multiple agent panes simultaneously.

### 11. `companion.ts` concurrent writes
**File:** `src/daemon/companion.ts:41-48`
**What goes wrong:** `saveCompanion()` uses its own atomic write (temp+rename), but there's no mutex. Multiple concurrent `loadCompanion()`→modify→`saveCompanion()` cycles can race, with the last writer winning. Session-manager fires companion hooks from multiple async paths (session-start, agent-spawn, agent-crash, session-complete).
**How realistic:** Weekly — session completion fires multiple companion writes (completion + level-up + achievement), and they race.

### 12. `ensureStatusRightIntegration` — regex may match wrong content
**File:** `src/daemon/status-bar.ts:147-152`
**What goes wrong:** The `#[fg=` insertion point (line 151) matches the first occurrence, which could be inside a conditional or another plugin's format string. The status reference gets injected into the middle of someone else's format string, corrupting it.
**How realistic:** Depends on user's tmux config. If they have custom status-right with `#[fg=`, this fires incorrectly.

### 13. `sessionTrackingMap` not restored for tmux/window after restart
**File:** `src/daemon/server.ts:27-35, 37-44`
**What goes wrong:** `persistSessionRegistry()` only writes `cwd` (line 32). After daemon restart, sessions are recovered with `cwd` but no `tmuxSession` or `windowId`. Operations requiring `windowId` (like `submit`) will fail with "No tmux window found."
**How realistic:** Every daemon restart with active sessions. The recovery path in `index.ts` (not shown) presumably handles this, but any session that starts between the write and the crash will have incomplete state.

---

## Low-Priority Findings

### 14. Session name format characters break status bar
**File:** `src/daemon/status-bar.ts` (general), `src/daemon/session-manager.ts:47-49`
**What goes wrong:** The `NAME_PATTERN` regex (`/^[a-zA-Z0-9_-]+$/`) allows names that are safe for tmux, but auto-generated names from Haiku (line 85-131) aren't validated against tmux format special characters — `#`, `{`, `}` would break format strings. The sanitization on line 13 of summarize.ts (`/^[a-zA-Z0-9_-]+$/` check) catches this, but only after the Haiku response.
**How realistic:** Low — Haiku rarely generates names with special characters.

### 15. `pruneOldSessions` — `rmSync` recursive on session dirs
**File:** `src/daemon/session-manager.ts:185`
**What goes wrong:** If `sessionDir()` resolves to an unexpected path (e.g., symlink shenanigans), `rmSync({ recursive: true, force: true })` could delete more than intended. The `force: true` flag suppresses errors.
**How realistic:** Very low — requires adversarial filesystem setup.

### 16. `allAgentsDone` returns false when `agents.length === 0`
**File:** `src/daemon/agent.ts:467-469`
**What goes wrong:** `allAgentsDone` requires `session.agents.length > 0`. If an orchestrator yields without spawning any agents, `allAgentsDone` returns false. The session-manager handles this (line 482-494 in handleYield), but if `handleSubmit` is somehow called with an empty agents list, it returns false incorrectly.
**How realistic:** Very low — the guard in handleYield covers this path.

### 17. `flashCompanion` double-call hazard
**File:** `src/daemon/status-bar.ts:30-33`
**What goes wrong:** Calling `flashCompanion` twice within a flash window overwrites `flashText` immediately but keeps the original `flashUntil`. The newer text expires at the first call's timestamp.
**How realistic:** Common on session-complete — completion + level-up + achievement each fire `flashCompanion`. Only the last one's text is visible, and it may expire early.

---

## Companion System Overview

### `companion.ts`
A gamification/personality system. Tracks XP, levels, mood, achievements, repo memory. Persisted to `~/.sisyphus/companion.json`. Has its own atomic write but no mutex (see finding #11). The `computeMood()` function is complex but purely cosmetic — failures here don't affect session operation. All companion hooks are wrapped in try/catch in session-manager.

### `companion-commentary.ts`
Generates one-liner flavor text via Haiku for lifecycle events. Has built-in randomness (`shouldGenerateCommentary` returns false for some events). The `callHaiku` dependency has the no-timeout issue (finding #6). All calls are fire-and-forget. `agent-crash` events have only 30% chance of generating commentary.

**Failure modes:** Both files are well-isolated — all companion errors are caught at the session-manager level and never propagate. The main risk is the concurrent write race (#11) causing lost XP/achievements, which is cosmetic but annoying.

---

## Summary: Top 5 Most Actionable

1. **#5 — Missing `.catch()` on `handleRequest` promise** — unhandled rejection, production bug
2. **#2 — Pane unregistered before state update** — zombie agents on any throw
3. **#3 — Respawn guard leak** — documented but unfixed, causes stuck sessions
4. **#4 — Message ID collision** — data corruption on every daemon restart
5. **#6 — No timeout on Haiku calls** — memory leak on API degradation
