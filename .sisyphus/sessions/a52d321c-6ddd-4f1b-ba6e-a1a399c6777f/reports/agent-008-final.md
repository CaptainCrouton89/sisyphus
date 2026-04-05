Completed both tasks successfully.

## 1. Removed luck stat

Deleted luck from all locations:
- src/shared/companion-types.ts:74 — removed luck: number from CompanionStats interface
- src/daemon/companion.ts:60 — removed luck: 0 from createDefaultCompanion()
- src/daemon/companion.ts:92-94 — removed luckXP line and updated return sum in computeXP()
- src/daemon/companion.ts:492-495 — removed luck accumulation block from onSessionComplete()
- src/shared/companion-render.ts:50 — removed sparkle cosmetic (luck > 0.6 check) from getStatCosmetics()
- src/shared/companion-render.ts:151-152 — removed luckPct variable and LCK from statSummary()
- src/daemon/companion-commentary.ts:44 — removed lucky names nickname rule
- src/daemon/companion-commentary.ts:60,65,89 — removed Luck from both prompt templates, updated personality line
- src/tui/panels/overlays.ts:211-212 — removed patH/luckPct vars
- src/tui/panels/overlays.ts:257 — removed LCK contentLine
- src/cli/commands/companion.ts:42,47-48 — removed patH, luck display line, updated patience display
- src/__tests__/companion.test.ts — updated all-zero stats fixture, removed luck from all computeXP test cases
- src/__tests__/companion-render.test.ts — removed sparkle/luck cosmetic tests, removed luck from stats fixtures

## 2. Fixed patience accumulation

- src/shared/companion-types.ts:75 — updated patience comment to 'persistence score (cycles + lifecycle bonuses)'
- src/daemon/companion.ts:474-480 — added patience accumulation block after strength++ (cycleCount + validation/completion lifecycle bonuses)
- src/daemon/companion.ts:188 — removed patienceHours conversion, changed zen threshold to patience > 30
- src/daemon/companion.ts:93 — updated patienceXP formula to stats.patience * 5
- src/shared/companion-render.ts:51 — updated zen-prefix threshold to patience > 50
- src/shared/companion-render.ts:152 — updated PAT display to plain count (no /3_600_000 conversion)
- src/tui/panels/overlays.ts:258 — updated PAT stat row to use companion.stats.patience directly, max 200
- src/daemon/companion-commentary.ts:60 — updated 'Low patience + frustrated: blunt' to 'Low patience: impatient and blunt'

## Verification

npm run build — clean build, 0 errors
npm test — 236 tests pass, 0 failures