# templates/

## orchestrator-completion.md Constraints

- **NEVER yield while waiting for user input** — yield kills the process. Ask, then stop.
- **NEVER call `sisyphus complete` until the user explicitly confirms** — "looks good", "ship it", "approved", or equivalent.

## Agent Prompt Rendering

- `agent-suffix.md` uses `{{SESSION_ID}}` / `{{INSTRUCTION}}` / `{{CONTEXT_DIR}}` placeholders — substituted at spawn time via `--append-system-prompt`
- `{{CONTEXT_DIR}}` injected as `@`-reference so agent reads context files at startup. Plugin prompts (`agent-plugin/*.md`, `orchestrator-plugin/*.md`) follow the same rules.

## `sisyphus report` vs `sisyphus submit`

- **`sisyphus report`**: non-terminal — agent keeps running; for mid-task flags (blockers, unexpected complexity)
- **`sisyphus submit`**: terminal — pane closes immediately; final completion only

## Session Directory Files

`goal.md`, `strategy.md`, and `roadmap.md` live at `$SISYPHUS_SESSION_DIR/` — not in `context/`. Planning outputs (exploration docs, spec outputs, stage plans `plan-stage-N-*.md`, `e2e-recipe.md`) go to `$SISYPHUS_SESSION_DIR/context/`. Pass downstream agents only the context files relevant to their task.

- **`strategy.md`**: Completed / Current Stage / Ahead. Update when the **shape** changes, not every cycle — triggers: goal crystallizes/shifts, a stage completes, or the approach is wrong. Revise if it exists; don't start from scratch.
- **`roadmap.md`**: four sections — current stage, exit criteria, active context references, next steps. Updated every cycle; decisions fold into context docs.

## Phase Transitions

`sisyphus yield --mode <phase>` loads phase-specific orchestrator guidance. Omitting `--mode` loads no guidance. Known phases: `strategy`, `planning`, `implementation`, `validation`.

Re-enter `--mode strategy` mid-session when the goal fundamentally shifts or the current approach is wrong — not just at session start.

## `sisyphus:spec` Agent

Handles product discovery **and** technical design in one interactive session. Don't split into separate agents — synthesizes both.

**Skip spec when:** pure bug fix with clear repro steps, mechanical refactor with no behavioral change, or starting prompt already contains explicit detailed acceptance criteria.

Spec docs are authoritative — when reviews or exploration resolve open questions, update `requirements.md`/`design.md` directly (delete resolved questions, update topical sections). Never create addendum files alongside them.

## e2e-recipe.md Required Before Implementation

Write to `context/e2e-recipe.md` before yielding to implementation. If no concrete verification method is determinable, ask the user — don't proceed without it.

## Small Task Shortcut

1–3 files, single domain: skip all phases. Roadmap is a short checklist (diagnose → fix → validate). Single plan agent, single implement agent.

## Plan Lead Anti-Pattern

Spawn **one plan lead per feature** — pre-splitting into domain agents skips the synthesis step that catches cross-domain conflicts. Split only for features with genuinely no shared files or integration points.

## Fix Agents Get the Report Path

Pass the reviewer report path and triage notes — don't rewrite findings as line-by-line instructions. Exception: architectural constraints the agent wouldn't know (specific method names, existing service locations).

## Critique Accumulation Cap

Cap at 2–3 implementation stages without critique. Critique rounds cap at 3 — if 3+ rounds are needed, spawn a redesign.

## Backtrack Triggers (Implementation → Planning)

Yield back to planning when: 2+ agents report the same unexpected complexity in the same subsystem; a dependency invalidates the current approach; fix agents keep patching the same area across cycles. Document before yielding; update `roadmap.md`.

## Implementation State Recovery

- `sisyphus restart-agent <agentId>` — respawn a killed/failed agent in a new pane (preserves session)
- `sisyphus rollback <sessionId> <cycle>` — destructive; rewinds to a prior cycle boundary. For discarding an entire cycle, not individual agent failures.

## Planning CLI Reference

```bash
sisyphus requirements <file> --wait    # launch requirements TUI, block until done, returns feedback to stdout
sisyphus design <file> --wait          # launch design TUI, block until done, returns feedback to stdout
sisyphus requirements --export --session-id <id>  # render requirements.json → requirements.md (no LLM tokens)
```

`--wait` implies `--pane` — your pane stays visible; no polling needed.
