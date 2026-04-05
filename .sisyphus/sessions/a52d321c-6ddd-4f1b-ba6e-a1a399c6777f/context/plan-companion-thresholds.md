# Companion Threshold Calibration Plan

Based on real data analysis (context/data-analysis.md). Goal: optimize for mood **variability across the day**, fix unreachable achievements, lower cosmetic thresholds.

## 1. Mood Scoring (companion.ts → `computeMood`)

### Problem
Grinding dominates (score 60 for >60min sessions). Frustrated never fires (0 crashes in real data). Mood is monotonous.

### Changes
Reduce grinding's dominance and add more diversity signals:

```
// Grinding — less aggressive scaling
Base: 5 (was 10)
>60min: +15 (was +30 at 30min)
>120min: +10 (was +20 at 60min)
Max grinding: 30 (was 60)

// Happy — more paths to happiness
justCompleted: +50 (keep)
cleanStreak * 8 (was *5) — clean streaks matter more
Morning hours (6-12): +10 (was +5 for 6-17)
Afternoon (12-17): +5

// Zen — easier to reach during smooth operation
idle 5-30min: +25 (keep)
cleanStreak > 2: +15 (was > 3)
patienceHours > 50: +20 (was > 100)
Session running < 30min and no crashes: +15 (NEW — early session calm)

// Excited — more triggers
justLeveledUp: +60 (keep)
justCompleted + 5+ agents: +30 (keep)
agentCount >= 4 active right now: +20 (NEW — parallel work buzz)
Session < 10min: +15 (NEW — fresh start energy)

// Existential — keep for late night flavor
2-6am: +25 (keep)
enduranceHours > 100: +20 (was > 200)
Combined late + high endurance: +30 (keep)

// Sleepy — keep but tune
idle > 30min: +35 (keep)
idle > 60min: +25 (keep)  
22:00-06:00: +20 (keep)
idle > 10min + late night: +15 (NEW — drowsy earlier)

// Frustrated — lower threshold since crashes are rare, make it meaningful when they do happen
per crash: +30 (was +25)
justCrashed: +45 (was +40)
```

### New MoodSignals field needed
Add `activeAgentCount: number` to MoodSignals (populated in pane-monitor.ts from tracked session agents).

## 2. Achievement Thresholds (companion.ts → `ACHIEVEMENT_CHECKERS`)

### Fix impossible/unreasonable achievements:
- `blitz`: <2min → **<5min** (speed-run keeps <5min? No — shift both)
  - `blitz`: <3min completed session
  - `speed-run`: <10min completed session  
- `momentum`: 3 completions in 60min → **3 completions in 4 hours** (a productive day)
- `glass-cannon`: Keep as-is (legendary rare achievement — it's fine if it never fires)

### Adjust achievement definitions (companion-types.ts descriptions):
- Update description text to match new thresholds

## 3. Cosmetic Thresholds (companion-render.ts → `getStatCosmetics`)

Current → Proposed:
- `wisdom > 30` for wisps → `wisdom > 15` (~15 efficient sessions)
- `endurance > 1.8B ms` (500h) for trail → `endurance > 180_000_000` (50h)
- `luck > 0.8` for sparkle → `luck > 0.7` (slightly easier)
- `patience > 1.8B ms` (500h) for zen-prefix → `patience > 180_000_000` (50h)

## 4. XP/Level Curve (companion.ts)

Current curve is reasonable (Level 8 at 51 sessions). Keep as-is.

Only change: Level 15+ titles are inaccessible for months — that's fine, they're aspirational.

## Files to modify:
- `src/daemon/companion.ts` — mood scoring, achievement checkers
- `src/shared/companion-types.ts` — MoodSignals (add activeAgentCount), achievement descriptions
- `src/shared/companion-render.ts` — cosmetic thresholds
- `src/daemon/pane-monitor.ts` — populate activeAgentCount in MoodSignals
- `src/__tests__/companion.test.ts` — update tests for new thresholds
- `src/__tests__/companion-render.test.ts` — update cosmetic threshold tests
