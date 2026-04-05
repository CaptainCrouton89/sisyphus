# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: 9a02cc3c-c228-4c4a-893c-9036fcac354f
- **Your Task**: Apply the companion recalibration spec from `.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/context/recalibration-spec.md` to `src/daemon/companion.ts`.

Read the spec first, then read the current companion.ts. Apply these specific changes:

## 1. Mood Scoring (computeMood function)

- Remove the `grinding` base advantage (change `grinding: 5` to `grinding: 0`)
- Rebalance all mood scoring weights per the spec's "Proposed: Rebalanced Mood Scoring" section
- The function takes `signals` which has: recentCrashes, idleDurationMs, sessionLengthMs, cleanStreak, justCompleted, justCrashed, justLeveledUp, hourOfDay, activeAgentCount
- Add NEW signals usage: `cycleCount` and `sessionsCompletedToday` (these will be added to MoodSignals by another agent — use optional chaining: `signals.cycleCount ?? 0`)
- Key changes:
  - Happy: cleanStreak * 10, morning hours +15/+8, new early-session optimism
  - Grinding: 20min/60min/120min tiers, activeAgentCount >= 3 bonus, cycleCount >= 3 bonus  
  - Frustrated: add long-session frustration (>180min), high cycle count (>=8), brief idle (3-10min)
  - Zen: patience >20h, tighter idle window (2-15min), cleanStreak >1, calm morning bonus
  - Sleepy: idle >15min/45min/90min tiers, keep late-night bonuses
  - Excited: keep existing + add large swarm (>=6 agents) and fast-win bonuses
  - Existential: lower endurance threshold (40h from 100h), add midnight-2am, experience bonus

## 2. XP Formula (computeXP function)

```
strengthXP = strength * 80     (was *100)
enduranceXP = (endurance/3.6M) * 15  (was *10)
wisdomXP = wisdom * 40          (was *50)
luckXP = (luck * 100) * 3      (was *2)
patienceXP = (patience/3.6M) * 8    (was *5)
```

## 3. Level Curve (computeLevel function)

```
Starting threshold: 150     (was 200)
Scaling factor: 1.35        (was 1.5)
```

## 4. Achievement Thresholds (ACHIEVEMENT_CHECKERS)

Lower:
- centurion: 50 (was 100)
- thousand-boulder: 500 (was 1000)
- hive-mind: 200 (was 500)
- all-nighter: 21_600_000 (6h, was 28_800_000/8h)
- old-growth: 14 days (was 30)

Raise:
- marathon: 15 agents (was 10)
- speed-run: 480_000 (8min, was 600_000/10min)
- quick-draw: 20_000 (20s, was 30_000/30s)

Adjust behavioral:
- creature-of-habit: 10 visits (was 20)
- loyal: 30 visits (was 50)
- hot-streak: 5 consecutive clean (was 7)
- momentum: 3 hours window (was 4 hours) — change 4 * 60 * 60 * 1000 to 3 * 60 * 60 * 1000

## 5. Stat Cosmetics (getStatCosmetics in companion-render.ts is handled by another agent)

But in companion.ts there are no stat cosmetic thresholds — they're in companion-render.ts. Skip this.

Make sure to preserve all existing code structure, exports, and types. Only modify the numerical values and scoring logic.

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
