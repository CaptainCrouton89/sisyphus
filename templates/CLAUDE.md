- `{{ORCHESTRATOR_MODES}}`, `{{AGENT_TYPES}}` — render time, only valid in `orchestrator-base.md`; using in `agent-plugin/*.md` or `orchestrator-plugin/*.md` silently produces unreplaced literals.
- `{{CONTEXT_DIR}}` resolves to an `@`-ref the agent reads at startup (spawn time, not render time).

`sisyphus report` vs `sisyphus submit`: `report` is non-terminal (agent continues); `submit` is terminal (pane closes immediately). Orchestrators use `sisyphus yield`. Using `submit` mid-task silently loses all subsequent context; using `report` for final submission leaves an idle pane consuming a slot.

Sub-agents (`agent-plugin/{type}/agents/`) are invisible to the orchestrator — only the parent agent can spawn them.
