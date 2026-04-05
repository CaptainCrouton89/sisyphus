All threshold calibrations complete. 174/174 tests pass.

Changes made:
- src/shared/companion-types.ts: Added activeAgentCount?: number to MoodSignals; updated blitz/speed-run/momentum achievement descriptions
- src/daemon/companion.ts: computeMood — reduced grinding base (10→5), shifted grinding thresholds to 60/120min, reworked happy (streak×8, morning/afternoon split), zen (cleanStreak>2, patience>50h, short-session no-crash bonus), excited (activeAgentCount>=4, session<10min), existential (endurance>100h), sleepy (late-night+idle bonus), frustrated (30/45 per crash/justCrashed); achievement checkers: blitz <300k, speed-run <600k, momentum 4h window
- src/daemon/pane-monitor.ts: count running agents across tracked sessions and populate activeAgentCount in MoodSignals
- src/shared/companion-render.ts: wisdom>15, endurance>180M (50h), luck>0.7, patience>180M (50h)
- src/__tests__/companion.test.ts: updated momentum test descriptions and boundary values
- src/__tests__/companion-render.test.ts: updated all cosmetic boundary tests to new thresholds