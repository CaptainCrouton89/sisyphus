# Per-Session Achievement Audit

## Historical Data Summary (32 sessions, 232 agents)

| Metric | P10 | P25 | P50 | P75 | P90 | Max |
|--------|-----|-----|-----|-----|-----|-----|
| Duration (min) | 3.8 | 61.9 | 140.1 | 294.6 | 334.1 | 434.8 |
| Agents/session | 0 | 2 | 9 | 20 | 30 | 59 |
| Cycles/session | 1 | 2 | 5 | 10 | 22 | 43 |
| Agent time (min) | 0.9 | 1.4 | 2.8 | 6.6 | 11.9 | 116.7 |

---

## 1. Existing Achievement Evaluation

### `marathon` — 15+ agents → ~P65
**Verdict: KEEP, threshold is good.** Falls between median (9) and P75 (20). Triggers on roughly 1 in 3 sessions. Good "you're doing a real session" achievement. Not too easy, not aspirational.

### `blitz` — session < 5 min → ~P10
**Verdict: KEEP.** Only ~10% of sessions qualify. Feels genuinely fast. Good rare achievement.

### `speed-run` — session < 8 min → ~P15
**Verdict: QUESTIONABLE.** Too close to `blitz` — only 3 minutes apart. Either widen the gap (make it < 15 min, ~P20) or remove it. Having both feels redundant since any blitz is also a speed-run.

**Recommendation:** Change to < 15 min or remove. If kept at < 8 min, at least make blitz a "hidden" upgrade of speed-run.

### `flawless` — zero crashes in completed session → ~P100 (trivially easy)
**Verdict: REPLACE.** With 0% crash rate across 32 sessions, this fires on literally every completed session. Not an achievement — it's a participation trophy.

**Recommendation:** Replace with a meaningful quality metric. Options:
- **`flawless`**: "Complete a session with 10+ agents and zero agent restarts" (adds scale requirement)
- **`surgical`**: "All agents complete in under 5 minutes each" (efficiency)
- **`no-rework`**: "Complete in exactly 1 orchestrator cycle" (~P25, genuinely hard with scale)

### `iron-will` — 10 consecutive clean sessions → trivially easy
**Verdict: REPLACE.** With 0% crash rate, this triggers on session #10 guaranteed. Meaningless.

**Recommendation:** Replace with something that actually tracks sustained excellence:
- **`iron-will`**: "10 consecutive sessions each completing in under 3 cycles" (efficiency streak)
- Or raise to 50 consecutive clean sessions so it at least takes time

### `glass-cannon` — 5+ agents all crashed but session completed → impossible
**Verdict: KEEP AS ASPIRATIONAL.** This is a legitimate edge case that *could* happen. It's fine to have achievements that are rare/impossible currently — they become stories when they finally trigger. Leave it.

### `solo` — exactly 1 agent, session completed → ~P10-P25
**Verdict: KEEP.** P25 is 2 agents, so solo sessions exist but are uncommon. Good niche achievement for quick single-task sessions.

### `one-more-cycle` — 10+ cycles → ~P75
**Verdict: KEEP.** Triggers on ~25% of sessions. Good mid-tier achievement. Could add higher tiers (see proposals).

### `quick-draw` — first agent < 20s → depends on orchestrator speed
**Verdict: KEEP.** Can't evaluate from data (need agent spawn timestamps). Conceptually good — rewards fast orchestrator setup.

---

## 2. Proposed New Achievements

### Agent Swarm Scale

| ID | Name | Threshold | Percentile | Frequency | First Trigger |
|----|------|-----------|------------|-----------|---------------|
| `squad` | Squad Up | 10+ agents | ~P55 | ~45% of sessions | Sessions 1-3 |
| `battalion` | Battalion | 25+ agents | ~P80 | ~20% of sessions | Sessions 3-8 |
| `legion` | Legion | 40+ agents | ~P95 | ~5% of sessions | Sessions 15-25 |
| `swarm` | The Swarm | 50+ agents | ~P98 | ~2% of sessions | Sessions 30-50 |

**Note:** `marathon` at 15 already covers ~P65. `squad` at 10 is the "easy entry" tier. These form a clean progression: 10 → 15 (marathon) → 25 → 40 → 50.

```
squad: { id: 'squad', name: 'Squad Up', category: 'session', description: 'Complete a session with 10+ agents.' }
battalion: { id: 'battalion', name: 'Battalion', category: 'session', description: 'Complete a session with 25+ agents.' }
legion: { id: 'legion', name: 'Legion', category: 'session', description: 'Complete a session with 40+ agents.' }
swarm: { id: 'swarm', name: 'The Swarm', category: 'session', description: 'Complete a session with 50+ agents.' }
```

### Cycle Depth

| ID | Name | Threshold | Percentile | Frequency |
|----|------|-----------|------------|-----------|
| `deep-dive` | Deep Dive | 15+ cycles | ~P80 | ~20% |
| `abyss` | Into the Abyss | 25+ cycles | ~P92 | ~8% |
| `eternal-recurrence` | Eternal Recurrence | 40+ cycles | ~P99 | ~1% |

```
deep-dive: { id: 'deep-dive', name: 'Deep Dive', category: 'session', description: 'A session with 15+ orchestrator cycles.' }
abyss: { id: 'abyss', name: 'Into the Abyss', category: 'session', description: 'A session with 25+ orchestrator cycles.' }
eternal-recurrence: { id: 'eternal-recurrence', name: 'Eternal Recurrence', category: 'session', description: 'A session with 40+ orchestrator cycles.' }
```

### Session Duration

| ID | Name | Threshold | Percentile | Notes |
|----|------|-----------|------------|-------|
| `endurance` | Endurance | 4+ hours | ~P80 | Long session |
| `ultramarathon` | Ultramarathon | 6+ hours | ~P95 | Very long |
| `flash` | Flash | < 2 min | Below P10 | Extremely fast completion |

```
endurance: { id: 'endurance', name: 'Endurance', category: 'session', description: 'A single session running 4+ hours.' }
ultramarathon: { id: 'ultramarathon', name: 'Ultramarathon', category: 'session', description: 'A single session running 6+ hours.' }
flash: { id: 'flash', name: 'Flash', category: 'session', description: 'Complete a session in under 2 minutes.' }
```

### Efficiency

| ID | Name | Description | Justification |
|----|------|-------------|---------------|
| `one-shot` | One Shot | Complete with 5+ agents in exactly 1 cycle | Hard — most multi-agent sessions need multiple cycles. ~P25 for cycles but with agent count filter, very rare |
| `precision` | Precision Strike | Spawn 10+ agents with agent-to-cycle ratio ≥ 5:1 | Rewards spawning many agents efficiently rather than cycling repeatedly |
| `speedster` | Speedster | All agents in a 10+ agent session complete in under 3 min each | Median agent time is 2.8 min, so with 10+ agents this is genuinely hard |

```
one-shot: { id: 'one-shot', name: 'One Shot', category: 'session', description: 'Complete a session with 5+ agents in exactly 1 orchestrator cycle.' }
precision: { id: 'precision', name: 'Precision Strike', category: 'session', description: '10+ agents spawned with agent-to-cycle ratio of 5:1 or better.' }
speedster: { id: 'speedster', name: 'Speedster', category: 'session', description: 'Every agent in a 10+ agent session completes in under 3 minutes.' }
```

---

## 3. Problematic Achievement Fixes

### `flawless` → Redefine
**New definition:** "Complete a session with 10+ agents and zero crashes, kills, or restarts."
**Why:** Adding the 10+ agent minimum means it requires both scale AND stability. ~35% of sessions have 10+ agents, so this becomes a real filter.

### `iron-will` → Redefine  
**New definition:** "10 consecutive sessions completing in 3 or fewer orchestrator cycles."
**Why:** P50 for cycles is 5, so completing in ≤3 cycles is below median efficiency. Maintaining that for 10 straight sessions is genuinely hard.

### `glass-cannon` → Keep as-is
It's aspirational. When crashes eventually happen (and they will as usage scales), this becomes a badge of honor. Aspirational achievements are good game design.

### `speed-run` → Widen gap from blitz
**New definition:** "Complete a session in under 15 minutes."
**Why:** Creates clear tiers: flash (<2m) → blitz (<5m) → speed-run (<15m). Each is roughly 2-3x the previous.

---

## 4. Summary of All Proposed Changes

### Modify Existing
| ID | Current | Proposed |
|----|---------|----------|
| `flawless` | Zero crashes | 10+ agents, zero crashes/kills/restarts |
| `iron-will` | 10 consecutive clean | 10 consecutive sessions with ≤3 cycles each |
| `speed-run` | < 8 min | < 15 min |

### New Achievements (10 total)
| ID | Category | Percentile | Expected First Trigger |
|----|----------|------------|----------------------|
| `squad` | session | ~P55 | Sessions 1-3 |
| `battalion` | session | ~P80 | Sessions 3-8 |
| `legion` | session | ~P95 | Sessions 15-25 |
| `swarm` | session | ~P98 | Sessions 30-50 |
| `deep-dive` | session | ~P80 | Sessions 3-8 |
| `abyss` | session | ~P92 | Sessions 8-15 |
| `eternal-recurrence` | session | ~P99 | Sessions 30-50 |
| `endurance` | session | ~P80 | Sessions 3-8 |
| `ultramarathon` | session | ~P95 | Sessions 15-25 |
| `one-shot` | session | Rare | Sessions 10-20 |

### Keep Unchanged
`marathon`, `blitz`, `solo`, `one-more-cycle`, `quick-draw`, `glass-cannon`

### Achievement Difficulty Curve
```
Easy    (~50%):  squad (10 agents)
Medium  (~25%):  marathon (15), one-more-cycle (10 cycles), speed-run (15 min)
Hard    (~10%):  battalion (25), deep-dive (15 cycles), blitz (5 min), flawless (10+ clean)
Epic    (~5%):   legion (40), abyss (25 cycles), ultramarathon (6h)
Legendary (~1%): swarm (50), eternal-recurrence (40 cycles), one-shot, glass-cannon
```

### Files to modify
- `src/shared/companion-types.ts` — Add new `AchievementId` union members, new `AchievementDef` entries
- `src/shared/companion-badges.ts` — Add `BADGE_ART` entries for new achievements
- `src/daemon/companion.ts` — Add check logic for new achievements, modify `flawless`/`iron-will`/`speed-run` checks
- `src/__tests__/companion.test.ts` — Update tests
