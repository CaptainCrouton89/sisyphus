# templates/

## Template Structure Rules

Before editing any orchestrator template, read `.claude/rules/orchestrator-template-structure.md`. It defines what belongs in `orchestrator-base.md` vs mode templates, and the deduplication contract between them — violating it causes the orchestrator to see contradictory or repeated guidance.

`orchestrator-base.md` is always prepended to the mode template. The orchestrator sees one continuous prompt and has no awareness of where the boundary is. "Above" is a valid reference; "the base prompt" is not.

## Template Placeholders

Two substitution timings — mixing them up causes silent failures:

- `{{SESSION_ID}}`, `{{INSTRUCTION}}`, `{{CONTEXT_DIR}}` — substituted at **spawn time** (when `sisyphus spawn` runs). `{{CONTEXT_DIR}}` becomes an `@`-reference, causing the agent to read context files at startup.
- `{{ORCHESTRATOR_MODES}}`, `{{AGENT_TYPES}}` — substituted at **template render time** (before the orchestrator pane launches). Only valid in `orchestrator-base.md`; `agent-plugin/*.md` and `orchestrator-plugin/*.md` support the spawn-time set only.

## `sisyphus:problem` Agent

Spawned from `orchestrator-discovery.md` only when the problem is nebulous — multiple valid framings, "done" undefined. Don't spawn for explicit goals, bug fixes, mechanical refactors, or questions you can ask yourself. Produces `context/problem.md`. `strategy.md` is generated via the **strategy skill** (invoked by the orchestrator) — there is no `orchestrator-strategy.md` template.

## `sisyphus report` vs `sisyphus submit`

These appear in agent templates, not orchestrator templates — the orchestrator uses `yield`/`complete`:

- **`sisyphus report`**: non-terminal — agent keeps running; use for mid-task flags
- **`sisyphus submit`**: terminal — pane closes immediately; use only for final completion

Using `submit` mid-task loses context permanently; using `report` for final completion leaves an idle pane consuming a slot.

## Cross-Template File Contracts

Files written in one mode and read in others — name/structure changes require updating all consumers:

- **`context/e2e-recipe.md`**: written during planning, self-verification reference for impl agents, executed step-by-step by validation agents. Must be concrete and executable — abstract descriptions break validation agents.
- **`context/` naming conventions**: `plan-stage-N-*.md`, `explore-*.md`, `requirements-*.md`. Agent instructions reference these names; renaming requires updating spawn instructions across templates.

## Implementation: One-Review-Pass, `/simplify`, and Cadence

`orchestrator-impl.md` prohibits a second review after fix agents land — fresh reviewers anchor on new code and produce noise; real regressions surface in e2e validation. Fix agents invoke `/simplify` before reporting (the orchestrator instructs this explicitly in spawn instructions).

Don't let more than 2–3 stages complete without e2e validation — unverified stages compound debugging cost. `sisyphus rollback <sessionId> <cycle>` rewinds state to a prior cycle boundary (impl mode only).

Spawn one plan lead per feature. Pre-splitting into domain-specific plan agents skips cross-domain synthesis (conflict resolution, gap detection). Only spawn multiple leads for features with zero shared files.

## Validation: Evidence Standard and Mode Constraints

**`sisyphus:operator` is required (not optional) for anything user-facing.** It uses `capture` for browser automation; type-checking cannot substitute.

Validation reports require captured evidence (command output, screenshots, HTTP responses). "Looks correct" / "should pass" / "appears to work" are not evidence — respawn with instructions to capture results.

**Do not attempt fixes in validation mode** beyond trivial issues (missed import, config typo). Fixes requiring design decisions or touching multiple files → `yield --mode implementation`.

## Completion Mode: Feedback Triage and `termrender`

User responses after summary follow a fixed triage — **Minor** (typo, cosmetic): fix in pane, re-present, confirm again. **Moderate** (bug, edge case): accumulate all items, then `yield --mode implementation`. **Major** (scope expansion, new feature): update `goal.md` + `strategy.md`, then `yield --mode discovery`.

Never call `sisyphus complete` until the user explicitly confirms. If the conversation runs long, yield back to completion mode with a progress summary.

`orchestrator-completion.md` calls `termrender --tmux` directly — not `sisyphus present`. Both render markdown in a tmux split, but completion uses the lower-level form because the orchestrator is already interactive.

## Planning-Mode CLI Commands

Only in `orchestrator-planning.md`:

- `sisyphus requirements <file> --wait` — opens requirements review TUI, **blocks** until user finishes, prints feedback to stdout. Without `--wait`, the TUI opens but the orchestrator continues without the user's feedback.
- `sisyphus design <file> --wait` — same for design documents
- `sisyphus requirements --export --session-id <id>` — renders `requirements.json` → markdown with no LLM tokens
