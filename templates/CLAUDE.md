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

## strategy.md vs roadmap.md

Two separate files, different jobs — confusing them breaks orchestration:
- **strategy.md**: shape of work across stages (Completed / Current Stage / Ahead). Updated only when the approach or goal changes.
- **roadmap.md**: cycle-to-cycle progress *within* the current stage (Current Stage, Exit Criteria, Active Context, Next Steps). Updated every few cycles.

## Planning Artifacts Convention

All planning outputs go to `$SISYPHUS_SESSION_DIR/context/` — exploration docs, spec outputs, stage plans, and `e2e-recipe.md`. Downstream agents receive only the context files relevant to their task, not the whole directory.

## e2e-recipe.md Is Required Before Implementation

Write the verification recipe to `context/e2e-recipe.md` before transitioning to implementation. If no concrete verification method is determinable, ask the user — don't proceed without it. Both implementation agents and the final validation agent reference this file.

## Plan Lead Anti-Pattern

Spawn **one plan lead per feature** — don't pre-split into domain agents (e.g. "backend plan agent" + "frontend plan agent"). The synthesis step that catches cross-domain conflicts and gaps only happens inside the plan lead. Split plan leads only for features with genuinely no shared files or integration points.

## Fix Agents Get the Report Path

When spawning fix agents after a critique cycle, pass the reviewer report path and triage notes — don't rewrite findings as line-by-line instructions. The agent reads the report, understands the codebase, and decides the fix. Exception: architectural constraints the agent wouldn't know (specific method names, existing service locations).

## Critique Accumulation Cap

Don't let more than 2–3 implementation stages complete without critique or validation. The failure mode isn't occasionally skipping a review — it's implementing six stages in a row and discovering compounding issues at the end.

- Critique rounds cap at 3. If 3+ rounds are needed, the approach needs rethinking — spawn a redesign, don't keep patching.
- Instruct implementation agents to **stop and report** when they hit unexpected complexity rather than work around it. A clear problem description is more actionable than a brittle implementation that hides the issue.

## Backtrack Triggers (Implementation → Planning)

Yield back to planning mode when any of these occur — don't keep pushing:
- 2+ agents report the same unexpected complexity in the same subsystem
- An agent discovers a dependency that invalidates the current approach
- Fix agents keep patching the same area across multiple cycles

```bash
sisyphus yield --mode planning --prompt "Re-evaluate: <what was discovered> — write cycle log"
```

Document the finding in the cycle log before yielding. Update `roadmap.md` to reflect the regression.

## Implementation State Recovery

```bash
sisyphus restart-agent <agentId>   # respawn a killed/failed agent in a new pane (preserves session)
sisyphus rollback <sessionId> <cycle>  # rewind state to a prior cycle boundary
```

`rollback` is destructive — use it when an entire cycle's work needs to be discarded, not for individual agent failures.

## `sisyphus requirements/design --wait` Returns Feedback to stdout

`sisyphus requirements <file> --wait` and `sisyphus design <file> --wait` open the review TUI in a separate tmux window and **block until the user finishes**, printing their feedback to stdout. The calling agent reads that output directly — no polling or separate IPC needed.
