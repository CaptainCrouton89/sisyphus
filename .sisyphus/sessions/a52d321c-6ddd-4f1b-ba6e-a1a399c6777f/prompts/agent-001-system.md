# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: a52d321c-6ddd-4f1b-ba6e-a1a399c6777f
- **Your Task**: Calibrate companion thresholds for realistic usage based on real data analysis. Read the plan at .sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/context/plan-companion-thresholds.md for full details.

Summary of changes:

## 1. Mood Scoring (src/daemon/companion.ts → computeMood)
Reduce grinding dominance. Current grinding hits 60 for any >60min session. Change to:
- Base grinding: 5 (was 10)
- >60min: +15 (was +30 at 30min)  
- >120min: +10 (was +20 at 60min)
- Happy: cleanStreak * 8 (was * 5), morning 6-12 +10 (was +5 for 6-17), afternoon 12-17 +5
- Zen: cleanStreak > 2 (was > 3), patienceHours > 50 (was > 100), NEW: session < 30min running with no crashes +15
- Excited: NEW: activeAgentCount >= 4: +20, NEW: session < 10min: +15
- Existential: enduranceHours > 100 (was > 200)
- Sleepy: NEW: idle > 10min + late night (22-6): +15
- Frustrated: per crash +30 (was +25), justCrashed +45 (was +40)

## 2. New MoodSignals field
Add `activeAgentCount: number` to MoodSignals in src/shared/companion-types.ts.
Populate it in src/daemon/pane-monitor.ts where MoodSignals is built — count agents with status === 'running' from tracked sessions.

## 3. Achievement Fixes (src/daemon/companion.ts ACHIEVEMENT_CHECKERS + src/shared/companion-types.ts descriptions)
- blitz: < 120_000 → < 300_000 (was <2min, now <5min). Update description: "Complete a session in under 5 minutes."
- speed-run: < 300_000 → < 600_000 (was <5min, now <10min). Update description: "Complete a session in under 10 minutes."
- momentum: 60 * 60 * 1000 → 4 * 60 * 60 * 1000 (was 3 completions in 1 hour, now 3 completions in 4 hours). Update description: "3 sessions completed within 4 hours."

## 4. Cosmetic Thresholds (src/shared/companion-render.ts → getStatCosmetics)
- wisdom > 30 → wisdom > 15
- endurance > 1_800_000_000 → endurance > 180_000_000 (50h)
- luck > 0.8 → luck > 0.7
- patience > 1_800_000_000 → patience > 180_000_000 (50h)

## 5. Update Tests
- src/__tests__/companion.test.ts — adjust any tests that rely on old thresholds
- src/__tests__/companion-render.test.ts — adjust cosmetic threshold tests

Read each file before modifying. All new fields must be optional for backwards compat. Keep the existing code style.

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
