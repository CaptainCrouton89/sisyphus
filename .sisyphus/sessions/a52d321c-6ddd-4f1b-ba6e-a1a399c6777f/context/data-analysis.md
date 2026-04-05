# Real Session Data Analysis

Data source: 55 sessions across 6 repos (northlight: 19, northlight-core: 15, sisyphus: 13, landingpage: 5, Saturn: 3, crm-testing: 3). 51 completed, 4 active.

## Session Timing

- Active time (n=17 with data): P50 = 109min, P75 = 190min, P90 = 334min, Mean = 146min
- 38 sessions have activeMs = 0 (predates time tracking)
- Sessions run primarily 19:00-02:00 (evening/late-night), zero sessions 03:00-16:00
- Day distribution: mostly Tue-Sun, zero Monday sessions

## Agent Statistics

- Agent count per session (n=43 with agents): P50 = 11, P75 = 19, P90 = 30, Mean = 14.3
- Agent types: devcore:programmer (147), sisyphus:explore (54), sisyphus:implement (40), sisyphus:review (35)
- Agent active times (n=198): P50 = 173s (~3min), P75 = 425s (~7min), P90 = 771s (~13min)
- **Zero crashes across all 55 sessions** — the frustrated mood path never triggers

## Cycle Statistics

- Cycles per session: P50 = 4, P75 = 10, P90 = 14, Mean = 7.5
- Cycle active times (n=146): P50 = 246s (~4min), P75 = 670s (~11min)

## Current Companion State

Level 1, 0 XP, 0 sessions completed, 9 agents spawned, 1 repo. The companion hooks exist in session-manager but the companion was likely created after most sessions ran — it has almost no accumulated data.

## Threshold Issues Found

### 1. Mood: Grinding Dominates
- Base grinding score: 10 (always present during session)
- +30 at 30min, +20 at 60min → total 60 for any >60min session
- Median session is 109min, so grinding score ≈ 60 for typical sessions
- Happy only wins on session completion (+50) or with clean streak bonus
- **Result**: companion is perpetually "grinding" during sessions, briefly "happy" at completion

### 2. XP/Level: Reasonable Curve
- 51 sessions → ~6440 XP → Level 8 ("Crag Warden")
- This feels about right for ~2 weeks of heavy use
- Level 15 needs ~116K XP (~900 sessions) — very long term
- Level 20 needs ~886K XP — probably unreachable in practice

### 3. Achievements: Several Never Fire
- Frustrated/crash-dependent achievements (glass-cannon) — zero crashes in data
- blitz (<2min completed session): borderline at 1.8min minimum
- centurion (100 sessions): takes ~4 weeks at current pace
- momentum (3 completions in 60min): very tight window for sisyphus sessions
- Patient-one (30min gap between cycles): likely fires but only during paused sessions

### 4. Cosmetic Thresholds in companion-render.ts
- `wisdom > 30` for wisps: needs 30 efficient sessions — moderate
- `endurance > 1.8B ms` (500 hours) for trail: unreachable for months
- `luck > 0.8` for sparkle: easy with 0 crashes
- `patience > 1.8B ms` (500 hours) for zen-prefix: purely passive accumulation

### 5. Session Metadata Gaps
- No `model` field persisted (always null in state)
- No `sessionLabel` persisted (always null)
- No hour-of-day / day-of-week stored (only derivable from createdAt)
- No session category/type (feature, bugfix, refactor, etc.)
- No wall-clock duration (only activeMs, which is CPU-active time)
- No agent spawn timing relative to session start
