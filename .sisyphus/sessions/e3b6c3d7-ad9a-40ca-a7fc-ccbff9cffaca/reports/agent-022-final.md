# Daemon Failure Mode Analysis — Complete

Analyzed all 12 daemon modules. Found 17 concrete failure modes, categorized by severity and likelihood.

## Deliverable
Full analysis saved to: `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/explore-daemon-failures.md`

## Top 5 Actionable Findings

1. **server.ts:377** — `handleRequest(req).then(...)` has no `.catch()` — unhandled promise rejections on any thrown error. Fix: add `.catch(err => { if (!conn.destroyed) conn.write(JSON.stringify({ok:false,error:err.message})+'\n'); })`.

2. **server.ts:292** — `unregisterPane()` called before `handlePaneExited()`. If the handler throws, the pane is gone from registry but agent stays `running` forever. Fix: move unregister after handlePaneExited, or catch and still unregister.

3. **session-manager.ts:331-333** — `respawningSessions` guard deleted on `status !== 'active'` early return, but session may have been racing with pane monitor. Already documented in CLAUDE.md as "path (2) — the dangerous one." Fix: re-check if status was changed by pane monitor race before clearing guard.

4. **server.ts:308** — `messageCounter` resets to 0 on daemon restart, causing ID collisions with existing messages on disk. Fix: initialize from highest existing msg-NNN in messages dir.

5. **haiku.ts:11-28** — No timeout on `query()` or `for await` loop. API hangs = leaked promise forever. Fix: wrap in `Promise.race` with a 30s timeout.

## Other Notable Findings
- Race condition in fire-and-forget session naming (session-manager.ts:100-107)
- Companion write races — no mutex, last writer wins (companion.ts:41-48)
- TOCTOU in pane monitor — pane can exit between list and action (pane-monitor.ts:291-346)
- Status bar goes blank if any section throws (status-bar.ts:173-252)
- flashCompanion double-call overwrites text with wrong expiry (status-bar.ts:30-33)
- Temp files left behind on crash in atomicWrite (state.ts:34-39)

## Methodology
Read every file in src/daemon/. Traced error propagation paths, identified TOCTOU windows, checked mutex coverage, verified guard cleanup on all return paths. Cross-referenced with CLAUDE.md documentation (which already documents several of these as known issues).