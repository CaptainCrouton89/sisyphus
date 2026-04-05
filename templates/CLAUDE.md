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
  - **Phase transitions use `yield --mode`:** `sisyphus yield --mode implementation --prompt "..."` loads impl guidance next cycle; `sisyphus yield --mode validation` loads validation guidance. The `--prompt` becomes the orchestrator's opening message for that cycle.
  - **Exploration agents produce focused artifacts** — one doc per concern, saved to `$SISYPHUS_SESSION_DIR/context/`. Downstream agents receive only relevant docs, not everything. Convention/pattern docs are highest-value: implementation agents that receive them write consistent code without re-exploring the codebase.
- **orchestrator-strategy.md** — Strategy-phase orchestrator guidance. Maps out visible stages, acknowledges constraints ahead, and establishes lifecycle ownership.
- **orchestrator-impl.md** — Implementation-phase orchestrator guidance. Context propagation from planning, code smell escalation, and verification patterns. Appended when `--mode implementation`.
- **orchestrator-validation.md** — Validation-phase orchestrator guidance. Emphasis on proving features work end-to-end via e2e recipes and operator agents for UI features.
- **orchestrator-completion.md** — Completion-phase orchestrator guidance. Appended when `--mode completion`.
  - **NEVER yield while waiting for user input** — yield kills the process and respawns a fresh instance with no memory of the conversation. Ask, then stop and wait.
  - **NEVER call `sisyphus complete` until the user explicitly confirms** — "looks good", "ship it", "approved", or equivalent.
  - **Feedback triage determines re-entry path:**
    - Minor (typo, rename, cosmetic) → fix in place, re-present, ask again. Stay in the conversation.
    - Moderate (bug, edge case, incomplete feature) → accumulate all items first, then yield once to `--mode implementation`. Don't yield per item.
    - Major (scope change, new feature, approach rethink) → update goal.md + strategy.md, yield to `--mode strategy`.
  - **Context refresh:** if minor-fix rounds run long, yield back to `--mode completion` with a progress summary — the fresh instance reads the summary to reconstruct state.
  - **Summary presentation:** write to `$SISYPHUS_SESSION_DIR/context/completion-summary.md`, display via `termrender --tmux`. Skip goal recap — focus on inflection points, divergences from plan, deferred gaps, and validation evidence.
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

