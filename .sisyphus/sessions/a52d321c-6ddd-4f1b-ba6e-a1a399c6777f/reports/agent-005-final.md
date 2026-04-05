Fixed 4 issues in companion system:

Issue #2 (HIGH): sessionsCrashed now increments once per session in onSessionComplete (inside hasCrash block), not once per agent crash in onAgentCrashed. Luck formula moved to after the hasCrash check so it uses the correct per-session count.

Issue #5 (MEDIUM): saveCompanion moved inside if (newMood !== companion.mood) block in pane-monitor.ts. Eliminates unconditional write every 5s. debugMood is slightly stale in companion.json between mood transitions — acceptable.

Issue #6 (MEDIUM): Added pollSessionCache Map<string, Session> in pollAllSessions. pollSession now accepts optional cache param and populates it on first read. Mood signal loop reads from cache with state.getSession fallback, eliminating the double readFileSync+JSON.parse per session per poll cycle.

Issue #8 (MEDIUM): saveCompanion now uses randomUUID() temp filename (.companion.${randomUUID()}.tmp), consistent with state.ts pattern. Added import from node:crypto.

Additionally updated companion.test.ts to match formula changes made by another agent (computeXP: strength*80/endurance*15/wisdom*40/luck*300/patience*8; computeLevel: base threshold 150, multiplier 1.35; marathon threshold 15 agents).

All 106 tests pass. Build clean.