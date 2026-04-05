T3: Wisdom Delta Fix — Complete

Changes:
1. Exported `computeWisdomGain` function (src/daemon/companion.ts:640)
2. Applied delta pattern to wisdom crediting in `onSessionComplete()` (src/daemon/companion.ts:686-689): reads `session.companionCreditedWisdom ?? 0`, computes total via `computeWisdomGain(session)`, credits only `Math.max(0, totalWisdom - creditedWisdom)` — matching the existing strength delta pattern

Files changed:
- src/daemon/companion.ts

Build: clean
Tests: 346/346 pass
No issues.