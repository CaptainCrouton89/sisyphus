# templates/

System prompt templates for orchestrator and agent initialization.

## Core Templates

- **orchestrator.md** — Orchestrator system prompt. Role definition, CLI reference, multi-cycle strategy. Rendered with `<state>` block injected containing agent reports, cycle history, plan/logs references.
- **agent-suffix.md** — Agent system prompt suffix. Contains `{{SESSION_ID}}` and `{{INSTRUCTION}}` placeholders. Rendered once per agent spawn.
- **banner.txt** — ASCII banner (cosmetic, displayed on daemon startup or CLI output).

## Configuration Files

- **orchestrator-settings.json** — Default orchestrator configuration (model, behavior flags, rendering options). Overridden by project `.sisyphus/orchestrator-settings.json`.
- **agent-settings.json** — Default agent configuration (model, behavior flags, plugin overrides). Overridden by project `.sisyphus/agent-settings.json`.

## Subdirectories

- **agent-plugin/** — Agent system prompts for crouton-kit plugin agent types (e.g., `debug`, `implement`, `plan`). Each file named `{agent-type}.md` provides specialized role & strategy.
- **orchestrator-plugin/** — Orchestrator overrides for crouton-kit plugin workflows.

## Rendering Rules

**Orchestrator prompt**:
1. Read `orchestrator.md` (or project override `.sisyphus/orchestrator.md`)
2. Load settings from `orchestrator-settings.json` (or project override)
3. Append `<state>` block with: agent reports, cycle count, history, plan.md and logs.md references
4. Pass to Claude via `--append-system-prompt` flag
5. User prompt: concise cycle instruction ("review reports, delegate next phase")

**Agent prompt**:
1. Read `agent-suffix.md`
2. Load settings from `agent-settings.json` (or project override)
3. Replace `{{SESSION_ID}}` with session UUID
4. Replace `{{INSTRUCTION}}` with task instruction (e.g., "implement login feature")
5. Pass via `--append-system-prompt` flag
6. User prompt: instruction again (for clarity)

**Plugin prompts** (`agent-plugin/*.md`):
- Used only when agent spawned with `--agent-type sisyphus:{type}`
- Replaces default agent-suffix.md rendering
- Same placeholder substitution rules apply

## Important Boundaries

- Do **not** hardcode session IDs or agent names—use placeholders
- Do **not** include raw JSON in prompts—use human-readable `<state>` formatting
- Do **not** reference external files (only relative paths in `.sisyphus/`)
- Do **keep prompts concise**—Claude reads full state separately
- Settings files must be valid JSON; use project overrides to customize behavior per-workspace
