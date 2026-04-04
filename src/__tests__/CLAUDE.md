# CLAUDE.md — src/__tests__

## companion-render.test.ts

### Tier breakpoints & `{BOULDER}` placeholder
`getBaseForm` must emit `{BOULDER}`, never literal `@`/`OO` — `splitBodyAndBoulder` previously discarded them via `lastIndexOf`, broke on dynamic boulder mismatch.
`getBaseForm`: 1–2 → `(FACE) {BOULDER}`, 3–7 → `(FACE)/ {BOULDER}`, 8–11 → `\(FACE)/ {BOULDER}`, 12–19 → `ᕦ(FACE)ᕤ {BOULDER}`, 20+ → crowned (♛ + ᕦᕤ).
`getBoulderForm`: 0→`""`, 1–2→`"o"`, 3–6→`"O"`, 7–15→`"◉"`, 16–35→`"@"`, 36+→`"@@"`. Nickname appended as `' "name"'`. No agentCount arg → `''`.

### `getMoodFace` face strings (pinned by tests — easy to accidentally change)
Intensity: mild (<30) / moderate (30–70) / intense (>70). Unknown mood throws.
`happy`: `^.^` / `^‿^` / `✧‿✧` · `grinding`: `>.<` / `>_<` / `ò.ó` · `frustrated`: `>.<#` / `ಠ_ಠ` / `ಠ益ಠ` · `zen`: `‾.‾` / `‾‿‾` / `˘‿˘` · `sleepy`: `-.-)zzZ` / `-_-)zzZ` / `˘.˘)zzZ` · `excited`: `*o*` / `*◡*` / `✦◡✦` · `existential`: `◉_◉` / `⊙_⊙` / `◉‸◉`.
`createDefaultCompanion()` has no `debugMood`; pass via `makeCompanion` to test non-mild tiers.

### `getStatCosmetics` strict-`>` thresholds
`wisdom > 5` → `wisps`, `endurance > 36_000_000` → `trail`, `patience > 50` → `zen-prefix`. Boundary value returns nothing.
`composeLine` order: `wisps` wraps boulder as `~{B}~`, `trail` appends ` ...`, `zen-prefix` prepends `☯ ` to the entire line.

### `renderCompanion` options
- `color: true` → ANSI `\x1b[` codes; `tmuxFormat: true` → `#[fg=...]`; both false by default.
- `repoPath` → resolves `companion.repos[repoPath].nickname` and appends it to the boulder string.
- `['face', 'boulder']` — `boulder` is a no-op; boulder renders inside the face line. Boulder-only requires `face` absent.
- `maxWidth` uses `string-width` (display columns, not `.length`) — CJK/wide chars count as 2. Commentary shrinks first; hard `slice(0, maxWidth-1) + '…'` only if still over.

## companion.test.ts

### XP / level / title
`computeXP`: `strength×50 + floor(endurance/3_600_000)×20 + wisdom×40 + patience×8`.
Level thresholds: L2:150 L3:352 L4:624 L5:991 L10:5912 (base 150, each costs `floor(prev × 1.35)`). `computeLevelProgress.xpForNextLevel` = next level cost only, not cumulative.
Title checkpoints (between levels fall back to previous): 1→"Boulder Intern", 5→"Slope Familiar", 10→"Boulder Brother", 20→"The Absurd Hero", 25→"One Must Imagine Him Happy", 30→"He Has Always Been Here".

### `ACHIEVEMENTS` guard / session scope
Line 621 asserts exactly 67 entries — adding/removing without updating this count fails the suite.
Without `session` arg to `checkAchievements`, only companion-state achievements fire; session-scoped ones (`blitz`, `quick-draw`, `marathon`, `flawless`, `glass-cannon`, etc.) silently don't evaluate.

### Re-completion delta crediting
`onSessionComplete` subtracts `companionCreditedCycles`, `companionCreditedActiveMs`, `companionCreditedStrength` before applying stats — prevents double-credit on continue→re-complete. Wisdom excluded (quality signal, not cumulative).

### Stat mechanics
- `computeStrengthGain` tiers: 0→0, 1–2→1, 3–5→2, 6–10→3, 11–20→4, 21+→5.
- `patience` = `ceil(sqrt(cycleCount))`; delta: `ceil(sqrt(new)) - ceil(sqrt(credited))`.
- `wisdom` per session, capped at 3: (1) ≥80% completed, (2) ≥2 agents/cycle, (3) ≥2 distinct orchestrator `mode` values.
- `onAgentCrashed` only resets `consecutiveCleanSessions`; `sessionsCrashed` increments once per session via `onSessionComplete`.

### Streak counters
`consecutiveEfficientSessions`: increments ≤3 cycles (`speed-demon` at ≥10). `consecutiveHighCycleSessions`: increments ≥8 cycles (`iron-will` at ≥5). Both independent of `consecutiveCleanSessions` (`hot-streak` at ≥15). `consecutiveDaysActive`: `streak` ≥7, `iron-streak` ≥14.

### `zScore` / baselines
Cold-start `sessionMs` defaults (count < 5): mean=3,600,000 stddev=2,400,000. Effective stddev = `max(rawStddev, mean×0.20, absoluteFloor)` (absoluteFloor: 300,000 for `sessionMs`, 1.0 for `cycleCount`). `computeMood`: explicit signals (`justCompleted`/`justCrashed`/`justLeveledUp`) override z-scores; `cycleCount z > 2 → frustrated`, `sessionLengthMs z > threshold → grinding`.
`baselines.pendingDayCount` accumulates same-day completions; `sessionsPerDay` (Welford) only finalizes when calendar day changes — checked via `baselines.lastCountedDay`.

### Achievement thresholds (easy to mix up)
Speed: `flash` < 120,000ms, `blitz` < 300,000ms, `speed-run` < 900,000ms (all require `completed`). Messages: `pair-programming` ≥8, `message-in-a-bottle` ≥10, `deep-conversation` ≥20.
Agents: `solo` = exactly 1, `squad` ≥10, `marathon` ≥15, `flawless` ≥10 all completed (not 15), `glass-cannon` ≥5 all crashed. `quick-draw`: first agent `spawnedAt` within 30s of `createdAt`.
Cycles: `one-more-cycle` ≥10, `deep-dive` ≥15, `one-shot` ≥5 agents + exactly 1 cycle. Streaks: `regular` ≥10 sessions, `centurion` ≥100, `thousand-boulder` ≥1000; `cartographer` ≥5 repos, `world-traveler` ≥15; `swarm-starter` ≥50, `hive-mind` ≥500 agents; `old-growth` ≥14d, `ancient` ≥365d.

### Time-based achievement edge cases
- `night-owl`: `hour >= 1 && hour < 6` — midnight (hour 0) does NOT fire. `early-bird`: `hour < 6` — hour 0 fires. `witching-hour`: exactly hour 3 (not a range).
- `dawn-patrol`: overlap with 0–6am ≥3 hours (handles midnight-spanning). `weekend-warrior` checks `completedAt` day-of-week, not `createdAt`.

### Behavioral achievement field dependencies
- `comeback-kid`: requires `session.parentSessionId`. `wanderer`: reads `companion.dailyRepos` (date → repo array), fires at ≥3 repos same day.
- `momentum`: `companion.recentCompletions`, fires when 5+ completions span ≤4 hours. `overdrive`: 6+ with today's date prefix.
- `creature-of-habit` ≥20 visits, `loyal` ≥50 visits (reads `companion.repos[path].visits`).
- `taskHistory` key: `'repoPath:taskDescription'`. `sisyphean` ≥3, `stubborn` ≥5 (`sessionsCompleted > 0` required), `one-must-imagine` ≥10.
- `patient-one`: compares `cycles[i].completedAt` to `cycles[i+1].timestamp`; cycle without `completedAt` skips.
