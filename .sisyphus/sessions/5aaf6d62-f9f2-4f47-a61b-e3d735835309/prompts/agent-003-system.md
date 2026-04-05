# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: 5aaf6d62-f9f2-4f47-a61b-e3d735835309
- **Your Task**: ## Goal
Implement the Companion system's types and core state module for the sisyphus daemon — a persistent ASCII character that levels up from real usage.

## Your Task: WP1 — Types + Core Module

Create two new files and make small additions to two existing files. No other files should be touched.

### Files to CREATE

**1. `src/shared/companion-types.ts`** — All type definitions for the companion system.

See `context/plan-companion.md` "Type Definitions" section for the exact types. Implement all of them verbatim:
- `CompanionStats`, `Mood`, `UnlockedAchievement`, `RepoMemory`, `Commentary`, `CompanionState`
- `CompanionField`, `AchievementId` (all 35 IDs), `AchievementCategory`, `AchievementDef`, `CompanionRenderOpts`

**2. `src/daemon/companion.ts`** — Core state management module.

See `context/plan-companion.md` "Module Interfaces > companion.ts" section for the full API surface. Implement everything listed there:

**Persistence:**
- `loadCompanion()` — Load from `~/.sisyphus/companion.json` (use `companionPath()` from paths.ts). Create default state if file missing. Parse JSON, return CompanionState.
- `saveCompanion(state)` — Atomic write using temp file + rename pattern (same as `state.ts` in `src/daemon/state.ts` — write to `.companion.json.tmp`, then `renameSync`).
- `createDefaultCompanion()` — Zeroed stats, level 1, title "Boulder Intern", mood "sleepy", empty achievements/repos, null name, null lastCommentary.

**XP & Leveling:**
- `computeXP(stats)` — Formula: `strength * 100 + (endurance / 3600000) * 10 + wisdom * 50 + (luck * 100) * 2 + (patience / 3600000) * 5`
- `computeLevel(xp)` — Exponential thresholds: level N requires `floor(100 * 1.5^(N-1))` cumulative XP. Level 1 at 0 XP. Walk thresholds until XP is insufficient.
- `getTitle(level)` — Lookup table:
  1: "Boulder Intern", 2: "Pebble Pusher", 3: "Rock Hauler", 4: "Gravel Wrangler",
  5: "Slope Familiar", 6: "Incline Regular", 7: "Ridge Runner", 8: "Crag Warden",
  9: "Stone Whisperer", 10: "Boulder Brother", 11: "Hill Veteran", 12: "Summit Aspirant",
  13: "Peak Haunter", 14: "Cliff Sage", 15: "Mountain's Shadow", 16: "Eternal Roller",
  17: "Gravity's Rival", 18: "The Unmoved Mover", 19: "Camus Was Right", 20: "The Absurd Hero",
  25: "One Must Imagine Him Happy", 30: "He Has Always Been Here"
  For levels 21-24, 26-29, 31+: use the last milestone title that applies.

**Mood computation:**
- `computeMood(companion, activeSessions, recentCrashes)` — Weighted scoring. Each mood gets a score based on signals. Highest score wins. Ties go to first in enum order.
  - **happy**: +3 if clean completion in last 5min (check companion.moodUpdatedAt vs now, and recent completion), +1 per consecutiveCleanSessions (max 5)
  - **grinding**: +3 if activeSessions > 0, +1 per additional active session
  - **frustrated**: +2 per recentCrashes, +1 per session over 2h (check totalActiveMs)
  - **zen**: +3 if patience > 36000000ms (10h) AND recentCrashes === 0, +1 if hour 17-22
  - **sleepy**: +3 if no active sessions AND companion idle > 30min, +2 if hour 22-6, +1 per hour idle (check moodUpdatedAt)
  - **excited**: +5 if level changed in last 5min, +3 if activeSessions > 0 AND session started recently
  - **existential**: +5 if hour 2-6 AND endurance > 360000000ms (100h), +2 if hour 22-2

**Achievements:**
- `ACHIEVEMENTS` — Array of all 35 `AchievementDef` objects. Categories and conditions are in `context/plan-companion.md` under "Achievement conditions".
- `checkAchievements(companion, session?)` — Evaluate all achievement conditions against current state. Return array of newly unlocked AchievementIds (ones not already in companion.achievements). The session parameter is optional — some achievements need the completing session's data.
- `hasAchievement(companion, id)` — Simple lookup in companion.achievements array.

Achievement condition implementations (all 35):
- **Milestone**: first-blood (sessionsCompleted >= 1), centurion (>= 100), thousand-boulder (>= 1000), cartographer (Object.keys(repos).length >= 10), world-traveler (>= 25), hive-mind (lifetimeAgentsSpawned >= 500), old-growth (daysSince(createdAt) >= 30), ancient (>= 365)
- **Session** (need session param): marathon (session.agents.length >= 10), blitz (session.activeMs < 120000), speed-run (< 300000), flawless (all agents status !== 'crashed' && !== 'killed'), iron-will (consecutiveCleanSessions >= 10), glass-cannon (5+ agents AND all crashed at least once AND session completed), solo (exactly 1 agent), one-more-cycle (session.orchestratorCycles.length >= 10), quick-draw (first agent spawnedAt - session.createdAt < 30000)
- **Time**: night-owl (session started after midnight AND completed), dawn-patrol (session active midnight-6am), early-bird (session started before 6am), weekend-warrior (completed on Sat/Sun), all-nighter (session.activeMs >= 28800000), witching-hour (session started 3-4am)
- **Behavioral**: sisyphean (any taskHistory value >= 3), stubborn (any taskHistory >= 5 AND sessionsCompleted > 0 for that hash), creature-of-habit (any repo visits >= 20), loyal (>= 50), wanderer (any dailyRepos date has 5+ repos), streak (consecutiveDaysActive >= 7), hot-streak (consecutiveCleanSessions >= 7), momentum (3 completions in 1 hour — track via recent completion timestamps), patient-one (session with idle > 30min between cycles), message-in-a-bottle (session?.messages.length >= 10)

**Event handlers:**
- `onSessionStart(companion, cwd)` — Update repo memory (increment visits, update lastSeen, set firstSeen if new), update dailyRepos for today, update consecutiveDaysActive and lastActiveDate, recompute XP/level/title.
- `onSessionComplete(companion, session)` — Increment sessionsCompleted, add session.activeMs to totalActiveMs and stats.endurance, increment stats.strength, compute wisdom (if agent completion times have low variance — stddev of agent.activeMs < mean * 0.3, increment wisdom), update luck (ratio: sessionsCompleted / (sessionsCompleted + sessionsCrashed)), update repo memory (completions++), update consecutiveCleanSessions (reset on crash), recompute XP/level/title, check achievements.
- `onAgentSpawned(companion)` — Increment lifetimeAgentsSpawned, recompute XP/level/title.
- `onAgentCrashed(companion)` — Increment sessionsCrashed, reset consecutiveCleanSessions to 0, update luck ratio, recompute XP/level/title.

**Repo memory:**
- `updateRepoMemory(companion, repoPath, event)` — Increment visits/completions/crashes as appropriate. Set firstSeen/lastSeen. Return updated companion.

### Files to MODIFY

**3. `src/shared/paths.ts`** — Add one function:
```typescript
export function companionPath(): string {
  return join(globalDir(), 'companion.json');
}
```

**4. `src/shared/types.ts`** — Add `nickname?: string` to the Agent interface, after the `name` field (line 49). This is an optional field for companion-assigned agent nicknames.

### Reference Files
- Pattern for atomic writes: `src/daemon/state.ts` (look at how it writes JSON files)
- Session/Agent types: `src/shared/types.ts`
- Path helpers: `src/shared/paths.ts`
- Spec: `.claude/specs/companion.spec.md`
- Plan: `context/plan-companion.md`

### Done Condition
- `src/shared/companion-types.ts` exports all types listed in the plan
- `src/daemon/companion.ts` exports all functions listed in the plan
- `src/shared/paths.ts` has `companionPath()` 
- `src/shared/types.ts` Agent has `nickname?: string`
- `npx tsc --noEmit` passes (type-check only, don't need full build)
- All 35 achievement definitions present in ACHIEVEMENTS array
- All event handlers implemented with correct stat mutations

Report clearly: what files you created/modified, any design decisions you made, any concerns.

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
