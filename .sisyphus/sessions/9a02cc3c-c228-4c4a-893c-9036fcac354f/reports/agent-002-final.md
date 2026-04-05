Applied recalibration spec to companion-render.ts and companion-types.ts.

companion-render.ts:
- getBoulderForm: expanded from 4 tiers to 6 tiers (.=0, o=1, O=2-4, ◉=5-9, @=10-20, @@=21+)
- getStatCosmetics: lowered all cosmetic thresholds (wisdom 15→5, endurance/patience 180M→36M ms, luck 0.7→0.6)

companion-types.ts:
- MoodSignals: added cycleCount?: number and sessionsCompletedToday?: number

No other types or interfaces modified. TypeScript check passes clean.