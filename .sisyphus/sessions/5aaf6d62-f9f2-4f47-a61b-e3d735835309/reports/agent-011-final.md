All 6 findings addressed. Build clean, 238/238 tests pass.

## Findings addressed

### 1. Move ACHIEVEMENTS to shared (Finding #1)
- Moved ACHIEVEMENTS const from src/daemon/companion.ts to src/shared/companion-types.ts (alongside AchievementDef which was already there)
- companion.ts now re-exports: export { ACHIEVEMENTS } from '../shared/companion-types.js'
- Removed unused AchievementDef import from companion.ts imports (was already imported via type, now exported from shared directly)

### 2. Extract fireCommentary helper (Finding #3)
- Added fireCommentary() in session-manager.ts (after imports, before NAME_PATTERN)
- Also added import for CommentaryEvent and CompanionState types
- Replaced all 5 instances: session-start (no flash), session-complete/level-up/achievement (flash=true), agent-crash (no flash)

### 3. Fix idle duration calculation (Finding #4)
- Added module-level idleStartTime = 0 in pane-monitor.ts
- When activeTimers is empty: set idleStartTime on first idle poll, compute idleDurationMs = nowMs - idleStartTime
- When activeTimers non-empty: clear idleStartTime = 0
- Uses nowMs captured at top of the mood block (not lastPollTime which was just set)

### 4. Remove recentRestarts (Finding #5)
- Removed recentRestarts field from MoodSignals interface in companion-types.ts
- Removed scores.frustrated += signals.recentRestarts * 15 from computeMood in companion.ts
- Removed let recentRestarts = 0 and recentRestarts from signals object in pane-monitor.ts
- Removed recentRestarts: 0 from makeSignals() in companion.test.ts

### 5. Guard idle mood recomputation (Finding #6)
- Added lastMoodCompute = 0 module-level in pane-monitor.ts
- When trackedSessions.size === 0 and lastMoodCompute within 60s: early return from pollAllSessions
- Set lastMoodCompute = nowMs after each compute cycle

### 6. Avoid redundant loadCompanion in status-bar (Finding #8)
- Added getCachedCompanion() with 10s TTL cache (cachedCompanion + companionCacheTime module vars)
- writeStatusBar() now calls getCachedCompanion() instead of loadCompanion()

## Decisions
- Task 5 guard: used early return from pollAllSessions (the mood block is the last thing in the function), rather than wrapping in a conditional. Cleaner.
- Task 3: idleStartTime tracks when activeTimers first became empty, not when trackedSessions became empty — per the task's recommendation ('more precisely, when activeTimers becomes empty').
- No unused import cleanup (globalDir in companion.ts was pre-existing, out of scope).