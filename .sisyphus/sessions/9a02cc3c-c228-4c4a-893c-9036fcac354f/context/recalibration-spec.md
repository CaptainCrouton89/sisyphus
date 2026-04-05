# Companion Recalibration Spec

## Historical Data Summary (32 sessions, 232 agents)

### Session Metrics
| Metric | P10 | P25 | P50 | P75 | P90 | Max |
|--------|-----|-----|-----|-----|-----|-----|
| Duration (min) | 3.8 | 61.9 | 140.1 | 294.6 | 334.1 | 434.8 |
| Agent count | 0 | 2 | 9 | 20 | 30 | 59 |
| Cycle count | 1 | 2 | 5 | 10 | 22 | 43 |
| Agent active (min) | 0.9 | 1.4 | 2.8 | 6.6 | 11.9 | 116.7 |

### Usage Pattern
- Heavy usage: 21:00-02:00 (~65% of sessions)
- Morning burst: 06:00-09:00 (~12%)
- Crash rate: effectively 0% (zero crashes across all data)
- Sessions per day: 2-5 typical
- Active repos: 2

---

## 1. Mood Scoring Recalibration

### Problem
- `grinding` has base score of 5, always wins when no strong signals present
- `frustrated` only triggers on crashes — with 0% crash rate, it never fires
- `zen`, `happy`, `sleepy` thresholds don't match real idle/session patterns
- `excited` only fires transiently (justLeveledUp, justCompleted) — goes stale in 5s
- Result: mood is stuck on `grinding` during sessions, `sleepy`/`existential` when idle

### Proposed: Rebalanced Mood Scoring

Remove the `grinding` base advantage. Add time-varying dynamics so mood shifts naturally during a session.

```
// Remove grinding base advantage
grinding: 0 (was 5)

// Happy — reward morning sessions, recent completions, and clean streaks
justCompleted: +50 (keep)
cleanStreak * 10 (was *8) — faster accumulation
hourOfDay 6-12: +15 (was +10) — morning boost
hourOfDay 12-17: +8 (was +5)
NEW: activeAgentCount >= 1 && sessionLength < 15min: +12 — early session optimism

// Grinding — should only win during long active sessions
sessionLength > 20min: +12 (was 60min threshold at +15) — real sessions hit 20min commonly
sessionLength > 60min: +15 (was 120min at +10)
sessionLength > 120min: +8 (new third tier)
NEW: activeAgentCount >= 3: +10 — concurrent work feels grindy
NEW: cycleCount >= 3 (within session): +8 — multi-cycle = grinding

// Frustrated — broaden triggers beyond just crashes
recentCrashes * 30: keep
justCrashed: +45: keep
NEW: sessionLength > 180min: +15 — frustration from long sessions
NEW: cycleCount >= 8 within session: +10 — many cycles = something isn't working
NEW: idleDuration 3-10min: +8 — brief waits are annoying (long waits become zen/sleepy)

// Zen — should emerge during calm productive periods
patience > 20h: +15 (was 50h at +20) — reachable sooner
idleDuration 2-15min: +25 (was 5-30min at +25) — tighter window
cleanStreak > 1: +12 (was >2 at +15) — easier trigger
sessionLength 0-20min && noCrashes: +15 (was 0-30min at +15) — shorter window
NEW: hourOfDay 6-10 && noActiveSession: +10 — calm morning

// Sleepy — should dominate when truly idle
idleDuration > 15min: +30 (was 30min at +35) — kicks in sooner
idleDuration > 45min: +25 (was 60min at +25) — deeper sleep sooner
hourOfDay 22+ or <6: +20 (keep)
idleDuration > 5min + late night: +15 (was 10min at +15)
NEW: idleDuration > 90min: +15 — extra sleepy

// Excited — needs more varied triggers
justLeveledUp: +60 (keep)
justCompleted + 5+ agents: +30 (keep)
activeAgentCount >= 4: +20 (keep)
sessionLength 0-10min: +15 (keep — early session energy)
NEW: activeAgentCount >= 6: +15 — large parallel swarm
NEW: justCompleted + sessionLength < 20min: +20 — fast wins are exciting

// Existential — late night + experience
hourOfDay 2-6: +25 (keep)
endurance > 40h: +15 (was 100h at +20) — reachable in ~2 weeks
late night + experienced: +25 (was +30)
NEW: hourOfDay 0-2: +10 — midnight-to-2am gets philosophical
NEW: sessionsCompleted > 15: +8 — seen enough to question meaning
```

### Key design change: Add session phase awareness
The mood system should sense the *phase* of a session (early excitement → grinding middle → completion satisfaction) by using sessionLengthMs as a gradient, not just a step function.

---

## 2. XP & Leveling Recalibration

### Problem
- With 1 completed session (strength=1, endurance=5.7M ms): XP = 315, Level 2
- Level 3 requires 500 cumulative XP (200+300). Level 4 requires 950 (200+300+450).
- At ~315 XP per session, reaching level 5 takes ~6 sessions. Level 10 takes ~65 sessions.
- The 1.5x scaling is too steep for early levels, too shallow for late levels.

### Proposed: Adjusted XP and Level Curve

**XP formula tweaks:**
```
strengthXP = strength * 80     (was *100) — slightly reduce per-session flat XP
enduranceXP = (endurance/3.6M) * 15  (was *10) — reward time more
wisdomXP = wisdom * 40          (was *50) — slightly reduce
luckXP = (luck * 100) * 3      (was *2) — reward consistency more
patienceXP = (patience/3.6M) * 8    (was *5) — reward idle time more
```

**Level curve:**
```
Starting threshold: 150     (was 200)
Scaling factor: 1.35        (was 1.5)
```

This produces:
- Level 2: 150 XP (~1 session)
- Level 3: 352 XP (~2 sessions)  
- Level 4: 625 XP (~3-4 sessions)
- Level 5: 990 XP (~5-6 sessions)
- Level 10: ~5,600 XP (~20 sessions)
- Level 15: ~22,000 XP (~60+ sessions)
- Level 20: ~75,000 XP (~150+ sessions)

Goal: reach level 5 in first week, level 10 in first month.

---

## 3. Boulder Form Recalibration

### Problem
Agent count thresholds (2, 5, 9) only yield 4 boulder sizes. Real data shows P25=2, median=9, P75=20. Most sessions quickly reach the largest boulder and stay there.

### Proposed: 6 tiers based on percentiles

```
agentCount <= 0:  '.'    (no agents — pebble)
agentCount <= 1:  'o'    (solo agent — small rock)
agentCount <= 4:  'O'    (P25 territory — medium boulder)
agentCount <= 9:  '◉'    (median — large boulder, new char)
agentCount <= 20: '@'    (P75 — massive boulder)
agentCount > 20:  '@@'   (P90+ — mountain, rare and dramatic)
```

This gives 6 visually distinct sizes that map to the actual agent count distribution.

---

## 4. Stat Cosmetics Recalibration

### Problem
All thresholds are unreachable for months:
- wisdom > 15 (efficient sessions) — with 0 wisdom currently, needs 15+ efficient sessions
- endurance > 180M ms (50h) — needs 50 hours of active time
- luck > 0.7 (70% clean) — this one is actually easy (user is at 100%)
- patience > 180M ms (50h) — needs 50 hours idle

### Proposed: Progressive cosmetics

```
wisps:      wisdom > 5         (was 15) — ~5 efficient sessions
trail:      endurance > 36M ms (10h)  (was 180M/50h) — ~3 days use
sparkle:    luck > 0.6         (was 0.7) — slightly easier, stays meaningful
zen-prefix: patience > 36M ms (10h)  (was 180M/50h) — ~3 days idle
```

These should start appearing in the first week.

---

## 5. Achievement Threshold Recalibration

### Problem
Several achievements are unreachable or poorly calibrated:
- `centurion` (100 sessions): months away at 2-5/day
- `thousand-boulder` (1000 sessions): years away
- `hive-mind` (500 agents): with ~13 agents/session, that's ~38 sessions
- `marathon` (10+ agents in one session): very common (median=9, many sessions have 20+)
- `blitz` (under 5 min): rare but achievable (P10=3.8min)
- `all-nighter` (8+ hours): max session is 7.2h, so currently impossible

### Proposed: Data-driven adjustments

**Lower thresholds (too high for real data):**
```
centurion: 50 sessions          (was 100) — achievable in ~2-3 weeks
thousand-boulder: 500 sessions  (was 1000) — still aspirational, months not years
hive-mind: 200 agents          (was 500) — ~15 sessions worth
all-nighter: 6 hours           (was 8) — P90 session is 5.5h, so achievable
old-growth: 14 days            (was 30) — two weeks feels meaningful
```

**Raise thresholds (too easy):**
```
marathon: 15+ agents            (was 10) — P50 is 9, so 10 was too easy; 15 = P65
speed-run: 8 minutes            (was 10) — tighter
quick-draw: 20 seconds          (was 30) — snappier
```

**Adjust behavioral:**
```
creature-of-habit: 10 visits    (was 20) — with 2 repos and 2-5 sessions/day, 10 is ~3 days
loyal: 30 visits                (was 50) — ~2 weeks  
hot-streak: 5 consecutive clean (was 7) — with 0% crash rate, 7 was too easy-looking but practically fine; lower to 5 to give faster initial unlock
momentum: 3 sessions in 3 hours (was 4 hours) — tighter window makes it feel more earned
```

---

## 6. Mood Signals Enhancement (pane-monitor.ts)

### Problem
`justCompleted`, `justCrashed`, `justLeveledUp` are hardcoded `false` in the poll loop. Only event hooks set them transiently. This means mood can only react to slow-changing signals (session length, idle time, hour).

### Proposed: Add temporal decay signals

In pane-monitor, track when events last happened and use recency as a signal:

```
lastCompletionTime: number = 0   // epoch ms
lastCrashTime: number = 0        // epoch ms  
lastLevelUpTime: number = 0      // epoch ms

// In poll:
justCompleted = (nowMs - lastCompletionTime) < 120_000  // 2 minutes
justCrashed = (nowMs - lastCrashTime) < 120_000
justLeveledUp = (nowMs - lastLevelUpTime) < 120_000
```

Expose setters called from session-manager event hooks. This gives mood a 2-minute window to react to events, producing visible mood shifts on completions, crashes, and level-ups.

Also add `cycleCount` and `sessionsCompletedToday` to MoodSignals for richer scoring.

---

## Files to Modify

1. **src/daemon/companion.ts** — mood scoring weights, XP formula, level curve, achievement thresholds, stat cosmetic thresholds
2. **src/shared/companion-render.ts** — boulder form thresholds
3. **src/shared/companion-types.ts** — extend MoodSignals with new fields (cycleCount, sessionsCompletedToday)
4. **src/daemon/pane-monitor.ts** — temporal decay for event signals, pass new MoodSignals fields
5. **src/daemon/session-manager.ts** — call pane-monitor setters on events (completion, crash, level-up)
