# Achievement Overhaul Spec

Synthesized from 3 parallel audits against 32 historical sessions (232 agents, ~3.5 sessions/day, ~7.25 agents/session median).

## Part 1: Threshold Changes on Existing Achievements

| ID | Old Threshold | New Threshold | New Description |
|----|---------------|---------------|-----------------|
| `centurion` | 50 sessions | 100 sessions | "Complete 100 sessions." |
| `thousand-boulder` | 500 sessions | 1000 sessions | "Complete 1,000 sessions." |
| `cartographer` | 10 repos | 5 repos | "Work in 5 different repos." |
| `world-traveler` | 25 repos | 15 repos | "Work in 15 different repos." |
| `hive-mind` | 200 agents | 500 agents | "Spawn 500 agents over a lifetime." |
| `wanderer` | 5 repos/day | 3 repos/day | "3+ different repos in a single calendar day." |
| `hot-streak` | 5 clean sessions | 15 clean sessions | "15 consecutive clean sessions." |
| `momentum` | 3-in-3h | 5-in-4h | "5 sessions completed within 4 hours." |
| `pair-programming` | 3 messages | 8 messages | "8+ user messages during a single active session." |
| `speed-run` | < 8 min | < 15 min | "Complete a session in under 15 minutes." |
| `all-nighter` | 6h (21.6M ms) | 5h (18M ms) | "Single session running 5+ hours." |
| `night-owl` | 00:00-06:00 | 01:00-05:00 | "Complete a session started between 1am and 5am." |
| `dawn-patrol` | any span midnight-6am | 3h+ session spanning midnight-6am | "Session running 3+ hours that spans midnight to 6am." |

## Part 2: Redefinitions

### `flawless`
**Old:** Zero crashes in any completed session (trivially easy — 100% trigger rate)
**New:** Complete a session with 10+ agents and zero agent crashes or kills.
**Description:** "Complete a session with 10+ agents and zero crashes."
**Checker:** `s.agents.length >= 10 && s.status === 'completed' && s.agents.every(a => a.status !== 'crashed' && a.status !== 'killed')`

### `iron-will`
**Old:** 10 consecutive clean sessions (trivially easy with 0% crash rate)
**New:** 10 consecutive sessions each completing in 3 or fewer orchestrator cycles.
**Description:** "10 consecutive sessions completing in 3 or fewer cycles."
**State change needed:** Add `consecutiveEfficientSessions: number` to `CompanionState`.
**Tracking:** In `onSessionComplete`, check `(session.orchestratorCycles?.length ?? 0) <= 3`. If true, increment; else reset to 0.
**Checker:** `c.consecutiveEfficientSessions >= 10`

## Part 3: New Achievements

### Milestones (17 new)

| ID | Name | Category | Description | Checker |
|----|------|----------|-------------|---------|
| `regular` | Regular | milestone | "Complete 10 sessions." | `c.sessionsCompleted >= 10` |
| `veteran` | Veteran | milestone | "Complete 500 sessions." | `c.sessionsCompleted >= 500` |
| `swarm-starter` | Swarm Starter | milestone | "Spawn 50 agents over a lifetime." | `c.lifetimeAgentsSpawned >= 50` |
| `legion` | Legion | milestone | "Spawn 2,000 agents over a lifetime." | `c.lifetimeAgentsSpawned >= 2000` |
| `army-of-thousands` | Army of Thousands | milestone | "Spawn 5,000 agents over a lifetime." | `c.lifetimeAgentsSpawned >= 5000` |
| `singularity` | Singularity | milestone | "Spawn 10,000 agents over a lifetime." | `c.lifetimeAgentsSpawned >= 10000` |
| `first-shift` | First Shift | milestone | "10 hours of total agent active time." | `c.totalActiveMs >= 36_000_000` |
| `workaholic` | Workaholic | milestone | "100 hours of total agent active time." | `c.totalActiveMs >= 360_000_000` |
| `time-lord` | Time Lord | milestone | "500 hours of total agent active time." | `c.totalActiveMs >= 1_800_000_000` |
| `eternal-grind` | Eternal Grind | milestone | "2,000 hours of total agent active time." | `c.totalActiveMs >= 7_200_000_000` |
| `epoch` | Epoch | milestone | "5,000 hours of total agent active time." | `c.totalActiveMs >= 18_000_000_000` |
| `seasoned` | Seasoned | milestone | "Companion is 90 days old." | `daysSince(c.createdAt) >= 90` |
| `omnipresent` | Omnipresent | milestone | "Work in 30 different repos." | `Object.keys(c.repos).length >= 30` |
| `apprentice` | Apprentice | milestone | "Reach level 5." | `c.level >= 5` |
| `journeyman` | Journeyman | milestone | "Reach level 15." | `c.level >= 15` |
| `master` | Master | milestone | "Reach level 30." | `c.level >= 30` |
| `grandmaster` | Grandmaster | milestone | "Reach level 50." | `c.level >= 50` |

### Session (10 new)

| ID | Name | Category | Description | Checker |
|----|------|----------|-------------|---------|
| `squad` | Squad Up | session | "Complete a session with 10+ agents." | `s.agents.length >= 10` |
| `battalion` | Battalion | session | "Complete a session with 25+ agents." | `s.agents.length >= 25` |
| `swarm` | The Swarm | session | "Complete a session with 50+ agents." | `s.agents.length >= 50` |
| `deep-dive` | Deep Dive | session | "A session with 15+ orchestrator cycles." | `s.orchestratorCycles.length >= 15` |
| `abyss` | Into the Abyss | session | "A session with 25+ orchestrator cycles." | `s.orchestratorCycles.length >= 25` |
| `eternal-recurrence` | Eternal Recurrence | session | "A session with 40+ orchestrator cycles." | `s.orchestratorCycles.length >= 40` |
| `endurance` | Endurance | session | "A single session running 4+ hours." | `s.activeMs >= 14_400_000` |
| `ultramarathon` | Ultramarathon | session | "A single session running 6+ hours." | `s.activeMs >= 21_600_000` |
| `one-shot` | One Shot | session | "Complete with 5+ agents in exactly 1 orchestrator cycle." | `s.agents.length >= 5 && s.orchestratorCycles.length === 1 && s.status === 'completed'` |
| `flash` | Flash | session | "Complete a session in under 2 minutes." | `s.activeMs < 120_000 && s.status === 'completed'` |

### Behavioral (4 new)

| ID | Name | Category | Description | Checker |
|----|------|----------|-------------|---------|
| `overdrive` | Overdrive | behavioral | "Complete 6+ sessions in a single calendar day." | Count entries in `c.recentCompletions` sharing same ISO date `>= 6` |
| `iron-streak` | Iron Streak | behavioral | "14 consecutive days with at least one session." | `c.consecutiveDaysActive >= 14` |
| `deep-conversation` | Deep Conversation | behavioral | "Send 20+ messages to a single session." | `s.messages.filter(m => m.source.type === 'user').length >= 20` |
| `one-must-imagine` | One Must Imagine | behavioral | "Restart the same task 10+ times." | `Object.values(c.taskHistory).some(v => v >= 10)` |

## Part 4: State Changes

### CompanionState additions:
```typescript
consecutiveEfficientSessions: number;  // for iron-will redefinition
```

### loadCompanion forward-compat:
```typescript
if (state.consecutiveEfficientSessions == null) state.consecutiveEfficientSessions = 0;
```

### createDefaultCompanion:
```typescript
consecutiveEfficientSessions: 0,
```

### onSessionComplete tracking:
```typescript
// Track consecutive efficient sessions (for iron-will)
const cycleCount = session.orchestratorCycles?.length ?? 0;
if (cycleCount <= 3) {
  companion.consecutiveEfficientSessions++;
} else {
  companion.consecutiveEfficientSessions = 0;
}
```

## Part 5: Complete AchievementId List

Total: 66 achievements (35 existing + 31 new)

### All IDs (for type union):
```
// Milestone (25)
first-blood, regular, centurion, veteran, thousand-boulder,
cartographer, world-traveler, omnipresent,
swarm-starter, hive-mind, legion, army-of-thousands, singularity,
first-shift, workaholic, time-lord, eternal-grind, epoch,
old-growth, seasoned, ancient,
apprentice, journeyman, master, grandmaster

// Session (19)
marathon, squad, battalion, swarm,
blitz, speed-run, flash,
flawless, iron-will, glass-cannon, solo,
one-more-cycle, deep-dive, abyss, eternal-recurrence,
endurance, ultramarathon, one-shot, quick-draw

// Time (6) — unchanged
night-owl, dawn-patrol, early-bird, weekend-warrior, all-nighter, witching-hour

// Behavioral (16)
sisyphean, stubborn, one-must-imagine,
creature-of-habit, loyal,
wanderer, streak, iron-streak,
hot-streak, momentum, overdrive,
patient-one, message-in-a-bottle, deep-conversation,
comeback-kid, pair-programming
```

## Part 6: Files to Modify

1. **`src/shared/companion-types.ts`** — AchievementId union (add 31 new IDs), ACHIEVEMENTS array (add 31 entries, update 13 descriptions), CompanionState (add `consecutiveEfficientSessions`)
2. **`src/daemon/companion.ts`** — ACHIEVEMENT_CHECKERS (add 31 new, modify 15 existing), loadCompanion (forward-compat), createDefaultCompanion (new field), onSessionComplete (track efficient sessions)
3. **`src/shared/companion-badges.ts`** — BADGE_ART (add 31 new entries with simple ASCII art)
4. **`src/__tests__/companion.test.ts`** — Update threshold tests, add tests for new achievements, update ACHIEVEMENTS count (35 → 66)
