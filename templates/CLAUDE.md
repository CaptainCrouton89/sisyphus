# templates/

## Phase Transitions

- Use `sisyphus yield --mode <phase>` to transition: `planning` → `implementation` → `validation` → `completion`
- `--prompt "..."` becomes the orchestrator's opening message for the next cycle

## orchestrator-completion.md Constraints

- **NEVER yield while waiting for user input** — yield kills the process and respawns a fresh instance with no memory of the conversation. Ask, then stop and wait.
- **NEVER call `sisyphus complete` until the user explicitly confirms** — "looks good", "ship it", "approved", or equivalent.

## Requirements Doc Maintenance

- When reviews or feedback resolve questions, update requirements/design docs directly — delete resolved questions and update topical sections where answers belong
- Never create correction files, addendum files, or decision logs alongside authoritative docs

## Agent Prompt Rendering

- `agent-suffix.md` uses `{{SESSION_ID}}` / `{{INSTRUCTION}}` placeholders — substituted at spawn time, passed via `--append-system-prompt`
- Plugin prompts (`agent-plugin/*.md`, `orchestrator-plugin/*.md`) follow the same substitution rules
