# Milestone Achievement Audit & Expansion

## Data Summary

Base rates from 32 sessions / 2 weeks:
- **3.5 sessions/day** → 25/wk, 105/mo, 315/3mo, 630/6mo, 1260/yr
- **7.25 agents/session median** → 180/wk, 760/mo, 2280/3mo, 9100/yr
- **2 repos** currently active
- Companion created ~2 weeks ago

---

## 1. Evaluation of Existing Milestones

### `first-blood` — 1 session ✅ FINE
Instant gratification on first use. Keep.

### `centurion` — 50 sessions ⚠️ SLIGHTLY EASY
At 3.5/day → **~14 days**. That's bronze/silver territory, not the "centurion" fantasy. The name implies 100. Either rename or raise to 100 (~29 days, solid silver).

**Verdict:** Raise to 100 sessions. Restores name accuracy. ~1 month unlock = satisfying.

### `thousand-boulder` — 500 sessions ⚠️ OFF
500 / 3.5 = **143 days (~5 months)**. That's gold/platinum. Fine as a tier, but the name says "thousand" and delivers 500. Either rename to "Five Hundred" (lame) or raise to 1000 (~286 days, ~9.5 months — diamond tier). 

**Verdict:** Raise to 1000. Name integrity matters. ~10 months = legendary feel.

### `cartographer` — 10 repos ❌ TOO HARD (probably)
User has 2 repos after 2 weeks of heavy use. 10 repos implies 5x current diversity. Power users with many projects might hit this in months; focused users never will. This is aspirational but not unachievable over a year.

**Verdict:** Lower to 5 repos (reachable in 2-6 months for most users). Create higher tiers for the ambitious.

### `world-traveler` — 25 repos ❌ UNREALISTIC
25 repos at current rate is years if ever. Only makes sense for users managing dozens of microservices.

**Verdict:** Lower to 15 repos. Still aspirational but not impossible over a year.

### `hive-mind` — 200 agents ❌ WAY TOO EASY
At ~7 agents/session median, 200 agents = ~28 sessions = **~8 days**. This fires in the first week for active users. A "lifetime" achievement shouldn't unlock in week 1.

**Verdict:** Raise to 1000 agents (~4-6 weeks). Create lower tier at 100 for week-1 reward.

### `old-growth` — 14 days ✅ FINE
Simple calendar gate. Two weeks feels like "you stuck around." Good bronze.

### `ancient` — 365 days ✅ FINE
One year. Diamond. No notes.

---

## 2. Gap Analysis

Missing tiers everywhere. Current system has 2 session tiers (1, 50), 1 agent tier (200), 2 age tiers (14d, 365d), 2 repo tiers (10, 25), 0 active-time tiers, 0 level tiers. Need full progressions.

---

## 3. Proposed Tiered Achievements

### Session Count Progression

| ID | Name | Threshold | Timeline | Justification |
|----|------|-----------|----------|---------------|
| `first-blood` | First Blood | 1 | Day 1 | Existing, keep |
| `regular` | Regular | 10 | ~3 days | Quick early reward; P75 of first week |
| `centurion` | Centurion | 100 | ~29 days | Restores name accuracy; solid month-1 milestone |
| `veteran` | Veteran | 500 | ~143 days | ~5 months; gold tier |
| `thousand-boulder` | Thousand Boulder | 1000 | ~286 days | ~10 months; name-accurate diamond |

New definitions needed:
- **`regular`**: `{ id: 'regular', name: 'Regular', category: 'milestone', description: 'Complete 10 sessions.' }`
  - Math: 10 / 3.5 = 2.9 days
- **`veteran`**: `{ id: 'veteran', name: 'Veteran', category: 'milestone', description: 'Complete 500 sessions.' }`
  - Math: 500 / 3.5 = 143 days (~4.7 months)
- **`centurion`**: Raise threshold from 50 → 100
- **`thousand-boulder`**: Raise threshold from 500 → 1000

### Agent Count Progression

| ID | Name | Threshold | Timeline | Justification |
|----|------|-----------|----------|---------------|
| `swarm-starter` | Swarm Starter | 50 | ~3-5 days | Early agent milestone; ~7 sessions |
| `hive-mind` | Hive Mind | 500 | ~3-4 weeks | Mid-tier; raised from 200 |
| `legion` | Legion | 2000 | ~3 months | P50 at 3-month projection (2280) |
| `army-of-thousands` | Army of Thousands | 5000 | ~7-8 months | Heavy investment milestone |
| `singularity` | Singularity | 10000 | ~14+ months | Legendary; just past year-1 projection |

New definitions needed:
- **`swarm-starter`**: `{ id: 'swarm-starter', name: 'Swarm Starter', category: 'milestone', description: 'Spawn 50 agents over your lifetime.' }`
- **`hive-mind`**: Raise threshold from 200 → 500
- **`legion`**: `{ id: 'legion', name: 'Legion', category: 'milestone', description: 'Spawn 2,000 agents over your lifetime.' }`
- **`army-of-thousands`**: `{ id: 'army-of-thousands', name: 'Army of Thousands', category: 'milestone', description: 'Spawn 5,000 agents over your lifetime.' }`
- **`singularity`**: `{ id: 'singularity', name: 'Singularity', category: 'milestone', description: 'Spawn 10,000 agents over your lifetime.' }`

### Active Time Progression

Based on ~50h/week projection, ~210h/month:

| ID | Name | Threshold | Timeline | Justification |
|----|------|-----------|----------|---------------|
| `first-shift` | First Shift | 10h | ~2 days | Quick; validates tracking works |
| `workaholic` | Workaholic | 100h | ~2 weeks | Silver; matches current dataset age |
| `time-lord` | Time Lord | 500h | ~2.5 months | Gold; serious commitment |
| `eternal-grind` | Eternal Grind | 2000h | ~10 months | Platinum; approaching a year |
| `epoch` | Epoch | 5000h | ~2+ years | Diamond; legendary |

All new:
- **`first-shift`**: `{ id: 'first-shift', name: 'First Shift', category: 'milestone', description: '10 hours of total agent active time.' }`
- **`workaholic`**: `{ id: 'workaholic', name: 'Workaholic', category: 'milestone', description: '100 hours of total agent active time.' }`
- **`time-lord`**: `{ id: 'time-lord', name: 'Time Lord', category: 'milestone', description: '500 hours of total agent active time.' }`
- **`eternal-grind`**: `{ id: 'eternal-grind', name: 'Eternal Grind', category: 'milestone', description: '2,000 hours of total agent active time.' }`
- **`epoch`**: `{ id: 'epoch', name: 'Epoch', category: 'milestone', description: '5,000 hours of total agent active time.' }`

### Repo Diversity Progression

| ID | Name | Threshold | Timeline | Justification |
|----|------|-----------|----------|---------------|
| `cartographer` | Cartographer | 5 | Variable; ~1-6 months | Lowered from 10; realistic for focused devs |
| `world-traveler` | World Traveler | 15 | Variable; ~6-12 months | Lowered from 25; still aspirational |
| `omnipresent` | Omnipresent | 30 | 1+ year; microservice users | Legendary; only polyglot/platform engineers |

Changes:
- **`cartographer`**: Lower from 10 → 5
- **`world-traveler`**: Lower from 25 → 15
- **`omnipresent`**: `{ id: 'omnipresent', name: 'Omnipresent', category: 'milestone', description: 'Work in 30 different repos.' }`

Note: Repo achievements are inherently variable — a monorepo user might never unlock even tier 1. Consider this a "play style" dimension, not a universal progression.

### Companion Age Progression

| ID | Name | Threshold | Timeline | Justification |
|----|------|-----------|----------|---------------|
| `old-growth` | Old Growth | 14 days | 2 weeks | Existing, keep |
| `seasoned` | Seasoned | 90 days | 3 months | Gold; calendar gate |
| `ancient` | Ancient | 365 days | 1 year | Existing, keep |

New:
- **`seasoned`**: `{ id: 'seasoned', name: 'Seasoned', category: 'milestone', description: 'Companion is 90 days old.' }`

### Level Milestones

Unknown leveling curve — depends on XP formula. Proposing structure assuming levels are meaningful:

| ID | Name | Threshold | Description |
|----|------|-----------|-------------|
| `apprentice` | Apprentice | Level 5 | Early progression reward |
| `journeyman` | Journeyman | Level 15 | Mid-tier |
| `master` | Master | Level 30 | Serious investment |
| `grandmaster` | Grandmaster | Level 50 | Legendary |

All new. Thresholds need calibration against actual XP curve — **flag for implementer: read the XP formula in `companion.ts` and validate these level gates against projected XP accumulation.**

---

## 4. Summary of Changes

### Threshold Changes (existing achievements)
| ID | Old | New | Reason |
|----|-----|-----|--------|
| `centurion` | 50 | 100 | Name says 100; 50 is too easy (~14d) |
| `thousand-boulder` | 500 | 1000 | Name says 1000; 500 is mid-tier |
| `cartographer` | 10 | 5 | 10 repos unrealistic for focused users |
| `world-traveler` | 25 | 15 | 25 unrealistic within a year |
| `hive-mind` | 200 | 500 | 200 agents = ~8 days, way too easy |

### New Achievements (14 total)
| ID | Category | Tier |
|----|----------|------|
| `regular` | milestone | Bronze (sessions) |
| `veteran` | milestone | Gold (sessions) |
| `swarm-starter` | milestone | Bronze (agents) |
| `legion` | milestone | Gold (agents) |
| `army-of-thousands` | milestone | Platinum (agents) |
| `singularity` | milestone | Diamond (agents) |
| `first-shift` | milestone | Bronze (time) |
| `workaholic` | milestone | Silver (time) |
| `time-lord` | milestone | Gold (time) |
| `eternal-grind` | milestone | Platinum (time) |
| `epoch` | milestone | Diamond (time) |
| `seasoned` | milestone | Gold (age) |
| `omnipresent` | milestone | Diamond (repos) |
| `apprentice`/`journeyman`/`master`/`grandmaster` | milestone | Level gates (4) |

### Files That Need Changes
- `src/shared/companion-types.ts` — Add new `AchievementId` union members, add `AchievementDef` entries to `ACHIEVEMENTS` array
- `src/daemon/companion.ts` — Add checker functions in `ACHIEVEMENT_CHECKERS`, update existing thresholds (lines ~250-257)
- `src/shared/companion-badges.ts` — Add `BADGE_ART` entries for all new achievements

### Total Achievement Count
- Current milestones: 8
- Proposed milestones: 22 (8 existing adjusted + 14 new)
- Other categories unchanged: session (9) + time (6) + behavioral (12) = 27
- **New total: 49 achievements** (up from 35)
