# templates/

System prompt templates for orchestrator and agent initialization.

## Core Templates

- **orchestrator-base.md** — Core orchestrator system prompt. Defines orchestrator role (coordinator, not implementer), cycle workflow, context persistence via roadmap.md/logs.md, and validation patterns. Rendered as foundation for all orchestrator prompts.
- **orchestrator-planning.md** — Planning-phase orchestrator guidance. Emphasis on exploration, requirements/design/plan phases, verification recipe, and scaled rigor. Appended when `--mode planning` (default).
- **orchestrator-impl.md** — Implementation-phase orchestrator guidance. Context propagation from planning, code smell escalation, and verification patterns. Appended when `--mode implementation`.
- **agent-suffix.md** — Agent system prompt suffix. Contains `{{SESSION_ID}}` and `{{INSTRUCTION}}` placeholders. Rendered once per agent spawn.
- **dashboard-claude.md** — Dashboard companion prompt. Guides a Claude instance embedded in the TUI to help users manage sessions. Contains `{{CWD}}` and `{{SESSIONS_CONTEXT}}` placeholders.
- **banner.txt** — ASCII banner (cosmetic).

## Configuration Files

- **orchestrator-settings.json** — Default orchestrator configuration (model, behavior flags, rendering options). Overridden by project `.sisyphus/orchestrator-settings.json`.
- **agent-settings.json** — Default agent configuration (model, behavior flags, plugin overrides). Overridden by project `.sisyphus/agent-settings.json`.

## Subdirectories

- **agent-plugin/** — Agent system prompts for crouton-kit plugin agent types (e.g., `debug`, `implement`, `plan`). Each file named `{agent-type}.md` provides specialized role & strategy.
- **orchestrator-plugin/** — Orchestrator overrides for crouton-kit plugin workflows.

## Rendering Rules

**Orchestrator prompt**:
1. Load orchestrator-base.md
2. Append phase-specific guidance: orchestrator-planning.md (default) or orchestrator-impl.md (when `--mode implementation`)
3. Inject session state with agent reports, cycle count, roadmap.md/logs.md references
4. Load settings from `orchestrator-settings.json` (or project override)
5. Pass via `--append-system-prompt` flag

**Agent prompt**:
1. Read `agent-suffix.md`
2. Replace `{{SESSION_ID}}` with session UUID
3. Replace `{{INSTRUCTION}}` with task instruction
4. Load settings from `agent-settings.json` (or project override)
5. Pass via `--append-system-prompt` flag

**Plugin prompts** (`agent-plugin/*.md`):
- Used only when agent spawned with `--agent-type sisyphus:{type}`
- Replaces default agent-suffix.md rendering
- Same placeholder substitution rules apply

## Key Patterns

- **Phase modes**: `--mode planning` (default) uses orchestrator-base.md + orchestrator-planning.md; `--mode implementation` uses orchestrator-base.md + orchestrator-impl.md
- **Context files**: agents save findings to `.sisyphus/sessions/$SISYPHUS_SESSION_ID/context/` and pass references to downstream agents
- **Placeholders**: always use `{{SESSION_ID}}`, `{{INSTRUCTION}}`—never hardcode values
- Settings files are valid JSON; use project overrides to customize per-workspace
