# CLAUDE.md — src/__tests__

## companion-render.test.ts

### `{BOULDER}` placeholder regression (lines 354–405)
The bottom block of `renderCompanion` tests are regression guards for a prior bug: `getBaseForm` used to embed literal boulder chars (`OO`, `@`) in the template string. `splitBodyAndBoulder` discarded them via `lastIndexOf`, which produced correct output by accident until agent count diverged from the embedded char. The fix replaced all embedded boulders with the `{BOULDER}` placeholder. Any test asserting `!result.includes('{BOULDER}')` is verifying this contract holds end-to-end.

### `endurance` stat is milliseconds
`getStatCosmetics` threshold is `endurance > 36_000_000` — that's 10 hours in ms. Tests use raw ms values; the stat summary converts to hours (`Math.floor(endurance / 3_600_000)`).

### Intensity tier defaults to 0 (mild) in tests
`getMoodFace` intensity comes from `companion.debugMood?.scores[companion.mood] ?? 0`. `createDefaultCompanion()` does not populate `debugMood`, so all `renderCompanion` face tests use mild-tier faces. To test moderate/intense faces, pass `debugMood` overrides via `makeCompanion`.

### Color wraps the entire face line, not just the face chars
`applyColor` calls `result.replace(facePart, coloredFace)` where `facePart` is the fully-composed body+boulder string (e.g. `ᕦ(^‿^)ᕤ .`). If `facePart` appears more than once in `result` (e.g. it also matches commentary text), only the first occurrence is colorized. Color is a no-op when `face` is not in `fields`.

### `boulder` field is silently skipped when `face` is present
`renderCompanion` embeds the boulder inside the face line. If `fields` includes both `face` and `boulder`, the `boulder` case is a no-op — the boulder renders only once via the face line. `boulder`-only output requires `face` to be absent from `fields`.

### `maxWidth` truncation algorithm
Commentary is shortened first: `available = maxWidth - (totalLength - commentaryLength) - 2` (the `-2` accounts for the double-space joiner). If `available < 0`, commentary is dropped entirely. A hard `result.slice(0, maxWidth - 1) + '…'` truncates the full joined string only if still over limit after commentary shrink.

## companion.test.ts

### Re-completion delta crediting (`companionCreditedCycles` / `companionCreditedActiveMs`)
`onSessionComplete` only credits the delta when called on a session that was previously completed and continued. The session must carry `companionCreditedCycles` and `companionCreditedActiveMs` from the prior completion; the function subtracts these before applying stats. Without these fields, a re-complete call double-credits everything. `strength` always increments by 1 regardless of delta — it's per-call, not per-delta.

### `onAgentCrashed` does NOT increment `sessionsCrashed`
`onAgentCrashed` only resets `consecutiveCleanSessions`. `sessionsCrashed` is incremented at most once per session in `onSessionComplete` (when any agent has `status: 'crashed'`). Multiple crashes in one session → one `sessionsCrashed`. Tests at lines 450–490 guard this explicitly.

### `patience` uses `ceil(sqrt(cycleCount))`
9 cycles → 3 patience, not 9. The test at line 380 is the contract: `ceil(sqrt(9)) = 3`. Delta crediting applies here too — `ceil(sqrt(newCycles)) - ceil(sqrt(creditedCycles))`.

### `wisdom` is per-session, capped at 3 per call
`onSessionComplete` awards up to 3 wisdom points per invocation — one for each criterion met: (1) ≥80% of agents completed, (2) ≥2 agents per orchestrator cycle, (3) ≥2 distinct orchestrator `mode` values. Sessions with zero agents or zero cycles score 0. Delta crediting does not apply to wisdom (it's a quality signal, not a cumulative counter).

### `consecutiveEfficientSessions` threshold is ≤3 cycles
`onSessionComplete` increments `consecutiveEfficientSessions` when `orchestratorCycles.length ≤ 3`, resets to 0 otherwise. The `iron-will` achievement fires at ≥10. Separate from `consecutiveCleanSessions` (crash-free runs).

### `zScore` cold-start and stddev floor
- Uses hardcoded defaults until `RunningStats.count >= 5` (MIN_SAMPLES). Cold-start for `sessionMs`: mean=3,600,000, stddev=2,400,000.
- Effective stddev = `max(rawStddev, mean * ratioFloor, absoluteFloor)`. For `sessionMs`: ratioFloor=0.20, absoluteFloor=300,000. For `cycleCount`: ratioFloor=0.20, absoluteFloor=1.0. Raw stddev of 0 does not produce division-by-zero.

### `sessionsPerDay` baseline finalizes on day rollover
`pendingDayCount` accumulates completions for the current calendar day. `sessionsPerDay` Welford stats only get a new sample when the first completion of a *new* day is detected (comparing ISO date prefix). Same-day completions grow `pendingDayCount` but leave `sessionsPerDay.count === 0`.

### `night-owl` fires for hours 1–5, not hour 0
The achievement checks `hour >= 1 && hour < 6` (exclusive of midnight). A session started exactly at midnight (hour 0) does NOT trigger `night-owl`. Contrast with `early-bird` which fires for hour < 6 (includes midnight).

### `taskHistory` key format
Keys are `'repoPath:taskDescription'` (colon-separated). The `sisyphean` achievement fires at entry value ≥ 3, `stubborn` at ≥ 5 (also requires `sessionsCompleted > 0`), `one-must-imagine` at ≥ 10.

### `patient-one` measures gap between cycle `completedAt` and next cycle `timestamp`
The 30-minute threshold compares `cycles[i].completedAt` to `cycles[i+1].timestamp` — not two consecutive `timestamp` fields. A cycle without `completedAt` skips the gap check entirely.
