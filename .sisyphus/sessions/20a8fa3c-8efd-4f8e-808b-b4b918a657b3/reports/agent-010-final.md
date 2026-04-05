T7 complete. Modified src/daemon/history.ts only.

Change 1 — writeSessionSummary new fields (lines 47-51):
  - crashCount, lostCount, killedAgentCount: filtered from session.agents by status
  - rollbackCount: from session.rollbackCount ?? 0
  - efficiency: activeMs/wallClockMs ratio (null if no wallClockMs)
  - restartCount added to agent mapping (line 63)

Change 2 — pruneHistory mtime fix (lines 160-171):
  - Reads first line of events.jsonl and parses ts field for stable creation timestamp
  - Falls back to dir mtime only if events.jsonl read/parse fails
  - readFileSync was already imported

npm run build passes clean, no warnings.