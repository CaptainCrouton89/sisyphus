# Adversarial Integration Tests: State Corruption, Filesystem Edge Cases, Recovery

## 1. Invalid JSON in state.json

- **Scenario name**: Corrupted state.json parse failure
- **What the user does**: Manually edits `state.json` (adds a trailing comma, deletes a brace, or writes plain text)
- **What breaks**: `getSession()` calls `JSON.parse()` which throws. Every state mutation path (`updateAgent`, `appendMessage`, etc.) fails. The session becomes completely unresponsive — no status, no kill, no rollback.
- **How to test it**:
  1. Start a session: `sisyphus start "test task"`
  2. Write garbage to state.json: `echo "not json" > .sisyphus/sessions/$SID/state.json`
  3. Run `sisyphus status` — expect graceful error, not crash
  4. Run `sisyphus kill $SID` — should still clean up tmux panes
  5. Verify daemon stays alive (check socket responds)
- **Tier**: Tier 1 (basic Docker, no tmux needed for the parse test; tmux needed for kill verification)

## 2. Valid JSON, wrong schema

- **Scenario name**: Schema-invalid state.json
- **What the user does**: Edits state.json to remove `agents` array, change `status` to an integer, or set `cwd` to null
- **What breaks**: `getSession()` returns a malformed `Session` object. Downstream code does `session.agents.slice()` on undefined → TypeError. `session.orchestratorCycles.push()` on missing array → crash.
- **How to test it**:
  1. Start session, capture state path
  2. `jq 'del(.agents)' state.json > tmp && mv tmp state.json`
  3. Send a `spawn` request via CLI — daemon should return an error, not crash
  4. Try with `status: 999`, `cwd: null`, `messages: "not an array"`
- **Tier**: Tier 1

## 3. Disk full during atomic write

- **Scenario name**: ENOSPC on temp file creation during state save
- **What the user does**: Normal operation while filesystem fills up (large logs, docker volume limit)
- **What breaks**: `atomicWrite()` calls `writeFileSync(tmpPath, data)` which throws ENOSPC. The state mutation is lost. Worse: the in-memory session lock resolves, so the next caller reads stale state from disk. If the temp file was partially written before ENOSPC, it's left as garbage on disk (never renamed, never cleaned up).
- **How to test it**:
  1. Create a small tmpfs: `mount -t tmpfs -o size=1M tmpfs /project/.sisyphus`
  2. Start a session (creates ~2KB state)
  3. Fill the remaining space: `dd if=/dev/zero of=/project/.sisyphus/filler bs=1K count=1000`
  4. Trigger a state write: `sisyphus message $SID "hello"`
  5. Verify: daemon doesn't crash, error is surfaced, old state.json is still intact
  6. Check for orphaned `.state.*.tmp` files
- **Tier**: Tier 2 (needs tmpfs mount, root-ish permissions)

## 4. state.json deleted mid-session

- **Scenario name**: State file disappears while session is active
- **What the user does**: `rm .sisyphus/sessions/$SID/state.json` (accidental cleanup, rogue script)
- **What breaks**: Next `getSession()` throws ENOENT. `atomicWrite` rename target dir still exists so new writes would work — but no code path recreates state from scratch. Session is zombied: tmux panes still running, daemon has in-memory tracking, but all state mutations fail.
- **How to test it**:
  1. Start session, let agents spawn
  2. `rm .sisyphus/sessions/$SID/state.json`
  3. Agent calls `sisyphus submit` → daemon tries `updateAgent()` → ENOENT
  4. `sisyphus status` → should report error, not crash
  5. `sisyphus kill $SID` → should still clean up tmux panes even without state file
- **Tier**: Tier 1

## 5. Session directory partially deleted

- **Scenario name**: Partial session dir (state exists, prompts/context dirs missing)
- **What the user does**: `rm -rf .sisyphus/sessions/$SID/prompts` or `rm -rf .sisyphus/sessions/$SID/context`
- **What breaks**: Orchestrator spawn writes prompt files to `prompts/` → ENOENT crash. Context injection reads `contextDir` → ENOENT or empty results, possibly crashes in `readdirSync`.
- **How to test it**:
  1. Start session, wait for cycle 1 to complete
  2. Delete prompts dir: `rm -rf .sisyphus/sessions/$SID/prompts`
  3. Trigger next cycle (agents submit) — orchestrator respawn should fail gracefully
  4. Delete context dir and trigger cycle — should degrade, not crash
- **Tier**: Tier 2 (needs full lifecycle with tmux + Claude mock)

## 6. .sisyphus/ is a symlink

- **Scenario name**: Project sisyphus dir is a symlink to another location
- **What the user does**: `ln -s /shared/sisyphus-state .sisyphus` (shared state across machines, or separating state from repo)
- **What breaks**: `atomicWrite` creates temp file in `dirname(statePath)` which resolves through the symlink — rename across filesystem boundaries fails with EXDEV if symlink target is on a different mount. `mkdirSync({recursive: true})` follows symlinks correctly, so dir creation works.
- **How to test it**:
  1. Create target dir on a different filesystem: `mkdir /tmp/sisyphus-state`
  2. Symlink: `ln -s /tmp/sisyphus-state /project/.sisyphus`
  3. `sisyphus start "test"` — session creation writes state.json via atomicWrite
  4. Same-filesystem symlink: should work fine (rename is same-fs)
  5. Cross-filesystem symlink: atomicWrite rename → EXDEV error
- **Tier**: Tier 2 (needs multi-filesystem setup)

## 7. PID lock race — multiple daemon instances

- **Scenario name**: TOCTOU race in acquirePidLock
- **What the user does**: Two `sisyphusd start` invocations launched simultaneously (script, launchd race, user double-click)
- **What breaks**: `acquirePidLock()` does `readPid()` then `writeFileSync(pid)` — no atomic lock. Both processes can read "no PID" and both write their own PID. Two daemons bind to the same socket (second gets EADDRINUSE, but the first may have already started processing). If the second exits on EADDRINUSE, the first daemon's PID file may contain the second's PID (last write wins), so a future `stop` kills the wrong process.
- **How to test it**:
  1. Ensure no daemon running: `sisyphusd stop`
  2. Launch two daemons simultaneously: `sisyphusd start & sisyphusd start &`
  3. Wait 2s, check: `cat ~/.sisyphus/daemon.pid` — verify it matches a running process
  4. `sisyphusd stop` — verify the actual daemon process dies
  5. Repeat 20 times in a loop to catch the race
- **Tier**: Tier 1

## 8. SIGKILL daemon — no cleanup

- **Scenario name**: Daemon killed without graceful shutdown
- **What the user does**: `kill -9 $(cat ~/.sisyphus/daemon.pid)` or OOM killer
- **What breaks**: `releasePidLock()` never runs → stale PID file. Socket file left on disk. Active time timers never flushed (accumulated since last flush is lost). `respawningSessions` state lost — sessions mid-respawn are stuck. Tmux panes keep running with no daemon to poll them.
- **How to test it**:
  1. Start daemon, start a session with agents
  2. `kill -9 $(cat ~/.sisyphus/daemon.pid)`
  3. Verify stale PID file exists, socket file exists
  4. `sisyphusd start` — should detect stale PID (process gone), clean up, start fresh
  5. Verify: session recovers, orphaned agents are detected, active time isn't wildly wrong
- **Tier**: Tier 1

## 9. Power failure — orphaned tmux panes + stale state

- **Scenario name**: Abrupt process termination with running agents
- **What the user does**: Laptop lid close, power loss, Docker container killed
- **What breaks**: Same as SIGKILL plus: tmux server may also die (no panes to recover). If tmux survives (unlikely in Docker), panes are orphaned. State.json reflects pre-crash state — agents marked `running` but panes may be gone. On restart, `resumeSession()` calls `listPanes()` to detect live panes but marking agents as `lost` only happens if the pane is truly gone from tmux.
- **How to test it**:
  1. Start session with 3 agents
  2. `kill -9` the daemon AND tmux server simultaneously
  3. Restart tmux, restart daemon
  4. `sisyphus status` — agents should be marked `lost`, not `running`
  5. Session should be recoverable via `sisyphus resume`
- **Tier**: Tier 2

## 10. Concurrent CLI calls — message + kill race

- **Scenario name**: Concurrent state mutations from multiple CLI invocations
- **What the user does**: `sisyphus message $SID "update" & sisyphus kill $SID &` simultaneously
- **What breaks**: The in-process `withSessionLock` mutex prevents races within a single daemon process — both requests hit the daemon's event loop sequentially. However: `kill` unregisters panes and destroys tmux session, then `message` tries to read state of a session that's being torn down. If `kill` completes first, `message`'s `getSession()` may succeed (file still exists) but the mutation is meaningless. If `message` completes first and `kill` follows, the message is lost (expected).
- **How to test it**:
  1. Start session
  2. In a loop (100 iterations): `sisyphus message $SID "msg" & sisyphus kill $SID & wait`
  3. Verify: no daemon crash, no corrupted state, no orphaned panes
  4. Also test: `sisyphus spawn ... & sisyphus yield & wait`
- **Tier**: Tier 2

## 11. Rollback to nonexistent cycle

- **Scenario name**: Rollback targeting a cycle with no snapshot
- **What the user does**: `sisyphus rollback $SID 999` or `sisyphus rollback $SID 0` before any cycle completes
- **What breaks**: `restoreSnapshot()` checks `existsSync(dir)` and throws `No snapshot found for cycle N`. The daemon handler (`handleRollback`) should propagate this as a client error, not crash.
- **How to test it**:
  1. Start session, let it run 2 cycles (so snapshots exist for cycles 1-2)
  2. `sisyphus rollback $SID 999` — expect clean error message
  3. `sisyphus rollback $SID 0` — expect clean error (cycle 0 may not have snapshot)
  4. `sisyphus rollback $SID -1` — negative cycle number
  5. `sisyphus rollback $SID abc` — non-numeric input
  6. Verify session state unchanged after each failed rollback
- **Tier**: Tier 1

## 12. Config with unknown keys (forward compatibility)

- **Scenario name**: config.json from newer sisyphus version
- **What the user does**: Upgrades sisyphus, creates sessions, downgrades. Config now has keys the old version doesn't recognize.
- **What breaks**: Depends on how config is loaded. If using strict parsing (zod with `.strict()`), unknown keys cause parse failure → daemon won't start. If permissive, unknown keys are ignored (correct behavior).
- **How to test it**:
  1. Write config: `echo '{"model":"sonnet","futureKey":"value","nestedFuture":{"a":1}}' > .sisyphus/config.json`
  2. Start daemon — should not crash
  3. `sisyphus start "test"` — should work, ignoring unknown keys
  4. Also test global config: `echo '{"unknownFlag":true}' > ~/.sisyphus/config.json`
- **Tier**: Tier 1

## 13. Config with wrong types for known keys

- **Scenario name**: Type-mismatched config values
- **What the user does**: Edits config manually: `{"model": 123, "pollIntervalMs": "fast"}`
- **What breaks**: If config is used without validation, `model` (expected string) being a number may cause subtle downstream failures (tmux pane label rendering, agent spawn flags). `pollIntervalMs` as string may cause `setInterval("fast")` → NaN interval → rapid-fire polling or no polling.
- **How to test it**:
  1. Write bad config: `echo '{"model":123,"pollIntervalMs":"fast"}' > .sisyphus/config.json`
  2. Start daemon — observe behavior
  3. Try: `{"pollIntervalMs": -1}`, `{"pollIntervalMs": 0}`, `{"pollIntervalMs": 999999999}`
  4. Verify daemon doesn't spin CPU or hang
- **Tier**: Tier 1

## 14. Session from older schema version

- **Scenario name**: Schema migration on legacy state.json
- **What the user does**: Has sessions from older sisyphus version, upgrades, tries `sisyphus status` or `sisyphus resume`
- **What breaks**: `getSession()` has normalization for `activeMs` and `agent.repo`, but not for other fields that may have been added later (`messages`, `launchConfig`, `startHour`, `startDayOfWeek`). Missing `messages` → `session.messages.push()` crashes. Missing `orchestratorCycles` → iteration crashes.
- **How to test it**:
  1. Create minimal legacy state: `{"id":"x","task":"t","cwd":"/","status":"active","createdAt":"2024-01-01T00:00:00Z","agents":[],"orchestratorCycles":[]}`
  2. Note: deliberately missing `activeMs`, `messages`, `startHour`, `startDayOfWeek`
  3. `sisyphus status` — should load and display
  4. `sisyphus message $SID "hello"` — `appendMessage` accesses `session.messages`
  5. Add a state missing `orchestratorCycles` entirely and test
- **Tier**: Tier 1

## 15. Atomic write temp file left behind

- **Scenario name**: Orphaned temp files from interrupted writes
- **What the user does**: Nothing intentional — daemon crashed or was killed between `writeFileSync(tmpPath)` and `renameSync(tmpPath, statePath)`
- **What breaks**: `.state.*.tmp` files accumulate in the session directory. They waste disk space and could confuse tools that glob for JSON files. No cleanup mechanism exists.
- **How to test it**:
  1. Create fake orphaned temps: `touch .sisyphus/sessions/$SID/.state.fake-uuid.tmp`
  2. Verify daemon doesn't trip over them
  3. Start/stop 100 sessions, kill daemon randomly — check for accumulated temp files
  4. Verify: temp files don't interfere with normal operation
- **Tier**: Tier 1

## 16. Different CWDs pointing to same project

- **Scenario name**: CWD mismatch for same project directory
- **What the user does**: `cd /project && sisyphus start "task"` then `cd /project/src && sisyphus status`
- **What breaks**: State is stored relative to `cwd` passed at session creation. `sisyphus status` from `/project/src` looks in `/project/src/.sisyphus/sessions/` — finds nothing. Session is invisible from subdirectories. If user does `sisyphus start` from subdirectory, a second `.sisyphus/` tree is created inside the project.
- **How to test it**:
  1. `cd /project && sisyphus start "task1"` — session created in `/project/.sisyphus/`
  2. `cd /project/src && sisyphus status` — should not see session
  3. `cd /project/src && sisyphus start "task2"` — creates `/project/src/.sisyphus/`
  4. Verify: no cross-contamination, both sessions independent
  5. Edge: symlinked CWDs: `ln -s /project /alias && cd /alias && sisyphus status`
- **Tier**: Tier 1

## 17. Snapshot directory corruption

- **Scenario name**: Snapshot missing state.json during rollback
- **What the user does**: Partially deletes snapshot contents: `rm .sisyphus/sessions/$SID/snapshots/cycle-1/state.json`
- **What breaks**: `restoreSnapshot()` reads `join(dir, 'state.json')` → ENOENT throw, but this happens inside `withSessionLock`, so the error propagates and the current state is untouched. However, if `roadmap.md` is missing from snapshot, `copyFileSync` throws before state is restored — partial rollback state.
- **How to test it**:
  1. Run 2 cycles to create snapshots
  2. Delete `snapshots/cycle-1/state.json`, attempt rollback to cycle 1
  3. Delete only `snapshots/cycle-1/roadmap.md`, attempt rollback — state.json gets restored but roadmap copy throws
  4. Verify: after failed rollback, current state.json is unchanged
- **Tier**: Tier 1

## 18. Socket file left on disk after crash

- **Scenario name**: Stale Unix socket prevents daemon startup
- **What the user does**: Daemon crashes without cleanup, socket file remains
- **What breaks**: New daemon tries to `listen()` on the existing socket path → EADDRINUSE. If the daemon doesn't unlink the stale socket first, it can't start.
- **How to test it**:
  1. Create stale socket: `kill -9 $(cat ~/.sisyphus/daemon.pid)` (or just touch the path)
  2. `sisyphusd start` — should detect stale socket, unlink it, bind successfully
  3. Edge: socket file exists but is actually a regular file (not a socket) — `echo > ~/.sisyphus/daemon.sock`
  4. Edge: socket file is a symlink to another socket
- **Tier**: Tier 1

## 19. Concurrent state writes from daemon + manual edit

- **Scenario name**: External process modifies state.json while daemon holds lock
- **What the user does**: Opens state.json in editor, saves while daemon is mid-write
- **What breaks**: Daemon's atomic write (temp+rename) is the last writer wins. The rename is atomic at the filesystem level, so no corruption — but the editor's changes are silently overwritten. User sees their manual edits disappear.
- **How to test it**:
  1. Start session, note state path
  2. In a loop: read state, modify a field, write back — while simultaneously sending messages via CLI
  3. Verify: no corruption, but document that external edits are not safe
- **Tier**: Tier 1

## 20. Session lock doesn't survive daemon restart

- **Scenario name**: In-memory session lock lost on daemon restart
- **What the user does**: Has a long-running session. Daemon restarts (update, crash, manual restart).
- **What breaks**: `sessionLocks` is a `Map<string, Promise<void>>` — purely in-memory. After restart, the lock is empty. If two requests arrive simultaneously for the same session before the lock map is populated, they could race. In practice, Node's single-threaded event loop prevents true concurrent execution, but `withSessionLock` is async and allows interleaving at `await` points (the `await prev` line). Since `getSession` and `saveSession` are synchronous, the actual race window is tiny — but it exists if someone adds async operations inside the lock.
- **How to test it**:
  1. Start daemon and session
  2. `sisyphusd restart`
  3. Immediately fire 10 concurrent CLI calls: `for i in $(seq 10); do sisyphus message $SID "msg-$i" & done; wait`
  4. Read state.json — verify all 10 messages are present (no lost updates)
- **Tier**: Tier 1
