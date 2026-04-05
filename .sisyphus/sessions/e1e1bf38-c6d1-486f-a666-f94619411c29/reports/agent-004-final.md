Design for `sisyphus clone "goal"` completed and saved.

## Artifacts
- `context/design.json` — structured design (14 items, 7 sections), reviewed via TUI (2 drafts)
- `context/design-clone.md` — human-readable final design

## Key Design Decisions
1. **Orchestrator-only**: CLI enforces `SISYPHUS_AGENT_ID === 'orchestrator'`. Daemon API stays open for future reuse. User feedback drove this — simplifies the running-agents edge case.
2. **True duplication**: cpSync context/, prompts/, reports/, snapshots/ with recursive session ID replacement (null-byte text detection). Fresh goal.md, roadmap.md, logs/.
3. **Agent normalization**: Defensive 3-line safety net marks inherited `running` agents as `killed` — prevents `allAgentsDone()` from blocking the clone's daemon.
4. **forceMode on spawnOrchestrator**: 2-line change adds optional mode override. Clone forces `strategy` regardless of source's last mode.
5. **Orientation via message parameter**: Clone context delivered through existing spawnOrchestrator message mechanism — no new prompt injection path needed.

## Scope
8 files (1 new, 7 modified), ~275 lines total. All 20 requirements from requirements-clone.md are covered.

## Nothing to report
No code smells, blockers, or out-of-scope issues encountered during investigation.