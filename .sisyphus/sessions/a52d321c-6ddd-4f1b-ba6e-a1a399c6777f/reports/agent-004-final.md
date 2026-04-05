Fixed splitBodyAndBoulder rendering corruption bug.

## Changes

### src/shared/companion-render.ts
- getBaseForm: replaced all embedded literal boulders (., o, O, OO, @) with a {BOULDER} placeholder. This is the root fix — the old design made composeLine's job dependent on fragile string splitting that silently discarded OO at level 12-19.
- splitBodyAndBoulder: removed entirely (was the broken mechanism).
- composeLine: now uses body.replace('{BOULDER}', b) — clean, explicit, can't corrupt.

### src/__tests__/companion-render.test.ts
- getBaseForm tests: updated to assert {BOULDER} placeholder is present and no literal boulder chars embedded. Added exact equality assertions for each tier.
- composeLine tests: updated all body strings to use {BOULDER} placeholder. Added two new cases: multi-char @ boulder and boulder with nickname.
- renderCompanion: added 6 cross-level/boulder regression tests covering level 15+0 agents, level 15+1 agent, level 15+6 agents with wisps cosmetic, level 20+0 agents, level 20+10 agents, level 5+0 agents.

## Test results
58 pass, 8 fail — all 8 failures are pre-existing from another agent changing getStatCosmetics (wisdom/endurance/luck/patience thresholds lowered) and getBoulderForm (new ◉ tier, different thresholds for o/O). None of these are related to my changes. Flagging as out-of-scope.

## Out-of-scope issues to report
- getStatCosmetics thresholds were lowered by another agent (wisdom 15→5, endurance 180M→36M, luck 0.7→0.6, patience 180M→36M) — breaks 3 existing tests
- getBoulderForm tiers were restructured (added ◉ tier, agentCount=0 now gives '.', agentCount 1→'o', 2-4→'O', 5-9→'◉', 10-20→'@', 21+→'@@') — breaks 5 existing getBoulderForm tests