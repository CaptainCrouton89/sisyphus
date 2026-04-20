## Template Placeholders

- `{{SESSION_ID}}`, `{{INSTRUCTION}}`, `{{CONTEXT_DIR}}` — spawn time. `{{CONTEXT_DIR}}` → `@`-ref agent reads at startup.
- `{{ORCHESTRATOR_MODES}}`, `{{AGENT_TYPES}}` — render time, only valid in `orchestrator-base.md`; using in `agent-plugin/*.md` or `orchestrator-plugin/*.md` silently produces unreplaced literals.

## `sisyphus report` vs `sisyphus submit`

Agent-template commands (orchestrators use `yield`/`complete`): `report` is non-terminal; `submit` is terminal — pane closes immediately. Using `submit` mid-task loses context; `report` for final completion leaves an idle pane consuming a slot.
