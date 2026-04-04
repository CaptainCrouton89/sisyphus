# templates/

System prompt templates for orchestrator and agent initialization.

## Core Templates

- **orchestrator-base.md** — Core orchestrator system prompt. Defines orchestrator role (coordinator, not implementer), cycle workflow, context persistence via roadmap.md/logs.md, and validation patterns. Rendered as foundation for all orchestrator prompts.
- **orchestrator-planning.md** — Planning-phase orchestrator guidance. Appended when `--mode planning` (default).
  - **Ordering constraint:** context docs → requirements → design → roadmap refinement → detailed plan.
  - **Roadmap refinement happens after requirements + design are aligned** — that's the first point of honest scope. Roadmap has four canonical sections: current stage, exit criteria, active context references, next steps. Decisions fold into context docs, not the roadmap.
  - **Requirements doc maintenance:** When reviews or user feedback resolve questions or change understanding, update requirements/design docs directly — delete resolved questions from listing sections and update the topical sections where those answers belong. Never create correction files, addendum files, or decision logs alongside authoritative docs.
  - **One plan lead per feature** — delegate outcomes, not implementation structure. Pre-splitting by domain (backend/frontend) skips synthesis where cross-domain conflicts are caught. Multiple plan leads only for features with no shared files or integration points.
  - **Skip requirements** for pure bug fixes with clear repro, mechanical refactors (no behavioral change), or tasks with explicit detailed acceptance criteria already given. Otherwise spawn one.
  - **Progressive sizing:** small (1–3 files, single domain) → skip phases, short checklist roadmap. Large (3+ stages, multiple domains) → full phased development with stage artifacts saved as `context/plan-stage-N-*.md`; detail-plan one stage at a time because stage N informs stage N+1.
  - Requires `context/e2e-recipe.md` written before transitioning — executable steps + success criteria, not aspirational. Both `--mode implementation` and `--mode validation` reference it. If no concrete verification method exists, ask the user before proceeding.
- **orchestrator-strategy.md** — Strategy-phase orchestrator guidance. Maps out visible stages, acknowledges constraints ahead, and establishes lifecycle ownership.
- **orchestrator-impl.md** — Implementation-phase orchestrator guidance. Context propagation from planning, code smell escalation, and verification patterns. Appended when `--mode implementation`.
- **orchestrator-validation.md** — Validation-phase orchestrator guidance. Emphasis on proving features work end-to-end via e2e recipes and operator agents for UI features.
- **orchestrator-completion.md** — Completion-phase orchestrator guidance. Appended when `--mode completion`.
- **agent-suffix.md** — Agent system prompt suffix. Contains `{{SESSION_ID}}` and `{{INSTRUCTION}}` placeholders. Rendered once per agent spawn.
- **dashboard-claude.md** — Dashboard companion prompt. Guides a Claude instance embedded in the TUI to help users manage sessions. Contains `{{CWD}}` and `{{SESSIONS_CONTEXT}}` placeholders.

## Configuration Files

- **orchestrator-settings.json** — Default orchestrator configuration (model, behavior flags, rendering options). Overridden by project `.sisyphus/orchestrator-settings.json`.

## Subdirectories

- **agent-plugin/** — Agent system prompts for crouton-kit plugin agent types (e.g., `debug`, `implement`, `plan`). Each file named `{agent-type}.md` provides specialized role & strategy.
- **orchestrator-plugin/** — Orchestrator overrides for crouton-kit plugin workflows.
- **companion-plugin/** — Companion templates for specialized orchestration workflows.

## Rendering Rules

**Orchestrator prompt**:
1. Load orchestrator-base.md
2. Append phase-specific guidance based on mode:
   - `--mode planning` (default): orchestrator-planning.md
   - `--mode strategy`: orchestrator-strategy.md
   - `--mode implementation`: orchestrator-impl.md
   - `--mode validation`: orchestrator-validation.md
   - `--mode completion`: orchestrator-completion.md
3. Inject session state with agent reports, cycle count, roadmap.md/logs.md references
4. Load settings from `orchestrator-settings.json` (or project override)
5. Pass via `--append-system-prompt` flag

**Agent prompt**: `agent-suffix.md` with `{{SESSION_ID}}` / `{{INSTRUCTION}}` substituted, passed via `--append-system-prompt`.

**Plugin prompts** (`agent-plugin/*.md`, `orchestrator-plugin/*.md`): same placeholder substitution rules as agent prompts.

