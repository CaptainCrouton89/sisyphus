# Companion Recalibration Review — Findings Report

## CRITICAL BUGS

### 1. `sessionsCompletedToday` uses lifetime total, not daily count
**File:** `src/daemon/pane-monitor.ts:241`
**Evidence:** `sessionsCompletedToday: companion.sessionsCompleted` passes the lifetime counter. The `MoodSignals.sessionsCompletedToday` field (companion-types.ts:159) is documented as "sessions completed today".
**Impact:** After a user's 4th lifetime session, the existential mood permanently gets +5 bonus (`companion.ts:219: if (sessionsCompletedToday >= 4) scores.existential += 5`), regardless of daily activity. The correct data source already exists: `companion.dailyRepos` keyed by ISO date (companion.ts:432-435), or filtering `companion.recentCompletions` by today's date.
**Fix:** Replace `companion.sessionsCompleted` with a today-filtered count using `companion.recentCompletions` or `dailyRepos`.

### 2. Luck stat formula is semantically broken
**File:** `src/daemon/companion.ts:492-493`
**Evidence:** Formula: `luck = sessionsCompleted / (sessionsCompleted + sessionsCrashed)`. But `sessionsCrashed` is a SUBSET of `sessionsCompleted` (both incremented inside `onSessionComplete` — lines 469 and 488). The counters overlap.
**Impact:** Luck can never drop below 0.5, even if every session has crashes. Example: 10 sessions, all with crashes → sessionsCompleted=10, sessionsCrashed=10, luck=10/20=0.5. Should be 0.0. Luck is systematically inflated, which inflates XP (luckXP = luck * 300) and makes the sparkle cosmetic (luck > 0.6) easier to unlock. Comment says "ratio of clean sessions (no crashes) to total completed" but formula doesn't compute that.
**Fix:** `luck = sessionsCompleted > 0 ? (sessionsCompleted - sessionsCrashed) / sessionsCompleted : 0`

### 3. `patience` stat is never incremented — permanently 0
**File:** `src/daemon/companion.ts` (missing code)
**Evidence:** Grepped all files — `stats.patience` is READ in 9 places across 4 files (XP formula at :93, mood zen scoring at :188-189, stat cosmetics at companion-render.ts:51, commentary at companion-commentary.ts:38-39,65,89, TUI overlay at overlays.ts:200, stat display at companion-render.ts:152) but NEVER WRITTEN TO. Initialized to 0 in createDefaultCompanion():61, stays 0 forever.
**Impact:** patienceXP is always 0; zen mood's `patienceHours > 20` check (companion.ts:189) is unreachable; zen-prefix cosmetic (companion-render.ts:51) never triggers; commentary personality branches using patience (companion-commentary.ts:38-39) never fire. The stat is displayed as "PAT:0h" in the TUI permanently.

### 4. 10 achievement description/checker threshold mismatches
**Files:** `src/shared/companion-types.ts` (ACHIEVEMENTS descriptions) vs `src/daemon/companion.ts` (ACHIEVEMENT_CHECKERS)
**Evidence — each mismatch with exact lines:**

| Achievement | Description says | Checker does | Desc line | Check line |
|---|---|---|---|---|
| centurion | 100 sessions | >= 50 | types.ts:165 | companion.ts:254 |
| thousand-boulder | 1000 sessions | >= 500 | types.ts:166 | companion.ts:255 |
| hive-mind | 500 agents | >= 200 | types.ts:169 | companion.ts:258 |
| old-growth | 30 days old | >= 14 days | types.ts:170 | companion.ts:259 |
| marathon | 10+ agents | >= 15 | types.ts:173 | companion.ts:263 |
| quick-draw | within 30s | < 20,000ms | types.ts:181 | companion.ts:278 |
| all-nighter | 8+ hours | >= 21,600,000ms (6h) | types.ts:187 | companion.ts:310 |
| creature-of-habit | 20 visits | >= 10 | types.ts:192 | companion.ts:320 |
| loyal | 50 visits | >= 30 | types.ts:193 | companion.ts:321 |
| hot-streak | 7 consecutive | >= 5 | types.ts:196 | companion.ts:332 |

**Impact:** Users see descriptions that don't match unlock conditions. marathon (desc says 10+, checker requires 15) will confuse users who meet the stated bar but don't unlock. quick-draw (desc says 30s, checker requires 20s) similarly misleading. Tests verify checker behavior, not descriptions — all 174 tests pass despite mismatches.
**Fix:** Update descriptions to match the new recalibrated checker thresholds, or vice versa.

### 5. Level curve: instant jump to L3 after first session
**File:** `src/daemon/companion.ts:97-107` (computeLevel) and :88-94 (computeXP)
**Evidence:** After 1 completed session (luck=1.0): XP = 80 (strength) + 5 (endurance 20min) + 0 (wisdom) + 300 (luck=1.0 * 100 * 3) + 0 (patience) = 385 XP. Level thresholds: L2=150, L3=352, L4=624. Result: jumps from L1 to L3 immediately.
**Impact:** Levels 1-2 are never experienced. The "Pebble Pusher" title (level 2) is invisible. The level curve feels jarring — first session = instant L3, then 3 more sessions for L4.
**Root cause:** The luck XP bonus (300 at luck=1.0) is disproportionately large relative to early thresholds. First session always has luck=1.0 because it's clean.

## MEDIUM ISSUES

### 6. XP formula in daemon/CLAUDE.md is stale
**File:** `src/daemon/CLAUDE.md` (companion.ts bullet)
**Evidence:** CLAUDE.md says "strength×100 + endurance/3.6M×10 + wisdom×50 + luck×200 + patience/3.6M×5". Code (companion.ts:89-94) has strength×80 + endurance/3.6M×15 + wisdom×40 + luck×300 + patience/3.6M×8. Every coefficient differs.
**Fix:** Update CLAUDE.md to match recalibrated code.

### 7. recomputeXpLevelTitle called needlessly in onAgentCrashed and onAgentSpawned
**File:** `src/daemon/companion.ts:521,527`
**Evidence:** `onAgentSpawned` only increments `lifetimeAgentsSpawned`; `onAgentCrashed` only resets `consecutiveCleanSessions`. Neither changes XP-affecting stats (strength, endurance, wisdom, luck, patience). The `recomputeXpLevelTitle` call always produces the same XP/level/title.
**Fix:** Remove the recomputeXpLevelTitle calls from both functions.

### 8. wanderer achievement uses lossy lastSeen instead of dailyRepos
**File:** `src/daemon/companion.ts:322-329`
**Evidence:** Checker builds daily repo counts from `repo.lastSeen`, which only reflects the MOST RECENT visit date. If repo A is visited on Monday and then on Tuesday, Monday's count loses repo A. `companion.dailyRepos` (maintained by onSessionStart at :432-435) tracks exact daily visits but is ignored by the checker.
**Fix:** Use `companion.dailyRepos` instead of reconstructing from lastSeen.

### 9. dawn-patrol logic doesn't match description
**File:** `src/daemon/companion.ts:287-300`
**Evidence:** Description says "Session active spanning midnight to 6am". Checker tests `start < sixAm && end >= sixAm` — this checks sessions spanning the 6am boundary (started before 6am, ended after), NOT sessions spanning midnight. A session starting at 11pm and ending at 1am would NOT trigger this despite spanning midnight.

### 10. Dead code in getBaseForm for level 20+
**File:** `src/shared/companion-render.ts:25-26`
**Evidence:** The `<= 19` branch returns `'ᕦ(FACE)ᕤ {BOULDER}'` and the fallback `return` returns the identical string. The TITLE_MAP has entries at levels 25 and 30, suggesting a 6th form tier was intended but never implemented.

### 11. debugMood writes silently discarded when mood unchanged
**File:** `src/daemon/pane-monitor.ts:244-250`
**Evidence:** computeMood mutates companion.debugMood on every call (companion.ts:232), but saveCompanion only runs when mood changes (pane-monitor.ts:245-249). The TUI debug overlay reads debugMood from the file, so it shows stale scores during stable mood periods. This is documented in CLAUDE.md as intentional but the debug overlay suffers.

## TEMPORAL DECAY WIRING: CORRECT
The 2-minute decay window for justCompleted/justCrashed/justLeveledUp is wired correctly. markEvent* functions in pane-monitor.ts (lines 31-33) are called synchronously from session-manager.ts handlers. The poll loop's signal construction (pane-monitor.ts:228-242) is synchronous with no await points, preventing interleaving races. DECAY_WINDOW of 120,000ms (2 min) is appropriate for a 5s poll interval.

## MOOD SCORING VARIABILITY: CONFIRMED
Walked through 4 representative scenarios:
- Morning start (hour=8, 5min session, 2 agents, cleanStreak=3): **happy wins at 57** (zen=27)
- Mid-grind (hour=14, 90min, 4 agents, cycleCount=5): **grinding wins at 45** (excited=20)
- Late night (hour=3, 60min, endurance=55h, sessionsCompleted=20): **existential wins at 73** (sleepy=20)
- Post-completion (hour=15, justCompleted, cleanStreak=5): **happy wins at 120** (zen=27)
- All-zero signals (hour=12): **happy wins at 8** (all others 0 — falls through to afternoon hour bonus)

Removing the grinding base advantage does produce good variability across scenarios. The scoring system works well for its intended purpose.

## EDGE CASES: SAFE
- All signals zero: happy wins at 8 (afternoon hour bonus). No crash.
- Signals undefined: returns time-of-day mood (existential 2-6, sleepy 22-2, zen otherwise). No crash.
- activeAgentCount undefined: `?? 0` coalesces correctly everywhere.
- 0-agent session through onSessionComplete: no crash, but grants clean streak point (arguable).

## LEVEL CURVE (threshold=150, scaling=1.35)
| Level | Cumulative XP | Sessions to reach (20min avg, luck=1, wisdom/3) |
|---|---|---|
| 1 | 0 | 0 |
| 2 | 150 | 1 (instant — luck XP overshoots) |
| 3 | 352 | 1 (instant — 385 XP from first session) |
| 4 | 624 | 4 |
| 5 | 991 | 8 |
| 6 | 1,486 | 13 |
| 7 | 2,154 | 19 |
| 8 | 3,055 | ~27 |
| 9 | 4,271 | ~37 |
| 10 | 5,912 | ~50 |

Curve feels reasonable from L4 onward. The L1→L3 instant jump (finding #5) is the only tuning concern.

## SUMMARY BY PRIORITY
1. Fix sessionsCompletedToday (bug, 1 line)
2. Fix luck formula (bug, 1 line)
3. Add patience accumulation (missing feature)
4. Sync achievement descriptions to checker thresholds (10 strings)
5. Tune first-session XP to avoid L3 instant jump (consider reducing luck coefficient or raising L2/L3 thresholds)
6. Update daemon/CLAUDE.md XP formula docs