# Cycle 6 — Bug Fixes

User asked to fix the 3 remaining gaps surfaced during validation review. Verified current code state:

- **patience stat**: Already fixed during implementation (lines 471-477 of companion.ts accumulate patience from cycleCount + lifecycle mode bonuses). Review report was from before that fix landed.
- **wanderer**: Still uses lossy `lastSeen` — `dailyRepos` exists but is ignored by checker.
- **dawn-patrol**: Logic checks 6am boundary, not midnight. Description says "spanning midnight to 6am."
- **getBaseForm dead code**: Level 20+ returns identical string to 12-19. Added ♛ crown prefix for final tier.

Spawned 3 parallel agents:
- agent-005 (fix-wanderer): Rewrite wanderer checker to use `dailyRepos`, update test
- agent-006 (fix-dawn-patrol): Fix midnight-spanning logic, add test for 11pm→1am case
- agent-007 (fix-baseform): Add ♛ crown to level 20+ form, add test
