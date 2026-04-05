Applied all recalibration changes to src/daemon/companion.ts.

## Changes made

**computeXP**: strength *80 (was *100), endurance *15 (was *10), wisdom *40 (was *50), luck *3 (was *2), patience *8 (was *5)

**computeLevel**: starting threshold 150 (was 200), scaling factor 1.35 (was 1.5)

**computeMood**:
- grinding base score 0 (was 5)
- Added cycleCount and sessionsCompletedToday via optional chaining
- Happy: cleanStreak *10, morning +15/+8, early session optimism (+12 when agents active <15min)
- Grinding: 20/60/120min tiers, activeAgentCount>=3 +10, cycleCount>=3 +8
- Frustrated: >180min +15, cycleCount>=8 +10, idle 3-10min +8
- Zen: patience >20h +15, idle 2-15min, cleanStreak >1, <20min session, calm morning
- Sleepy: >15min/45min/90min tiers, late night kept
- Excited: kept all + large swarm (>=6) +15, fast win (<20min) +20
- Existential: endurance >40h +15 (was >100h), midnight-2am +10, sessionsCompleted>15 +8, sessionsCompletedToday>=4 +5

**ACHIEVEMENT_CHECKERS**:
- centurion: 50 (was 100)
- thousand-boulder: 500 (was 1000)
- hive-mind: 200 (was 500)
- old-growth: 14 days (was 30)
- all-nighter: 21_600_000 / 6h (was 28_800_000 / 8h)
- marathon: 15 agents (was 10)
- speed-run: <480_000 / 8min (was <600_000 / 10min)
- quick-draw: <20_000 / 20s (was <30_000 / 30s)
- creature-of-habit: 10 visits (was 20)
- loyal: 30 visits (was 50)
- hot-streak: 5 consecutive clean (was 7)
- momentum: 3h window (was 4h)

Note: signals.cycleCount and signals.sessionsCompletedToday are referenced via optional chaining as the spec requires — MoodSignals type update handled by another agent.