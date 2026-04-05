T4: Signals-Snapshot Scope Fix — DONE

Changed src/daemon/pane-monitor.ts lines 287-289:
- Replaced `for (const [sessionId] of trackedSessions)` loop with single-session emission
- Now gets first tracked session via `trackedSessions.keys().next().value` with null guard
- Mood is a global companion signal; emitting to all sessions caused cross-session bleed in per-session history

Files changed: src/daemon/pane-monitor.ts
Build: passes
No issues.