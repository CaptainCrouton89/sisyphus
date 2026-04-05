# Fix Plan — Validation Review Findings

All fixes are mechanical, 1-line or string-only changes. No design decisions needed.

## Fix 1: sessionsCompletedToday uses lifetime total

**File:** `src/daemon/pane-monitor.ts:241`
**Current:** `sessionsCompletedToday: companion.sessionsCompleted,`
**Fix:** `sessionsCompletedToday: companion.recentCompletions.filter(t => t.startsWith(new Date().toISOString().slice(0, 10))).length,`

Also increase recentCompletions retention from 3 to 10 so daily counts are accurate:

**File:** `src/daemon/companion.ts:497`
**Current:** `if (companion.recentCompletions.length > 3) {`
**Fix:** `if (companion.recentCompletions.length > 10) {`

**File:** `src/daemon/companion.ts:498`
**Current:** `companion.recentCompletions = companion.recentCompletions.slice(-3);`
**Fix:** `companion.recentCompletions = companion.recentCompletions.slice(-10);`

## Fix 2: Luck formula semantically broken

**File:** `src/daemon/companion.ts:491-493`
**Current:**
```typescript
// Luck: ratio of clean sessions (no crashes) to total completed
const total = companion.sessionsCompleted + companion.sessionsCrashed;
companion.stats.luck = total > 0 ? companion.sessionsCompleted / total : 0;
```
**Fix:**
```typescript
// Luck: ratio of clean sessions (no crashes) to total completed
companion.stats.luck = companion.sessionsCompleted > 0
  ? (companion.sessionsCompleted - companion.sessionsCrashed) / companion.sessionsCompleted
  : 0;
```

## Fix 3: Luck XP coefficient too high — instant L3 on first session

**File:** `src/daemon/companion.ts:92`
**Current:** `const luckXP = (stats.luck * 100) * 3;`
**Fix:** `const luckXP = (stats.luck * 100) * 2;`

**Rationale:** With coefficient 3, first session gives 385 XP → L3 immediately (L2=150, L3=352). With coefficient 2, first session gives 285 XP → L2 only. L3 at session 2, L4 at session 5. Matches the spec's intent of "L5 in first week."

## Fix 4: 10 achievement description/checker mismatches

**File:** `src/shared/companion-types.ts`

Update these descriptions to match the recalibrated checker thresholds:

| Line | Achievement ID | Current description | New description |
|------|---------------|-------------------|-----------------|
| 165 | centurion | "Complete 100 sessions." | "Complete 50 sessions." |
| 166 | thousand-boulder | "Complete 1000 sessions." | "Complete 500 sessions." |
| 169 | hive-mind | "Spawn 500 agents over a lifetime." | "Spawn 200 agents over a lifetime." |
| 170 | old-growth | "Companion is 30 days old." | "Companion is 14 days old." |
| 173 | marathon | "Complete a session with 10+ agents." | "Complete a session with 15+ agents." |
| 181 | quick-draw | "First agent spawned within 30s of session start." | "First agent spawned within 20s of session start." |
| 187 | all-nighter | "Single session running 8+ hours." | "Single session running 6+ hours." |
| 192 | creature-of-habit | "Visit the same repo 20 times." | "Visit the same repo 10 times." |
| 193 | loyal | "Visit the same repo 50 times." | "Visit the same repo 30 times." |
| 196 | hot-streak | "7 consecutive clean sessions." | "5 consecutive clean sessions." |

## Fix 5: Remove needless recomputeXpLevelTitle calls

**File:** `src/daemon/companion.ts:521`
**Remove:** `recomputeXpLevelTitle(companion);` from `onAgentSpawned()`

**File:** `src/daemon/companion.ts:527`
**Remove:** `recomputeXpLevelTitle(companion);` from `onAgentCrashed()`

Neither function changes XP-affecting stats, so the call is wasted.

## Fix 6: Update stale XP formula in daemon/CLAUDE.md

**File:** `src/daemon/CLAUDE.md`
**Current (in companion.ts bullet):** "strength×100 + endurance/3.6M×10 + wisdom×50 + luck×200 + patience/3.6M×5"
**Fix:** "strength×80 + endurance/3.6M×15 + wisdom×40 + luck×200 + patience/3.6M×8"

Note: luck×200 (not ×300) because we're reverting the coefficient from 3 to 2.

## Verification

After all fixes, run `npm test` and `npm run build` to confirm no regressions.
