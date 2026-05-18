# Daemon Performance Roadmap

Three architectural changes that move the daemon from poll-driven to event-driven. Fix #1 (in-memory state cache + `fs.watch`) ships separately; this file tracks the follow-on work.

Order matters: #1 unblocks the daemon under current session load. #2 lets it scale past ~50 sessions. #3 removes the poll tick entirely.

---

## Fix #2 — tmux control mode

**Replaces:** per-tick `tmux list-panes -a` subprocess spawn in `src/daemon/pane-monitor.ts:238` (`tmux.listAllPanesByWindow()`), plus all the one-shot `execSync('tmux …')` calls scattered through `src/daemon/tmux.ts`.

**With:** a single persistent `tmux -C` control-mode connection that streams pane lifecycle events. tmux notifies us when a pane dies, is created, gets resized, or emits output — we never have to ask.

### Why it's worth doing

Even after Fix #1, the poll loop still spawns one tmux subprocess every 250 ms (4/sec, ~345k/day). Each spawn is a `posix_spawn + exec + tmux parse-reply + exit` round-trip — single-digit milliseconds individually, but cumulatively the dominant subprocess cost in the daemon. Worse, pane-death detection is up to 250 ms late: a user closes a pane and the orchestrator-killed event sits in the gap.

Control mode collapses both: zero steady-state spawns, and events arrive in <1 ms.

### Sketch

1. New `src/daemon/tmux-control.ts` that opens `tmux -C attach -t <some-anchor-session>` (or `-C new-session -A` to ensure one exists) as a long-lived child process via `child_process.spawn` (async, not Sync). Parse the line-oriented control protocol: lines starting with `%` are notifications, lines starting with `0x` are command replies.
2. Subscribe to the events we care about: `%window-pane-changed`, `%pane-died`, `%session-changed`, `%layout-change`, `%output` (only if we ever need pane content streaming — likely not for the daemon).
3. Maintain an in-memory `panesByWindow: Map<windowId, PaneInfo[]>` that the events keep up to date. `pane-monitor.ts` reads this map instead of calling `listAllPanesByWindow()`.
4. For one-shot mutating commands (`tmux send-keys`, `tmux kill-pane`, `tmux set-option`, etc.), pipe them through the same control connection rather than spawning a new tmux client. The control protocol accepts commands on stdin and replies with `%begin … %end` blocks.
5. Reconnect logic: if the tmux server restarts (or the control client gets killed), reopen. Mark sessions briefly stale; refresh the pane map on reconnect.

### Risk and rollback

- Control protocol parsing is finicky — line buffering, multi-line replies, escape sequences in pane titles. Borrow the parser from an existing library if one exists (`tmux-control-mode` on npm, or port from `iTerm2`'s implementation) rather than rolling our own from scratch.
- Reconnect on tmux server death must be solid. If the control client dies and we miss events, our pane map drifts silently — agents look alive when they aren't. Mitigation: re-sync via a one-shot `list-panes -a` query after every reconnect.
- Rollback: keep `tmux.listAllPanesByWindow()` callable. A feature flag (`SISYPHUS_TMUX_CONTROL=0`) returns to the polling path if control mode breaks in production.

### Effort

~1 day. Most of it is the protocol parser and reconnect logic; the wiring into `pane-monitor` is small once the control client is solid.

### Out of scope

Don't try to replace `tmux load-buffer` (used for paste in `tmux.ts:97`) with control mode — it's not on a hot path and the byte-stream-on-stdin pattern doesn't fit the control protocol cleanly.

---

## Fix #3 — lazy active-time accounting

**Replaces:** the 250 ms poll tick whose primary remaining job is incrementing counters. After #1 and #2, accumulating `activeMs` is the only reason the daemon polls at all.

**With:** `running_since: number` (epoch ms) fields on agents and cycles. Computed values: `activeMs = accumulated + (status === 'running' ? now - running_since : 0)`.

### Why it's worth doing

Look at `pane-monitor.ts pollAllSessions` (lines 224–267) and `pollSession` lines 478–506. The increment-on-tick block:

```ts
for (const agent of session.agents) {
  if (agent.status === 'running' && livePaneIds.has(agent.paneId)) {
    timerEntry.agentMs.set(agent.id, (timerEntry.agentMs.get(agent.id) ?? 0) + increment);
    anyAlive = true;
  }
}
```

…runs every tick, 4 times/sec, for every running agent in every session, just to add `increment` to a counter. The same counter is flushed to disk every ~5s via `flushTimers` → `state.incrementActiveTime` (`state.ts:519`). The ENTIRE PURPOSE of the tick post-Fix-#2 is this accounting.

If we store `running_since` and compute `activeMs` at read-time, the tick disappears. Daemon CPU at idle goes from "wakes every 250 ms to do arithmetic" to "wakes only when a tmux event arrives." On a quiet workspace with no agent activity, that's the difference between ~4% baseline CPU and ~0%.

### Sketch

1. Schema change in `state.ts`:
   - Agents: add `runningSince: number | null`. Set to `Date.now()` on `status: 'running'`. Clear (and add the delta into `activeMs`) on transition out of `running`.
   - Cycles: same treatment for the cycle-level accumulator.
   - Sessions: `activeMs` becomes a derived field — accumulated time at last-state-change plus `now - runningSince` if any agent is running.
2. Reader helpers in `state.ts`:
   ```ts
   export function getEffectiveActiveMs(agent: Agent, now = Date.now()): number {
     return agent.activeMs + (agent.runningSince ? now - agent.runningSince : 0);
   }
   ```
   Apply at every read site (CLI output, dashboard, `incrementActiveTime` callers).
3. Migration: bump `SCHEMA_VERSION`. For old state files, on first load: set `runningSince = null` on all agents/cycles, leave `activeMs` as-is. Consult `state.ts` migration convention (it lives near the top of the file).
4. Delete `pollAllSessions`'s timer block and the `activeTimers` Map (`pane-monitor.ts:55`). Delete `flushTimers`, `flushAgentTimer`, `flushCycleTimer`. Delete `state.incrementActiveTime` (`state.ts:519`).
5. The poll interval (`monitorInterval` in `pane-monitor.ts`) can go to zero — if Fix #2 lands, all observability is event-driven. Until then, keep a long-interval (~30 s) tick as a fallback for sleep-aware drift correction and for the companion-mood updater that currently piggybacks on the poll.

### Risk and rollback

- Every code path that reads `activeMs` must go through `getEffectiveActiveMs()` or it will see stale accumulated values. There are many such sites — agent reports, dashboard widgets, session-export, companion-credit accounting. The CLAUDE.md note about `companionCreditedActiveMs` (see `src/daemon/CLAUDE.md`) is particularly load-bearing: that path reads `activeMs` and must not double-count.
- Sleep/suspend handling: the current code has explicit sleep-aware logic (`elapsed > threshold ? storedPollIntervalMs : elapsed`) at `pane-monitor.ts:228`. With `runningSince` and a `Date.now()` read, suspend correctness is automatic — but only if `runningSince` was set with `Date.now()` (monotonic vs wall-clock matters; do not switch to `performance.now()`).
- Rollback: harder than #1 or #2 because of the schema migration. Be willing to spend an extra hour on a one-way migration check.

### Effort

~half day for the schema + reader helpers + tick deletion. Add ~half day for chasing down every `activeMs` reader and updating it. Call it 1 day end-to-end.

### Out of scope

Don't try to apply the same lazy-compute pattern to `companionCreditedCycles` / `companionCreditedActiveMs` etc. — those are bookkeeping snapshots at completion time, not live counters.

---

## Validation across all three

After all three ship, the daemon's behavior on a 12-session workload should be:

- Main thread CPU at idle: <1% (currently 2–17% saturated).
- `sample <pid> 3` shows the event loop blocked on `kevent` / `epoll_wait`, not in `MicrotaskQueue::RunMicrotasks`.
- `sis session inspect list` returns in <50 ms cold and <10 ms warm (currently 10 s timeout under load).
- No `tmux` subprocesses spawned in 60 s of steady-state observation (only on user-initiated mutations).
- New session events (pane created/destroyed) propagate to the dashboard in <100 ms (currently up to 250 ms + poll-loop drift).
