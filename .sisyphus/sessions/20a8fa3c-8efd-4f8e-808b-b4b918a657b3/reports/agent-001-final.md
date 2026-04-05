Audit complete. Findings saved to context/audit-architecture.md.

## Summary of findings:

**CRITICAL (3)**
1. handleKillAgent() emits no history event — killed agents silently disappear from event log (session-manager.ts:803–822)
2. handleKillAgent() skips flushTimers() — agent activeMs permanently lost at kill time (session-manager.ts:817–820)
3. handleRollback() agents emit no events — rolled-back agents have no termination records (session-manager.ts:843–852)

**MAJOR (6)**
4. wallClockMs absent from handleKill() path — null for all killed sessions (session-manager.ts:785)
5. computeWisdomGain() double-credits on continue → re-complete — no companionCreditedWisdom sentinel (companion.ts)
6. Lost agents on resume emit no history events — 'lost' status has no event type (session-manager.ts:329–341)
7. signals-snapshot events bleed across sessions — mood shifts in session A write events in session B's log (pane-monitor.ts:287)
8. agent-exited reads stale activeMs for crashes — bypasses in-memory accumulator (session-manager.ts:895)
9. recentCrashes lags by one poll interval after a crash (pane-monitor.ts:228–232)

**MINOR (6)**
10–15. See full document for details on cycle-boundary event naming, double loadAllSummaries(), pruning edge cases, debugMood staleness, completedAt semantics.