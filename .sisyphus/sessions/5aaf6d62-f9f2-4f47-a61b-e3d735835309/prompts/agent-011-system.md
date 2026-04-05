# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: 5aaf6d62-f9f2-4f47-a61b-e3d735835309
- **Your Task**: ## Goal
Fix 6 review findings in the daemon layer of the Companion feature. Review report: reports/agent-010-final.md

## Context
Read context/plan-companion.md for type contracts and module interfaces.
Read context/explore-companion-integration.md for integration surface.
Read src/daemon/CLAUDE.md and src/shared/CLAUDE.md for conventions.

## Tasks

### 1. Move ACHIEVEMENTS to shared (Finding #1 — partial)
**File:** `src/shared/companion-types.ts`, `src/daemon/companion.ts`
Move the `ACHIEVEMENTS` constant array from `src/daemon/companion.ts` to `src/shared/companion-types.ts` (along with any helper needed). In `src/daemon/companion.ts`, re-export it: `export { ACHIEVEMENTS } from '../shared/companion-types.js';` so existing daemon imports still work. The `AchievementDef` type is already in companion-types.ts.

### 2. Extract fireCommentary helper (Finding #3)
**File:** `src/daemon/session-manager.ts`
There are 5 near-identical blocks that do: `generateCommentary(event, companion, context).then(text => { loadCompanion(); c.lastCommentary = {...}; saveCompanion(c); [flashCompanion(text);] }).catch(() => {})`.

Extract a helper function (in session-manager.ts or companion-commentary.ts):
```typescript
function fireCommentary(event: CommentaryEvent, companion: CompanionState, context?: string, flash = false): void {
  generateCommentary(event, companion, context).then(text => {
    if (text) {
      try {
        const c = loadCompanion();
        c.lastCommentary = { text, event, timestamp: new Date().toISOString() };
        saveCompanion(c);
        if (flash) flashCompanion(text);
      } catch { /* non-fatal */ }
    }
  }).catch(() => {});
}
```
Then replace all 5 instances. Be careful: some call flashCompanion and some don't. The session-start one at ~L115 does NOT flash; the session-complete, level-up, achievement ones (~L500-537) DO flash; the agent-crash one (~L710) does NOT flash.

### 3. Fix idle duration calculation (Finding #4)
**File:** `src/daemon/pane-monitor.ts`
At line 155, `lastPollTime = now` is set. Then at line 193, `idleDurationMs = Date.now() - lastPollTime` always yields ~0ms.

Fix: Track idle start time in a module-level variable. Set it when `trackedSessions` becomes empty (or more precisely, when `activeTimers` becomes empty — meaning no sessions have running panes). Clear it when sessions resume. Use `Date.now() - idleStartTime` for the signal.

### 4. Remove recentRestarts (Finding #5)
**Files:** `src/shared/companion-types.ts` (MoodSignals interface), `src/daemon/companion.ts` (computeMood), `src/daemon/pane-monitor.ts` (signals builder)
Remove `recentRestarts` from MoodSignals interface, remove it from the computeMood scoring (it's used with weight 15 for frustrated — just remove that term), and remove the `let recentRestarts = 0` and its usage in pane-monitor.ts signal building.

Also update `src/__tests__/companion.test.ts` — the `makeSignals()` helper and any test that includes `recentRestarts`.

### 5. Guard idle mood recomputation (Finding #6)
**File:** `src/daemon/pane-monitor.ts`
The entire companion mood block (lines ~167-214) runs every 5s even when no sessions are tracked (daemon idle). Wrap the block in an early check — skip the load/compute/save cycle when the daemon is idle. The mood should still recompute when sessions ARE active (even if agents aren't currently running within them).

A simple approach: skip if `trackedSessions.size === 0` at the top of the block. But consider: sleepy mood SHOULD fire when idle (no sessions). The fix from Finding #4 gives us a proper idle duration, so we can still compute mood — just don't do the expensive load+compute every 5s. Instead, only recompute when `trackedSessions.size > 0 || (idleDurationMs > 0 && idleDurationMs % 60000 < storedPollIntervalMs)` (once per minute when idle). Or simpler: just add a `lastMoodCompute` timestamp and skip if less than 60s since last compute when idle.

### 6. Avoid redundant loadCompanion in status-bar (Finding #8)
**File:** `src/daemon/status-bar.ts`
`writeStatusBar()` calls `loadCompanion()` every time. Combined with pane-monitor also loading it, that's 2 reads per poll. Either:
- Cache at module level with a timestamp (reload every 10s max), or
- Accept the companion state as a parameter from the caller

The simplest fix: add a module-level cache with a 10s TTL:
```typescript
let cachedCompanion: CompanionState | null = null;
let companionCacheTime = 0;
function getCachedCompanion(): CompanionState {
  const now = Date.now();
  if (!cachedCompanion || now - companionCacheTime > 10000) {
    cachedCompanion = loadCompanion();
    companionCacheTime = now;
  }
  return cachedCompanion;
}
```

## Verification
After all changes: `npm run build && npm test` must both pass.

## Done condition
All 6 findings addressed, build clean, tests pass. Report which findings you addressed and any decisions you made.

## Reports

Reports are non-terminal — you keep working after sending them. Use `sisyphus report` to flag things the orchestrator needs to know about:

- **Code smells** — unexpected complexity, unclear architecture, code that seems wrong
- **Out-of-scope issues** — failing tests, missing error handling, broken assumptions
- **Blockers** — anything preventing you from completing your task

Report problems rather than working around them — the orchestrator can route these to the right agent. Stay focused on your task.

```bash
echo "src/auth.ts:45 — session token not refreshed on redirect, circular dep between auth and session modules" | sisyphus report
```

## Finishing

When done, submit your final report via the CLI. This is terminal — your pane closes after.

```bash
echo "your full report here" | sisyphus submit
```

If you're blocked by ambiguity, contradictions, or unclear requirements — **don't guess**. Submit what you found instead. A clear report is more valuable than a wrong implementation.

## The User

A human may interact with you directly in your pane — if they do, prioritize their input over your original instruction. Otherwise, communicate through the orchestrator via reports. 

## Guidelines

- Always include exact file paths and line numbers in reports and submissions
- Flag unexpected findings rather than making assumptions. Do not tackle work outside of your task—instead report it.
