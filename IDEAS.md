# Ideas

## Reactive Orchestrator (Inbox Model)

Currently the orchestrator only wakes up when ALL agents finish. Instead, agents could trigger orchestrator wakeups via interim reports.

**Core concept:** An "inbox" where agent reports accumulate. The orchestrator wakes up when new reports arrive (not just when all agents complete).

**How it works:**
- Agent calls `sisyphus report` → report saved + queued as "unseen"
- If orchestrator is NOT running → spawn it after a short debounce (3-5s to batch rapid reports)
- If orchestrator IS running → queue the report; when orchestrator yields, check inbox — if new reports exist, respawn immediately
- `sisyphus submit` still works as today (report + "I'm done")
- `allAgentsDone` remains as a trigger, just not the only one

**What this enables:**
- Orchestrator reacts to validation findings while other agents are still working
- Spawns new agents based on interim discoveries
- Re-prioritizes or kills agents going down the wrong path
- Starts next wave before current wave fully finishes

**Key concerns:**
- **Thrashing** — Each spawn is a new Claude session (tokens, startup cost). Debouncing is essential.
- **Watermarking** — Need `lastProcessedReportIndex` or similar so the orchestrator prompt can flag "new since last cycle" vs. already-seen reports.
- **Opt-out** — Maybe `yield --wake-on-report` vs `yield --wake-on-complete` so the orchestrator controls its own wake schedule.

**Implementation surface:**
- `session-manager.ts` `handleReport()` — add debounced orchestrator spawn trigger
- `orchestrator.ts` `handleOrchestratorYield()` — check for unseen reports, respawn immediately if any
- `state.ts` — add report watermark to session state
- `orchestrator.ts` `formatStateForOrchestrator()` — annotate reports as NEW vs. seen
