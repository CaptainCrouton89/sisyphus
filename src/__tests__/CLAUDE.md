# CLAUDE.md — src/__tests__

## Two isolation patterns — don't mix them

Tests that exercise **state/daemon logic** pass a `testDir` (mkdtemp) directly into functions like `createSession(id, goal, testDir)`. The path helpers (`statePath`, `sessionDir`) accept a root argument, so no env mutation is needed.

Tests that exercise **install/onboard logic** (`installBeginCommand`, `installAutopsyCommand`) instead mutate `process.env.HOME` in `beforeEach`/`afterEach`. These functions accept an explicit source path (injectable via fixture file), but resolve the destination (`~/.claude/commands/sisyphus/`) from `HOME` at call time — no injectable dest arg. Always restore `HOME` even when it was originally `undefined` (use `delete process.env['HOME']`, not `= undefined`).

The return value has three fields: `installed: true` means the file exists on disk (including pre-existing); `autoInstalled: true` means it was written *this call*; `path` is the resolved destination. `installed: true, autoInstalled: false` is the idempotent "already there" path — not an error. The lazy-install path in `ensureDaemonInstalled` depends on this distinction to avoid false failure reports on repeat calls. Both commands write to the same `~/.claude/commands/sisyphus/` directory under different filenames — the coexistence test in `install-begin.test.ts` guards against one silently overwriting the other.

`install-begin.test.ts` tests both `installBeginCommand` **and** `installAutopsyCommand` despite its name. It exists because both were originally only called from `sisyphus setup` — users who ran `sisyphus start` directly never got the slash commands. The fix wires both into `ensureDaemonInstalled`; these tests pin the install functions' behavior so that wiring has a stable contract. Idempotency tests use a sentinel-mutation pattern: write extra content to the dest file after the first install, then verify the second call leaves it untouched — return value alone can't prove no rewrite occurred.

## companion.test.ts — non-obvious contracts

**Delta-crediting on re-completion.** `onSessionComplete` reads `session.companionCreditedStrength`, `companionCreditedCycles`, and `companionCreditedActiveMs` to credit only the delta when a session is continued and re-completed. Without those fields the companion double-counts stats. The session must carry its prior-credit snapshot or the math is wrong.

**`onAgentCrashed` does not increment `sessionsCrashed`.** It only resets `consecutiveCleanSessions`. Three agent crashes in one session = exactly one `sessionsCrashed` increment, which happens in `onSessionComplete`. Tests pin this explicitly — the distinction matters for achievement thresholds.

**Stat formulas are pinned as numeric constants** — changing the underlying formula breaks these tests intentionally:
- `strength`: tiered by agent count (1–2→1, 3–5→2, 6–10→3, 11–20→4, 21+→5)
- `patience`: `ceil(sqrt(cycleCount))` — not linear; 9 cycles → 3 patience, not 9
- `wisdom`: max 3 per session; +1 each for ≥80% clean agents, ≥2 agents/cycle, ≥2 distinct orchestrator modes
- Level thresholds: L2=150, each subsequent `floor(prev × 1.35)`, cumulative: L3=352, L4=624, L5=991, L10=5912
- XP formula: `strength*50 + floor(enduranceMs/3_600_000)*20 + wisdom*40 + patience*8` — endurance floors fractional hours to 0, patience is a raw count (not cycles)
- `computeLevelProgress` returns `{xpIntoLevel, xpForNextLevel}` where `xpForNextLevel` is the gap width for the current level (not cumulative threshold)

**`ACHIEVEMENTS.length === 67` is pinned.** Adding or removing an achievement without updating this assertion fails the test — intentional guard against silent count drift.

**`checkAchievements` returns only newly-unlocked IDs** — already-present achievements are filtered before return. Call signature is `(companion, session?)`. Time-based achievements use `localDateAtHour()` (local-timezone timestamps): `night-owl` fires for hours 1–5 only (not 0), `witching-hour` fires for hour 3 only (not 1–5), `early-bird` fires for hours 0–5. `dawn-patrol` measures wall-clock overlap in the midnight–6am window — a session starting at 11pm that completes at 2:30am qualifies because the overlap ≥ 3h; computed from `createdAt`/`completedAt`, not just start hour. `weekend-warrior` is guarded with `if (day === 0 || day === 6)` because `saturdayNoon()` (UTC noon) may shift day-of-week in local timezone. `patient-one` measures the gap between `cycle.completedAt` on cycle N and `cycle.timestamp` on cycle N+1 (≥30 min triggers) — it does NOT diff consecutive timestamps. `taskHistory` keys use format `'repoPath:taskString'`; achievements `sisyphean` (≥3), `stubborn` (≥5, sessionsCompleted>0), `one-must-imagine` (≥10) all read from the same map.

**Two new consecutive counters** accumulate independently: `consecutiveEfficientSessions` increments when a session has ≤3 cycles (resets on >3); `consecutiveHighCycleSessions` increments when ≥8 cycles (resets on <8). Both live on `CompanionState` and reset to 0 on the opposite condition — not on crash or any other event.

**Welford/zScore machinery.** `emptyStats()` creates a zero-count `RunningStats`; `defaultBaselines()` creates a `Baselines` object with four `RunningStats` fields (`sessionMs`, `cycleCount`, `agentCount`, `recentAgentThroughput`). `welfordUpdate` uses population variance (`m2/count`), not sample variance. `zScore` has two behavior modes: when `count < 5` (MIN_SAMPLES), it uses cold-start defaults from `defaultBaselines()` instead of learned stats. Stddev floor is `max(rawStddev, mean * ratioFloor, absoluteFloor)` — both floors apply simultaneously; `sessionMs` uses ratio=0.20 and absolute=300,000ms; `cycleCount` uses ratio=0.20 and absolute=1.0.

**`computeMood` frustrated gate.** High z-scores alone (long sessions, many cycles) do NOT trigger `frustrated` — the mood requires at least one negative-event signal: `rollbackCount > 0`, `restartedAgentCount > 0`, or `lostAgentCount > 0`. `grinding` fires on session length or recent-agent-throughput z-score exceeding threshold without those signals. `MoodSignals` fields `cycleCount`, `totalAgentCount`, `recentAgentCount`, `rollbackCount`, `restartedAgentCount`, `lostAgentCount` are all used in mood scoring.

**`c.lastRecentAgentCount` must be set by the caller before `onSessionComplete`.** The function reads this field to feed `baselines.recentAgentThroughput` — it doesn't compute or look up agent counts itself. `onSessionComplete` updates all four `c.baselines` Welford states on every call (even first call, count becomes 1).

## Each test file is a regression pin

Test comments name the specific bug and date. Before deleting or weakening an assertion, confirm the original failure mode is covered elsewhere — these tests exist precisely because the code path was silently broken before.

## Runner

`node:test` native runner (no Jest/Vitest). Run a single file with:
```
node --import tsx --test src/__tests__/<file>.test.ts
```
Tests don't share global state — `beforeEach`/`afterEach` are scoped to their `describe` block, not the module, except in `state.test.ts` where they're declared at module scope (applies to all `describe` blocks in that file).
