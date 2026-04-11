# templates/

## Template Placeholders

- `agent-suffix.md` / `agent-plugin/*.md` / `orchestrator-plugin/*.md`: `{{SESSION_ID}}`, `{{INSTRUCTION}}`, `{{CONTEXT_DIR}}` — substituted at **spawn time**. `{{CONTEXT_DIR}}` becomes an `@`-reference so the agent reads context files at startup.
- `orchestrator-base.md`: `{{ORCHESTRATOR_MODES}}`, `{{AGENT_TYPES}}` — injected at **template render time** (before the orchestrator pane launches), not at spawn time.

## orchestrator-completion.md

- **Never yield while waiting for user input** — yield kills the process and respawns a fresh instance with no memory. Ask, then stop.
- **Never call `sisyphus complete` until the user explicitly confirms** — "looks good", "ship it", "approved", or equivalent.

## `sisyphus report` vs `sisyphus submit`

- **`sisyphus report`**: non-terminal — agent keeps running; for mid-task flags (blockers, unexpected complexity)
- **`sisyphus submit`**: terminal — pane closes immediately; final completion only

## digest.json

4-field JSON at `$SISYPHUS_SESSION_DIR/digest.json`; displayed on TUI dashboard right panel. Update every cycle before yielding. TUI silently ignores malformed files.

```json
{
  "recentWork": "one sentence — what was just completed",
  "unusualEvents": ["array — agent crashes, autonomous decisions, scope changes; [] if nothing"],
  "currentActivity": "one sentence — what's happening now",
  "whatsNext": "one sentence — next predicted step"
}
```

## roadmap.md

Exactly four sections: **Current Stage** / **Exit Criteria** / **Active Context** / **Next Steps**. Nothing else belongs there.

Delete completed items entirely — no `[done]` markers, no check-offs. Completed work goes in the cycle log, not the roadmap.

## Cycle Logs

Write-only per cycle. The orchestrator never reads its own old logs — context docs and agent reports are the working memory. Logs exist for human audit only.

## Context File Resolution

When a question is answered: delete it from its listing section, then update the topical section to incorporate the answer as settled fact. Never annotate in place or create addendum/decisions files. Document should read as if the answer was always known. Applies universally: spec outputs, design docs, any context file.

## goal.md

Update when spec clarifies the real goal — the starting prompt is often vague. goal.md must reflect the current desired end state, not the fossilized original prompt.

## Phase Transitions

`sisyphus yield --mode <phase>` loads phase guidance for the next cycle. Known phases: `strategy`, `planning`, `implementation`, `validation`. Re-enter `--mode strategy` when the goal fundamentally shifts or the current approach is wrong — not just at session start.

## `sisyphus:spec` Agent

Handles product discovery **and** technical design in one session. Don't split into separate agents — synthesis of both is the point.

**Skip when:** pure bug fix with clear repro, mechanical refactor with no behavioral change, or starting prompt already has explicit acceptance criteria.

## e2e-recipe.md

Write to `context/e2e-recipe.md` before yielding to implementation. Ask the user if no concrete verification method is determinable — don't proceed without it.

## Plan Lead

Spawn **one plan lead per feature**. Pass inputs (requirements, design, context docs), not a pre-made structure. Pre-splitting (e.g. "backend plan" + "frontend plan") bypasses cross-domain conflict resolution. Split only for features with genuinely no shared files or integration points.

## Fix Agents

Pass the reviewer report path and triage notes — don't rewrite findings as line-by-line instructions. Exception: architectural constraints the agent wouldn't infer (specific method names, existing service locations).

## Critique / Backtrack Limits

- Critique rounds cap at 3 per stage — if more are needed, spawn a redesign.
- **Backtrack to planning when:** 2+ agents hit the same unexpected complexity, a dependency invalidates the approach, or fix agents keep patching the same area across cycles.

## Implementation State Recovery

- `sisyphus restart-agent <agentId>` — respawn a killed/failed agent in a new pane (preserves session)
- `sisyphus rollback <sessionId> <cycle>` — destructive; rewinds to a prior cycle boundary. For discarding an entire cycle, not individual agent failures.

## Planning CLI

```bash
sisyphus requirements <file> --wait              # launch requirements TUI, block until done, returns feedback to stdout
sisyphus design <file> --wait                    # launch design TUI, block until done, returns feedback to stdout
sisyphus requirements --export --session-id <id> # render requirements.json → requirements.md (no LLM tokens)
```

`--wait` implies `--pane` — your pane stays visible; no polling needed.
